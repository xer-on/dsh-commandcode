/**
 * Render tests for the plans & quota panel (node:test + react-dom/server).
 *
 * `tests/panel.test.ts` pins the view model; these pin that the two React
 * surfaces actually put it on screen — the sidebar footer card's two quota bars
 * and spend line, and the dashboard's account facts, monthly bar and account
 * tabs. Server rendering needs no DOM, so the components run end to end without
 * a browser.
 *
 * The English assertion is the load-bearing one for this surface: the panel is
 * specified to read in English even on a Chinese harness, so a regression that
 * routed its copy back through the locale namespace must fail here. Every test
 * repeats that check over the whole rendered markup.
 *
 * As in `client-boot.test.ts`, the CSS-module loader hook is registered before
 * the React tree is imported (`@deepseek-ai/dsh-client-ui-primitives` imports
 * `*.module.css`), so the component imports below are dynamic on purpose.
 */

import { register } from 'node:module'

register(new URL('./_css-module-loader.mjs', import.meta.url).href)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement, useEffect, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { createSnapshotStore } from '../src/client/snapshot-store.ts'
import type { SnapshotStore } from '../src/client/snapshot-store.ts'
import type { UsagePageState } from '../src/client/usage.ts'
import type { SettingsPageState } from '../src/client/settings.ts'

const { CommandCodeFooterEntry, CommandCodePanel } = await import('../src/client/panel-view.tsx')
type PanelInjected = import('../src/client/panel-view.tsx').PanelInjected
type PanelComponentProps = import('../src/client/panel-view.tsx').PanelComponentProps

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A usage snapshot: one serving account, Go plan, 25% of the 5-hour window used. */
function usageState(overrides: Partial<UsagePageState> = {}): UsagePageState {
  return {
    status: 'ready',
    fetchedAt: 1_800_000_000_000,
    error: undefined,
    report: {
      accounts: [
        {
          id: 'default',
          label: 'Default account',
          configured: true,
          active: true,
          mark: '',
          cooldownUntil: 0,
          report: {
            account: { id: 'acct_1', name: 'Personal', userName: 'rifat' },
            plan: {
              planId: 'individual-go',
              name: 'Go',
              status: 'active',
              monthlyCredits: 20,
              currentPeriodEnd: 1_800_000_000_000,
            },
            credits: {
              // `plan.monthlyCredits` is the period's LIMIT and this is what is
              // LEFT of it, so the monthly bar reads $12.00 / $20.00 = 60%.
              monthlyCredits: 8,
              purchasedCredits: 5,
              freeCredits: 1,
              fiveHour: { used: 50, cap: 200, exceeded: false, resetAt: 1_800_000_000_000 },
              weekly: { used: 80, cap: 400, exceeded: false, resetAt: 1_800_000_000_000 },
            },
            usage: {
              totalCount: 12,
              totalCost: 0.4321,
              successRate: 99.9655,
              completedCount: 10,
              failedCount: 2,
              totalTokensIn: 1_500_000,
              totalTokensOut: 250_000,
              totalCredits: 0.5,
              periodBasis: 'billing-period',
            },
            failures: [],
          },
        },
      ],
    },
    ...overrides,
  }
}

/**
 * The settings snapshot the panel reads. `SettingsPageState` is the page's
 * whole face, but the panel touches exactly two of its fields (the credential
 * fact and the removal staging), so the rest is cast away here rather than
 * restated — the panel's contract with the settings controller is those two.
 */
function settingsState(anyAccountConfigured: boolean, accountsRemoving: string[] = []): SettingsPageState {
  return { anyAccountConfigured, accountsRemoving } as unknown as SettingsPageState
}

