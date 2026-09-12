/**
 * Client-boot integration tests (node:test). Run with `npm test`.
 *
 * These drive the *real* `apply()` from `src/client/index.ts` against a Cordis
 * context that mirrors the DSH 0.1.2 (rc.1) client assembly, and assert that
 * every browser UI surface registers:
 *
 *   - the "Command Code" settings page (`settings.section`, id `commandcode`),
 *   - the Models-page provider card (`settings.models.provider-card`,
 *     key `llm-commandcode`),
 *   - the plans & quota panel: the sidebar footer card
 *     (`sidebar.footer.action`, id `commandcode-panel`) and the center-column
 *     dashboard it selects (`main`, key `commandcode-panel`).
 *
 * The registration is gated by `remote.credentials`: DSH 0.1.2 (rc.1) exposes
 * credentials through a Typert Remote namespace, and the plugin waits on
 * `ctx.inject(['remote.credentials'], ...)` before mounting the surfaces. This
 * is exactly the suspicion raised in GitHub issue #15 (that alpha2 "does not
 * mount a `credentials` remote namespace", so the surfaces never register).
 * These tests prove the opposite for the real alpha2 assembly: mounting the
 * `credentials` remote contribution lets both surfaces register.
 *
 * Because `src/client/index.ts` statically imports the React component tree
 * (which imports `*.module.css` from `@deepseek-ai/dsh-client-ui-primitives`),
 * the CSS-module loader is registered first and the module is imported
 * dynamically. The boot helper under test is otherwise the authentic `apply`.
 */

import { register } from 'node:module'

// Present *.module.css as empty modules BEFORE the React tree is imported.
// (Static imports hoist above this call, so `apply` must be loaded dynamically.)
register(new URL('./_css-module-loader.mjs', import.meta.url).href)

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { Context } from '@deepseek-ai/cordis'
// `apply`/`inject` pull the React component tree in (via `section.tsx` /
// `card.tsx`), which imports `*.module.css` from dsh-client-ui-primitives.
// Static imports hoist above the `register()` call above, so load this one
// dynamically — only then is the CSS-module loader in effect.
const { apply, inject } = await import('../src/client/index.ts')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A bound settings scope whose value/user layers we control directly. */
function makeScope() {
  const state = {
    status: 'ready' as const,
    value: {} as Record<string, unknown>,
    user: undefined as Record<string, unknown> | undefined,
    base: undefined as Record<string, unknown> | undefined,
    revision: 1,
    writable: true,
    mode: 'host' as const,
  }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    async set(field: string, value: unknown) {
      state.value = { ...state.value, [field]: value }
      state.user = { ...(state.user ?? {}), [field]: value }
      for (const fn of listeners) fn()
    },
    async unset(field: string) {
      const next = { ...state.value }
      delete next[field]
      state.value = next
      for (const fn of listeners) fn()
    },
  }
}

/**
 * Boot the real plugin `apply()` on a fresh Cordis root provisioned with the
 * DSH 0.1.2 (rc.1) service set: `remote` (mounting the `credentials` and
 * `commandcode` namespaces), `slots`, `locale`, `settingsScope`, `connection`.
 *
 * @param options - whether to mount the `credentials` remote namespace. When
 *   `false`, the plugin must not register any surface (it parks on the
 *   `inject(['remote.credentials'])` gate). `failInjectOn` makes the `slots`
 *   stub throw for one slot key, standing in for a registration the real
 *   runtime refuses.
 * @returns the registered slot surfaces, keyed by `id` (settings.section) or
 *   `key` (provider-card), after boot settles.
 */
