/**
 * Server-render tests for the composer's session-cost entry (node:test +
 * react-dom/server).
 *
 * `tests/session-cost.test.ts` pins the arithmetic and the plan the two shipped
 * surfaces receive; `tests/session-cost-display.test.ts` pins the injection
 * itself. These pin what the ENTRY renders on its own — a hidden scope marker
 * and nothing else — plus, the load-bearing half, that every unpriceable state
 * is a quiet null rather than a crash: the renderer contains a render crash by
 * ABDICATING the entry, so a throw here would remove the figure with no visible
 * error at all.
 *
 * Server rendering runs no effects, so nothing is injected here. That is exactly
 * why a missing seat or an unknown model must be a null rather than a throw.
 *
 * The CSS-module loader hook is registered before the React tree is imported
 * (`@deepseek-ai/dsh-client-ui-primitives` imports `*.module.css`), so the
 * component import below is dynamic on purpose.
 */

import { register } from 'node:module'

register(new URL('./_css-module-loader.mjs', import.meta.url).href)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement, useEffect, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { createSnapshotStore } from '../src/client/snapshot-store.ts'
import type { SnapshotStore } from '../src/client/snapshot-store.ts'
import type { SessionCostPricesState } from '../src/client/prices.ts'
import type { CommandCodePriceTable } from '../src/usage-wire.ts'

const { CommandCodeSessionCost } = await import('../src/client/session-cost-view.tsx')
type SessionCostInjected = import('../src/client/session-cost-view.tsx').SessionCostInjected

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TABLE: CommandCodePriceTable = {
  models: [
    { id: 'vendor/model-a', slug: 'model-a', inputCost: 3, outputCost: 15, cacheReadCost: 0.3, cacheWriteCost: 3.75 },
    // The common case: the pricing page publishes no cache-write rate, so those
    // tokens have no price at all and the dialog must say so.
    { id: 'vendor/model-c', slug: 'model-c', inputCost: 0.15, outputCost: 0.6, cacheReadCost: 0.003 },
    { id: 'vendor/free-model', slug: 'free-model', inputCost: 0, outputCost: 0, cacheReadCost: 0, free: true },
  ],
  peakHours: [[1, 4], [6, 10]],
}

const USAGE = {
  uncachedInputTokens: 1_000_000,
  outputTokens: 100_000,
  cacheReadTokens: 2_000_000,
  cacheWriteTokens: 200_000,
}

const SELECTION = {
  lastUsed: { provider: 'commandcode', model: 'vendor/model-a' },
  next: { provider: 'commandcode', model: 'vendor/model-a' },
}

/** A ready price-table store. */
function readyStore(table: CommandCodePriceTable = TABLE): SnapshotStore<SessionCostPricesState> {
  return createSnapshotStore<SessionCostPricesState>({ status: 'ready', table, error: undefined })
}

/** The projection reader the composer supplies, over fixed seats. */
function projectionHook(seats: Record<string, unknown>) {
  return ((key: string, selector?: (value: unknown) => unknown) => {
    const value = seats[key]
    return selector === undefined ? value : selector(value)
  }) as never
}

/** A selector hook over a snapshot store (stand-in for the framework's). */
function selectorHook<T>(store: SnapshotStore<T>): <S>(select: (snapshot: T) => S) => S {
  return <S,>(select: (snapshot: T) => S): S => {
    const [value, setValue] = useState<S>(() => select(store.getSnapshot()))
    useEffect(() => {
      const sync = (): void => setValue(select(store.getSnapshot()))
      sync()
      return store.subscribe(sync)
    }, [store])
    return value
  }
}

/**
 * Turn an inject face into the props a component actually receives, exactly as
 * the renderer does: reproduce `bindInjectSources` (ui-renderer
 * `lib/client.js`), which destructures the `hooks` compartment OUT of the face
 * and re-exposes each member as a `use<Name>` selector prop. A component that
 * reads `props.hooks.*` — the bug that shipped the sidebar row invisible — fails
 * these tests loudly instead of failing silently in the browser.
 */
function bindFace(face: SessionCostInjected): Record<string, unknown> {
  const { hooks, ...rest } = face
  const bound: Record<string, unknown> = { ...rest }
  for (const [name, store] of Object.entries(hooks)) {
    bound[`use${name[0]!.toUpperCase()}${name.slice(1)}`] = selectorHook(store as SnapshotStore<unknown>)
  }
  return bound
}