/** The inject face a registration returns, over fixed snapshots. */
function face(usage: UsagePageState, configured = true, removing: string[] = []): PanelInjected {
  return {
    hooks: {
      commandCodeUsage: createSnapshotStore(usage),
      commandCodeSettings: createSnapshotStore(settingsState(configured, removing)),
    },
    refresh: () => {},
    startAutoRefresh: () => () => {},
  }
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
 * the renderer does.
 *
 * Reproduces `bindInjectSources` (ui-renderer `lib/client.js`): it destructures
 * the `hooks` compartment OUT of the face and re-exposes each member as a
 * `use<Name>` selector prop. Reproducing the transform here is the whole point
 * of this helper: a component that reads `props.hooks.*` — the real bug that
 * made the sidebar row vanish with no error, because the slot renderer
 * contains a render crash by abdicating the entry — fails these tests loudly
 * instead of failing silently in the browser.
 */
function bindFace(faceValue: PanelInjected): PanelComponentProps {
  const { hooks, ...rest } = faceValue
  const bound: Record<string, unknown> = { ...rest }
  for (const [name, store] of Object.entries(hooks)) {
    bound[`use${name[0]!.toUpperCase()}${name.slice(1)}`] = selectorHook(store as SnapshotStore<unknown>)
  }
  return bound as PanelComponentProps
}

/** The sidebar footer card's props: the bound face plus the shell's fold state. */
function footerProps(usage: UsagePageState, wide = true, configured = true): object {
  return { ...bindFace(face(usage, configured)), wide }
}

/** Render one surface to static markup. */
function render(component: (props: never) => unknown, props: object): string {
  return renderToStaticMarkup(createElement(component as never, props as never))
}

/** Every rendered surface must be free of Chinese copy. */
function assertEnglish(markup: string): void {
  assert.equal(/[\u4e00-\u9fff]/.test(markup), false, `the panel must render in English, got: ${markup}`)
}

// ---------------------------------------------------------------------------
// The sidebar footer card
// ---------------------------------------------------------------------------

test('the footer card renders from the framework-bound useX seats', () => {
  const markup = render(CommandCodeFooterEntry, footerProps(usageState()))

  assert.match(markup, /<svg/, 'the quota ring renders')
  assert.match(markup, /ccp-glyph/)
  assert.match(markup, /ccp-foot"/, 'the entry owns its own button')
  assert.match(markup, /Command Code/)
  assertEnglish(markup)
})

test('the footer card would crash if it read a raw hooks bag (the abdication bug)', () => {
  // The face as the registration RETURNS it — with `hooks` and without the
  // bound `useX` seats. Rendering a component against this is what the
  // renderer would have done had it passed the face through verbatim: the
  // component must not depend on either shape being present by accident.
  const raw = { ...face(usageState()), wide: true } as unknown as object
  assert.throws(
    () => render(CommandCodeFooterEntry, raw),
    TypeError,
    'reading props.hooks.commandCodeUsage must fail loudly, not render nothing',
  )
})

test('the footer card shows each window\u2019s own spend and limit', () => {
  const markup = render(CommandCodeFooterEntry, footerProps(usageState()))

  assert.match(markup, /5-hour/, 'the tighter window leads')
  assert.match(markup, /\$50\.00 \/ \$200\.00/, 'the 5-hour spend is rendered, not just tooltipped')
  assert.match(markup, /25%/)
  assert.match(markup, /Weekly/, 'the weekly window follows')
  assert.match(markup, /\$80\.00 \/ \$400\.00/, 'and so is the weekly spend')
  assert.match(markup, /20%/)
  assert.equal(markup.includes('ccp-footAmount'), true, 'the amounts have their own seat')
  // The tooltip doubles as the accessible name and carries every figure,
  // including the period total the card does not draw its own row for.
  assert.match(
    markup,
    /aria-label="Command Code · Go · 5-hour \$50\.00 \/ \$200\.00 \(25%\) · Weekly \$80\.00 \/ \$400\.00 \(20%\) · Spend \$0\.43"/,
  )
  assert.match(markup, /title="Command Code · Go ·/, 'the same string is the hover tooltip')
  assertEnglish(markup)
})

test('the footer card carries no monthly row — that bar lives on the dashboard', () => {
  const card = render(CommandCodeFooterEntry, footerProps(usageState()))
  const dashboard = render(CommandCodePanel, bindFace(face(usageState())))

  assert.doesNotMatch(card, /Monthly/, 'the sidebar answers "what stops me now"')
  assert.match(dashboard, /Monthly limit/, 'while the billing-period figure stays on the dashboard')
})

test('the footer card collapses to one rail icon button in the 56px column', () => {
  const rail = render(CommandCodeFooterEntry, footerProps(usageState(), false))

  assert.match(rail, /ccp-railButton/)
  assert.match(rail, /width="18"/, 'the ring is the rail size')
  assert.doesNotMatch(rail, /ccp-footRow/, 'no bar rows in the rail')
  assert.doesNotMatch(rail, /ccp-footLabel/, 'and no visible labels, though the accessible name keeps them')
  assert.doesNotMatch(rail, /ccp-footAmount/, 'nor the amounts')
  assertEnglish(rail)
})

test('the ring tracks the five-hour window and warns once it is over its cap', () => {
  const state = usageState()
  state.report!.accounts[0]!.report.credits!.fiveHour = { used: 400, cap: 200, exceeded: true, resetAt: 0 }
  const markup = render(CommandCodeFooterEntry, footerProps(state))

  assert.match(markup, /--dsw-alias-state-error-primary/, 'an exceeded window turns the ring')
  assert.match(markup, /stroke-dashoffset="0"/, 'and empties it without overflowing')
  assert.match(markup, /ccp-footFillWarn/)
  assert.match(markup, /200%/, 'the printed percentage keeps the true overshoot')
  assert.match(markup, /style="width:100%"/, 'while the bar itself clamps to a full bar')
  assertEnglish(markup)
})

test('an exceeded weekly window warns on its own row without moving the ring', () => {
  const state = usageState()
  state.report!.accounts[0]!.report.credits!.weekly = { used: 900, cap: 400, exceeded: true, resetAt: 0 }
  const markup = render(CommandCodeFooterEntry, footerProps(state))

  assert.match(markup, /ccp-footFillWarn/, 'the weekly bar takes the warning colour')
  assert.match(markup, /225%/)
  assert.doesNotMatch(markup, /--dsw-alias-state-error-primary/, 'the ring still tracks the 5-hour window')
  assertEnglish(markup)
})

test('the footer card with no credential still renders its title and ring', () => {
  const markup = render(CommandCodeFooterEntry, footerProps(usageState({ status: 'idle', report: undefined }), true, false))

  assert.match(markup, /ccp-glyph/)
  assert.match(markup, /Command Code/)
  assert.match(markup, /Not configured/)
  assert.doesNotMatch(markup, /ccp-footRow/, 'nothing to plot without a report')
  assert.doesNotMatch(markup, /ccp-footAmount/, 'and no amounts either')
  assertEnglish(markup)
})

// ---------------------------------------------------------------------------
// The dashboard
// ---------------------------------------------------------------------------

test('the dashboard renders the monthly limit, quota windows and usage totals in English', () => {
  const markup = render(CommandCodePanel, bindFace(face(usageState())))

  for (const expected of [
    'Command Code',
    'Plans, credits and quota windows',
    'Refresh',
    'Go',
    'Monthly',
    '$12.00 / $20.00',
    '60%',
    'Credits',
    'Monthly limit',
    '$20.00',
    'Monthly used',
    'Remaining',
    '$8.00',
    'Purchased',
    '$5.00',
    'Free',
    '$1.00',
    '5-hour window',
    '$50.00 / $200.00',
    'Weekly window',
    '$80.00 / $400.00',
    'Resets',
    'Usage',
    'Requests',
    '10',
    '2 failed',
    'Success rate',
    '99.97%',
    'Spend',
    '$0.4321',
    '$0.50 credits',
    'Tokens',
    '1.8M',
    '1.5M in / 250.0K out',
    'Active',
    'Period ends',
    'Updated',
  ]) {
    assert.ok(markup.includes(expected), `the dashboard should render "${expected}"`)
  }
  assertEnglish(markup)
})

test('an uncapped window is labelled instead of reporting a meaningless 0%', () => {
  const state = usageState()
  state.report!.accounts[0]!.report.credits!.weekly = { used: 30, cap: 0, exceeded: false, resetAt: 0 }
  const markup = render(CommandCodePanel, bindFace(face(state)))

  assert.match(markup, /unlimited/)
  assertEnglish(markup)
})

test('the dashboard renders one switchable tab per account, opening on the serving one', () => {
  const state = usageState()
  state.report!.accounts = [
    { ...state.report!.accounts[0]!, id: 'default', label: 'Default account', active: false },
    { ...state.report!.accounts[0]!, id: 'COMMANDCODE_API_KEY_2', label: 'Go #2', active: true },
  ]
  const markup = render(CommandCodePanel, bindFace(face(state)))

  assert.match(markup, /Default account/)
  assert.match(markup, /Go #2/)
  assert.match(markup, /ccp-tabActive/, 'the serving account is the selected tab')
  assertEnglish(markup)
})

test('the dashboard shows the key guidance when nothing is configured', () => {
  const markup = render(CommandCodePanel, bindFace(face(usageState({ status: 'idle', report: undefined }), false)))

  assert.match(markup, /No API key configured/)
  assert.match(markup, /Settings → Command Code/, 'the guidance names where to fix it')
  assertEnglish(markup)
})

test('a blocked report renders its English cause and hint, not a blank panel', () => {
  const state = usageState()
  state.report!.accounts[0]!.report = {
    failures: ['usage', 'credits'],
    blocked: 'invalid-key',
  }
  const markup = render(CommandCodePanel, bindFace(face(state)))

  assert.match(markup, /API key invalid or expired/)
  assert.match(markup, /rejected every request \(401\)/)
  assert.match(markup, /ccp-noticeError/)
  assertEnglish(markup)
})

test('a failed refetch keeps the last good numbers on screen', () => {
  const markup = render(CommandCodePanel, bindFace(face(usageState({ status: 'error', error: 'socket closed' }))))

  assert.match(markup, /Go/, 'the stale report still renders')
  assert.match(markup, /Could not fetch account usage/)
  assert.match(markup, /socket closed/)
  assertEnglish(markup)
})