async function boot({ mountCredentials = true, failInjectOn }: { mountCredentials?: boolean; failInjectOn?: string } = {}) {
  const ctx = new Context()

  // A faithful stand-in for the api-gateway `ClientRemoteService`: mounting a
  // contribution installs each namespace as a Cordis `remote.<ns>` service, so
  // `inject(['remote.credentials'])` resolves exactly as it does in alpha2.
  ctx.provide('remote', {
    async $mount(contribution: { package: string; descriptors: Array<{ namespace: string; method: string }> }) {
      const groups = new Map<string, Array<{ method: string }>>()
      for (const descriptor of contribution.descriptors) {
        const group = groups.get(descriptor.namespace) ?? []
        group.push(descriptor)
        groups.set(descriptor.namespace, group)
      }
      for (const [ns, descriptors] of groups) {
        await ctx.plugin({
          name: `remote.${ns}`,
          apply(c: Context) {
            const service: Record<string, unknown> = {}
            for (const descriptor of descriptors) {
              service[descriptor.method] = async (..._args: unknown[]) => ({ ok: true, value: undefined })
            }
            c.provide(`remote.${ns}`, service)
          },
        })
      }
      return async () => {}
    },
    $on(_event: string, _listener: () => void) {
      return () => {}
    },
  })

  await ctx.get<{ $mount: (c: { package: string; descriptors: Array<{ namespace: string; method: string }> }) => Promise<() => void> }>('remote')!.$mount({
    package: 'boot',
    descriptors: [
      // The credentials namespace (dsh-api-settings-controller in alpha2).
      ...(mountCredentials ? [{ namespace: 'credentials', method: 'describe' }] : []),
      // The plugin's own report/models/login namespace (mounted below).
      { namespace: 'commandcode', method: 'report' },
    ],
  })

  ctx.provide('connection', {})
  ctx.provide('locale', {
    register: () => () => {},
    bind: (ns: string) => (key: string) => `${ns}:${key}`,
    getLocale: () => ({ active: 'en' }),
  })
  ctx.provide('settingsScope', { bind: () => makeScope() })

  const registered = new Map<string, { name: string; label?: string | (() => string) }>()
  /** Every registration in call order — the `main` cell and the footer card
   *  deliberately share one panel id, so the keyed map alone cannot tell them
   *  apart. */
  const surfaces: Array<{
    name: string
    id?: string
    key?: string
    order?: number
    label?: string | (() => string)
    inject?: () => object
  }> = []
  ctx.provide('slots', {
    inject(name: string, fn: () => void) {
      if (name === failInjectOn) throw new Error(`slots-inject-refused:${name}`)
      fn()
    },
    register(
      options: {
        id?: string
        key?: string
        name: string
        order?: number
        label?: string | (() => string)
        inject?: () => object
      },
      _component: unknown,
    ) {
      surfaces.push(options)
      registered.set(options.id ?? options.key!, options)
      return () => {}
    },
  })

  await ctx.plugin({
    name: 'plugin',
    inject,
    apply(c: Context) {
      return apply(c)
    },
  })
  // The `inject(['remote.credentials'])` gate, the plugin's own async remote
  // mount, and the controller's fire-and-forget describe all settle on the
  // macrotask queue (cordis wakes a parked inject fiber on a timer tick, not on
  // a `setImmediate`), so flush a few timer rounds before asserting.
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))

  return { registered, surfaces }
}

// ---------------------------------------------------------------------------
// Client boot
// ---------------------------------------------------------------------------

test('app registers the settings page and Models provider card when remote.credentials is mounted', async () => {
  const { registered } = await boot()

  // The "Command Code" settings page: a `settings.section` entry id `commandcode`.
  assert.equal(registered.has('commandcode'), true, 'settings.section id commandcode should register')
  assert.equal(
    registered.get('commandcode')!.name,
    'settings.section',
    'the registered surface should be the settings section',
  )

  // The Models-page provider card for the `commandcode` adapter family.
  assert.equal(registered.has('llm-commandcode'), true, 'settings.models.provider-card key llm-commandcode should register')
  assert.equal(
    registered.get('llm-commandcode')!.name,
    'settings.models.provider-card',
    'the registered surface should be the provider card',
  )
})