/** The component's props: the bound face plus the composer's projection seat. */
function props(options: {
  store?: SnapshotStore<SessionCostPricesState>
  seats?: Record<string, unknown>
  projection?: unknown
} = {}): object {
  const bound = bindFace({ hooks: { commandCodePrices: options.store ?? readyStore() } })
  // `in` rather than a truthiness check: passing `projection: undefined` is how
  // a test asks for the seat to be ABSENT, which is the case under test.
  const projection = 'projection' in options
    ? options.projection
    : projectionHook(options.seats ?? { tokenUsage: USAGE, modelSelection: SELECTION })
  return { ...bound, useProjection: projection }
}

/** Render the entry to static markup. */
function render(componentProps: object): string {
  return renderToStaticMarkup(createElement(CommandCodeSessionCost as never, componentProps as never))
}

/** Every rendered surface is English by construction. */
function assertEnglish(markup: string): void {
  assert.equal(/[\u4e00-\u9fff]/.test(markup), false, `the entry must render in English, got: ${markup}`)
}

// ---------------------------------------------------------------------------
// What it renders: a hidden marker, and no surface of its own
// ---------------------------------------------------------------------------

test('the entry renders only the hidden scope marker', () => {
  const markup = render(props())
  // The cost is injected INTO the shipped token pill and usage dialog by
  // `session-cost-display.ts`; the entry itself contributes the node the
  // injection scopes itself by, and nothing a reader can see.
  assert.match(markup, /data-ccp-session-cost-anchor/)
  assert.match(markup, /display:none/)
  assert.equal(
    markup.replace(/<[^>]*>/g, ''),
    '',
    'the entry owns no visible text — the cost is injected into the shipped stats row',
  )
  assert.equal(/ccp-cost/.test(markup), false, 'no plugin-owned chrome reaches the DOM any more')
  assertEnglish(markup)
})

test('the plugin-owned breakdown panel is gone from the module', async () => {
  // The per-bucket breakdown now lives in the harness's own usage dialog, so the
  // hand-rolled popover must not linger as an export for anyone to revive.
  const view = await import('../src/client/session-cost-view.tsx')
  assert.equal('SessionCostPanel' in view, false, 'the breakdown belongs to the shipped dialog now')
})

test('a free model and a multi-model session are still worth a marker', () => {
  // Both are priceable (the shipped row shows `Free`, and an `≈` total is a real
  // figure), so the entry must mount for them just as it does for a priced one.
  const free = render(props({
    seats: {
      tokenUsage: USAGE,
      modelSelection: {
        lastUsed: { provider: 'commandcode', model: 'vendor/free-model' },
        next: { provider: 'commandcode', model: 'vendor/free-model' },
      },
    },
  }))
  const approximate = render(props({
    seats: {
      tokenUsage: USAGE,
      modelSelection: {
        lastUsed: { provider: 'commandcode', model: 'vendor/model-a' },
        next: { provider: 'commandcode', model: 'vendor/free-model' },
      },
    },
  }))
  for (const markup of [free, approximate]) assert.match(markup, /data-ccp-session-cost-anchor/)
})

// ---------------------------------------------------------------------------
// What must render NOTHING
// ---------------------------------------------------------------------------

test('a price table that has not landed renders nothing', () => {
  const idle = createSnapshotStore<SessionCostPricesState>({ status: 'idle', table: undefined, error: undefined })
  assert.equal(render(props({ store: idle })), '')
})

test('another provider\u2019s session renders nothing', () => {
  const markup = render(props({
    seats: { tokenUsage: USAGE, modelSelection: { lastUsed: { provider: 'deepseek', model: 'vendor/model-a' }, next: null } },
  }))
  assert.equal(markup, '')
})

test('a model outside the table renders nothing', () => {
  const markup = render(props({
    seats: {
      tokenUsage: USAGE,
      modelSelection: {
        lastUsed: { provider: 'commandcode', model: 'vendor/unpriced' },
        next: { provider: 'commandcode', model: 'vendor/unpriced' },
      },
    },
  }))
  assert.equal(markup, '')
})

test('a session with no usage yet renders nothing', () => {
  assert.equal(render(props({ seats: { tokenUsage: undefined, modelSelection: SELECTION } })), '')
})

test('a missing projection seat renders nothing and says so once, never crashing', () => {
  // The renderer answers a render crash by ABDICATING the entry, which is
  // invisible; a dsh that does not supply the seat must therefore be a null
  // plus a diagnosable console line.
  const errors: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '))
  }
  try {
    assert.equal(render(props({ projection: undefined })), '')
  } finally {
    console.error = original
  }
  assert.equal(errors.length, 1)
  assert.match(errors[0]!, /session-cost readout needs/)
})

test('a missing price-table hook renders nothing rather than throwing', () => {
  // Only the composer's own seat, no bound hook: the guard must cover both.
  const markup = render({ useProjection: projectionHook({ tokenUsage: USAGE, modelSelection: SELECTION }) })
  assert.equal(markup, '')
})