test('app registers both halves of the sidebar plans & quota panel', async () => {
  const { surfaces } = await boot()

  // The sidebar footer card: the list the shell renders in the sidebar's foot
  // area directly above the Settings seat. It carries no `label` — unlike a
  // `sidebar.panellist` row, the shell wraps this entry in no chrome at all, so
  // the component owns its own title (and, with it, the live plan/quota text).
  const cards = surfaces.filter((surface) => surface.name === 'sidebar.footer.action')
  assert.equal(cards.length, 1, 'the panel contributes exactly one footer card')
  assert.equal(cards[0]!.id, 'commandcode-panel')
  assert.equal(cards[0]!.label, undefined, 'a footer action owns its own surface, so it declares no label')
  assert.equal(cards[0]!.order, 1, 'order 1 sorts this card after the default-0 footer actions, next to Settings')
  assert.equal(
    surfaces.some((surface) => surface.name === 'sidebar.panellist'),
    false,
    'the panel must not also claim a global panel row at the top of the column',
  )

  // The `main` cell the card opens. `ctx.layout.selectPanel(id)` resolves the
  // card's id against this registry and throws when nothing occupies it, so the
  // card is only a working navigation entry when BOTH halves exist under the
  // SAME id.
  const cells = surfaces.filter((surface) => surface.name === 'main')
  assert.equal(cells.length, 1, 'exactly one main-panel cell is contributed')
  assert.equal(cells[0]!.key, cards[0]!.id, 'the main cell and the footer card share one panel id')

  // BOTH halves need the inject face: an entry registered without one receives
  // none of the panel's data, which is why the dashboard rendered nothing on a
  // revision that gave `inject` only to the sidebar surface.
  for (const surface of [cards[0]!, cells[0]!]) {
    assert.equal(typeof surface.inject, 'function', `${surface.name} must carry its inject face`)
    const face = surface.inject!() as { hooks?: Record<string, unknown>; refresh?: unknown; startAutoRefresh?: unknown; open?: unknown }
    assert.deepEqual(
      Object.keys(face.hooks ?? {}).sort(),
      ['commandCodeSettings', 'commandCodeUsage'],
      `${surface.name} injects both snapshot stores`,
    )
    assert.equal(typeof face.refresh, 'function', `${surface.name} can refresh`)
    assert.equal(typeof face.startAutoRefresh, 'function', `${surface.name} can start the shared poll`)
    assert.equal(typeof face.open, 'function', `${surface.name} can select its own panel`)
  }
})

test('app registers the composer session-cost entry, which injects into the shipped stats row', async () => {
  const { surfaces } = await boot()

  // The entry renders NO surface of its own: the cost is injected into the
  // harness's own token-usage pill and usage dialog (see
  // `session-cost-display.ts`). It must still register under a NEW id, because
  // reusing the shipped `stats` id puts this entry in THAT cell, REPLACING the
  // tokens / cache-hit / throughput readout instead of injecting into it.
  const docks = surfaces.filter((surface) => surface.name === 'conversation.composer.dock')
  assert.equal(docks.length, 1, 'the feature contributes exactly one dock entry')
  assert.equal(docks[0]!.id, 'commandcode-session-cost')
  assert.notEqual(docks[0]!.id, 'stats', 'the shipped stats cell must keep its own id')
  assert.equal(
    docks[0]!.order,
    undefined,
    'a null-rendering entry has no position among the dock rows, so it declares no order',
  )
  assert.equal(docks[0]!.label, undefined, 'the entry owns no surface, so it declares no label')
  assert.equal(
    'key' in docks[0]!,
    false,
    'a list slot is addressed by id, not by key',
  )

  // Its inject face carries ONLY the price table: the token buckets and the
  // model selection arrive from the composer itself as standard dock props, not
  // through this registration.
  assert.equal(typeof docks[0]!.inject, 'function', 'the entry must carry its inject face')
  const face = docks[0]!.inject!() as { hooks?: Record<string, unknown> }
  assert.deepEqual(Object.keys(face.hooks ?? {}), ['commandCodePrices'])
})

test('a refused panel registration cannot take the other surfaces down with it', async () => {
  // `slots.inject` rethrows a callback failure synchronously once the
  // declaration exists, so an unguarded failure in ONE of the panel's two
  // registrations would abort `applyClientSurfaces` — silently removing the
  // footer card (or the dashboard cell) even though the other was fine. The
  // settings page registering after the failure is the observable proof that
  // execution continued.
  const original = console.error
  const logged: unknown[] = []
  console.error = (...args: unknown[]) => { logged.push(args[0]) }
  let surfaces
  try {
    ({ surfaces } = await boot({ failInjectOn: 'main' }))
  } finally {
    console.error = original
  }

  const names = surfaces.map((surface) => surface.name)
  assert.ok(names.includes('sidebar.footer.action'), 'the footer card still registers')
  assert.equal(names.includes('main'), false, 'the refused cell is absent')
  assert.ok(names.includes('settings.section'), 'later surfaces still register')
  assert.deepEqual(logged, ['[dsh-commandcode-provider] could not register the plans & quota panel:'], 'and the failure is loud')
})

test('app registers no surface when remote.credentials is absent (the alpha2 gate holds)', async () => {
  // Without the credentials namespace the plugin parks on
  // `inject(['remote.credentials'])` and must not register either surface —
  // the legacy `connection.api.credentials` adapter also stays inactive here.
  const { registered } = await boot({ mountCredentials: false })

  assert.deepEqual([...registered.keys()], [], 'no surface should register without remote.credentials')
})

test('the client apply takes exactly the alpha2 service identities', () => {
  assert.deepEqual(inject, ['slots', 'locale', 'connection', 'remote', 'settingsScope'])
})
