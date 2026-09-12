/**
 * Plans & quota panel tests (node:test). Run with `npm test`.
 *
 * Two surfaces, one view model:
 *
 *   - `buildPanelView` — the projection the sidebar footer card and the
 *     center-column dashboard both render. Pinned here: the monthly limit /
 *     usage math, the quota window the card picks and its percentage, the bars
 *     it stacks, the account the panel opens on, credit/usage formatting, every
 *     degraded state (no key, blocked report, stale data, partial endpoints)
 *     and the removal/dedupe filtering the settings card shares.
 *   - `startPanelAutoRefresh` — the one shared upstream poll. Pinned here: the
 *     immediate first fetch, the refcount across two mounted surfaces, the
 *     credential gate, the tick, and that the last disposer stops the timer.
 *
 * Both are React-free by construction, so these run without a DOM. The copy
 * assertions are deliberate: the panel is specified to read in English on a
 * Chinese harness too, so a regression to a locale lookup must fail here.
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { buildPanelView, resetPanelAutoRefresh, startPanelAutoRefresh } from '../src/client/panel.ts'
import type { AutoRefreshTimer, RefreshSource } from '../src/client/panel.ts'
import { CommandCodeUsageController } from '../src/client/usage.ts'
import type { UsagePageState } from '../src/client/usage.ts'
import type { CommandCodeAccountUsage } from '../src/usage-wire.ts'
import type { CommandCodeUsageReport } from '../src/adapter.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A window limit: 50 of 200 used unless overridden. */
function windowLimit(overrides: Partial<{ used: number; cap: number; exceeded: boolean; resetAt: number }> = {}) {
  return { used: 50, cap: 200, exceeded: false, resetAt: 1_800_000_000_000, ...overrides }
}

/** The credits block: both windows populated. */
function credits(overrides: Partial<{
  monthlyCredits: number
  purchasedCredits: number
  freeCredits: number
  fiveHour: ReturnType<typeof windowLimit>
  weekly: ReturnType<typeof windowLimit>
}> = {}) {
  return {
    monthlyCredits: 20,
    purchasedCredits: 5,
    freeCredits: 1,
    fiveHour: windowLimit(),
    weekly: windowLimit(),
    ...overrides,
  }
}

/** A usage report for an account: everything populated unless overridden. */
function report(overrides: Partial<CommandCodeUsageReport> = {}): CommandCodeUsageReport {
  return {
    account: { id: 'acct_1', name: 'Personal', userName: 'rifat' },
    plan: { planId: 'individual-go', name: 'Go', status: 'active', monthlyCredits: 20, currentPeriodEnd: 1_800_000_000_000 },
    credits: credits(),
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
    ...overrides,
  }
}

/** One pool account. */
function account(overrides: Partial<CommandCodeAccountUsage> = {}): CommandCodeAccountUsage {
  return {
    id: 'default',
    label: 'Default account',
    configured: true,
    active: true,
    mark: '',
    cooldownUntil: 0,
    report: report(),
    ...overrides,
  }
}

/** A usage snapshot in the given lifecycle state. */
function usage(overrides: Partial<UsagePageState> = {}): UsagePageState {
  return { status: 'ready', report: { accounts: [account()] }, error: undefined, fetchedAt: 1_800_000_000_000, ...overrides }
}

/** Project one snapshot with a configured key, the common case. */
function view(state: UsagePageState, apiKeyConfigured = true, removingIds: readonly string[] = []) {
  return buildPanelView({ usage: state, apiKeyConfigured, removingIds })
}

// ---------------------------------------------------------------------------
// The footer card's quota windows
// ---------------------------------------------------------------------------

test('the footer card shows both quota windows, 5-hour first', () => {
  const built = view(usage())

  assert.equal(built.planName, 'Go')
  assert.equal(built.status, '')
  assert.deepEqual(built.footerBars.map((bar) => [bar.label, bar.percent, bar.detail]), [
    ['fiveHourShort', '25%', '$50.00 / $200.00'],
    ['weeklyShort', '25%', '$50.00 / $200.00'],
  ])
})

test('the footer card never carries the monthly bar, which belongs to the dashboard', () => {
  // The sidebar answers "what stops me right now" — the two rolling windows.
  // The monthly limit moves once a billing period, so it stays on the
  // dashboard; this asserts the split rather than trusting the layout.
  const built = view(usage({
    report: { accounts: [account({ report: report({ credits: credits({ monthlyCredits: 8 }) }) })] },
  }))

  assert.equal(built.footerBars.some((bar) => bar.label === 'monthly'), false)
  assert.equal(built.selected?.monthly?.known, true, 'the dashboard still has it')
  assert.equal(built.selected?.monthly?.limit, '$20.00')
})

test('an uncapped window is left out of the card instead of drawn at 0%', () => {
  const built = view(usage({
    report: {
      accounts: [account({
        report: report({ credits: credits({ fiveHour: windowLimit({ cap: 0 }), weekly: windowLimit({ used: 80, cap: 100 }) }) }),
      })],
    },
  }))

  assert.deepEqual(built.footerBars.map((bar) => bar.label), ['weeklyShort'])
  assert.equal(built.footerBars[0]?.percent, '80%')
})

test('the footer card shows no bars at all when neither window is capped', () => {
  const built = view(usage({
    report: {
      accounts: [account({
        report: report({ credits: credits({ fiveHour: windowLimit({ cap: 0 }), weekly: windowLimit({ cap: 0 }) }) }),
      })],
    },
  }))

  assert.deepEqual(built.footerBars, [])
})

test('an over-cap window clamps its bar, warns, and keeps the true percentage', () => {
  const built = view(usage({
    report: {
      accounts: [account({
        report: report({ credits: credits({ fiveHour: windowLimit({ used: 300, cap: 200, exceeded: true }) }) }),
      })],
    },
  }))

  const fiveHour = built.footerBars[0]
  assert.equal(fiveHour?.warn, true)
  assert.equal(fiveHour?.barPercent, 100, 'the bar width clamps to a full bar')
  assert.equal(fiveHour?.percent, '150%', 'the printed percentage still reports the real overshoot')
})

test('the footer card carries this period\u2019s spend in dollars', () => {
  const built = view(usage())

  assert.equal(built.cost, '$0.43')
  assert.equal(built.footTitle, 'Command Code · Go · 5-hour $50.00 / $200.00 (25%) · Weekly $50.00 / $200.00 (25%) · Spend $0.43')
})

test('a sub-cent spend keeps its precision in the footer card', () => {
  const built = view(usage({
    report: {
      accounts: [account({
        report: report({
          usage: { totalCount: 1, totalCost: 0.0031, successRate: 100, completedCount: 1, failedCount: 0, totalTokensIn: 10, totalTokensOut: 5, totalCredits: 0, periodBasis: 'billing-period' },
        }),
      })],
    },
  }))

  assert.equal(built.cost, '$0.0031')
})

test('the cost line is absent when the usage endpoint reported nothing', () => {
  const built = view(usage({
    report: { accounts: [account({ report: report({ usage: undefined, failures: ['usage'] }) })] },
  }))

  assert.equal(built.cost, '')
  assert.equal(built.footTitle.includes('Spend'), false)
})

test('without a credential the card says so instead of showing limits', () => {
  const built = view(usage({ status: 'idle', report: undefined }), false)

  assert.equal(built.noKey, true)
  assert.equal(built.status, 'Not configured')
  assert.equal(built.planName, 'Command Code')
  assert.deepEqual(built.footerBars, [])
  assert.equal(built.cost, '')
})

test('a configured account with no report yet says "No data"', () => {
  const built = view(usage({ status: 'loading', report: undefined }))

  assert.equal(built.status, 'No data')
  assert.equal(built.loading, true)
  assert.equal(built.accounts.length, 0)
})

test('a rotation mark wins the row status line, and the cooldown keeps its reset time', () => {
  const invalid = view(usage({
    report: { accounts: [account({ active: false, mark: 'invalid-credential' })] },
  }))
  assert.equal(invalid.status, 'Invalid key')

  const cooling = view(usage({
    report: { accounts: [account({ active: false, mark: 'rate-limit', cooldownUntil: 1_800_000_000_000 })] },
  }))
  assert.equal(cooling.status, 'Cooling down')
  assert.equal(cooling.accounts[0]!.cooldownUntil, new Date(1_800_000_000_000).toLocaleString())
})

// ---------------------------------------------------------------------------
// The dashboard
// ---------------------------------------------------------------------------

test('the panel opens on the serving account and formats plan, credits and usage', () => {
  const built = view(usage({
    report: {
      accounts: [
        account({ id: 'second', label: 'Go #2', active: false, report: report({ plan: { planId: 'individual-goat', name: 'GOAT', status: 'active', monthlyCredits: 50, currentPeriodEnd: 0 } }) }),
        account({ id: 'default', label: 'Default account', active: true }),
      ],
    },
  }))

  assert.equal(built.selectedId, 'default')
  assert.equal(built.accounts.length, 2)
  const selected = built.accounts.find((entry) => entry.id === 'default')!
  assert.equal(selected.planName, 'Go')
  assert.equal(selected.owner, 'rifat')
  assert.deepEqual(
    selected.monthly === undefined ? undefined : [selected.monthly.limit, selected.monthly.used, selected.monthly.remaining, selected.monthly.purchased, selected.monthly.free],
    ['$20.00', '$0.00', '$20.00', '$5.00', '$1.00'],
  )
  assert.deepEqual(selected.windows.map((window) => [window.label, window.value, window.percent, window.capped]), [
    ['fiveHour', '$50.00 / $200.00', 25, true],
    ['weekly', '$50.00 / $200.00', 25, true],
  ])
  assert.deepEqual(selected.stats.map((stat) => [stat.label, stat.value, stat.sub]), [
    ['requests', '10', '2 failed'],
    ['successRate', '99.97%', ''],
    ['spend', '$0.4321', '$0.50 credits'],
    ['tokens', '1.8M', '1.5M in / 250.0K out'],
  ])
})

test('a sub-cent spend keeps its precision instead of rounding to $0.00', () => {
  const built = view(usage({
    report: {
      accounts: [account({
        report: report({
          usage: { totalCount: 1, totalCost: 0.0031, successRate: 100, completedCount: 1, failedCount: 0, totalTokensIn: 10, totalTokensOut: 5, totalCredits: 0, periodBasis: 'billing-period' },
        }),
      })],
    },
  }))

  assert.equal(built.accounts[0]!.stats.find((stat) => stat.label === 'spend')!.value, '$0.0031')
})

test('an account with no key of its own is flagged, and unconfigured reads in English', () => {
  const built = view(usage({ report: { accounts: [account({ configured: false })] } }))

  assert.equal(built.accounts[0]!.unconfigured, true)
  assert.equal(built.text.unconfigured, 'Not configured')
})

test('a non-active subscription status rides the plan badge', () => {
  const built = view(usage({
    report: {
      accounts: [account({
        report: report({ plan: { planId: 'individual-pro', name: 'Pro', status: 'past_due', monthlyCredits: 100, currentPeriodEnd: 0 } }),
      })],
    },
  }))

  assert.equal(built.accounts[0]!.planStatus, 'past_due')
})

test('an account carries no plan facts when the subscription endpoint failed', () => {
  const built = view(usage({
    report: { accounts: [account({ report: report({ plan: undefined, credits: undefined, usage: undefined, failures: ['subscriptions'] }) })] },
  }))

  assert.equal(built.accounts[0]!.planName, '')
  assert.equal(built.accounts[0]!.monthly, undefined)
  assert.deepEqual(built.accounts[0]!.windows, [])
  assert.deepEqual(built.accounts[0]!.stats, [])
  assert.equal(built.planName, 'Command Code', 'the row falls back to the panel name')
})

// ---------------------------------------------------------------------------
// Degraded states
// ---------------------------------------------------------------------------

test('a fully blocked report names the cause and says it in English', () => {
  const built = view(usage({
    report: { accounts: [account({ report: report({ account: undefined, plan: undefined, credits: undefined, usage: undefined, failures: ['a', 'b'], blocked: 'invalid-key' }) })] },
  }))

  assert.deepEqual(built.failure, {
    title: 'errorInvalidKey',
    hint: 'errorInvalidKeyHint',
    detail: '',
  })
  assert.equal(built.text.errorInvalidKey, 'API key invalid or expired')
  assert.ok(built.text.errorInvalidKeyHint!.includes('401'))
})

test('each blocked reason maps to its own notice', () => {
  const reasons = ['invalid-key', 'service-unavailable', 'network'] as const
  const titles = reasons.map((blocked) => view(usage({
    report: { accounts: [account({ report: report({ failures: ['x'], blocked }) })] },
  })).failure!.title)

  assert.deepEqual(titles, ['errorInvalidKey', 'errorServiceUnavailable', 'errorNetwork'])
})

test('a transport failure with no report is a generic error carrying the message', () => {
  const built = view(usage({ status: 'error', report: undefined, error: 'remote is not mounted' }))

  assert.equal(built.failure!.title, 'errorGeneric')
  assert.equal(built.failure!.detail, 'remote is not mounted')
})

test('a failed refetch keeps the last good report and surfaces the error quietly', () => {
  const built = view(usage({ status: 'error', error: 'socket closed' }))

  assert.equal(built.failure, undefined, 'stale data is not a blocked report')
  assert.equal(built.staleError, 'socket closed')
  assert.equal(built.accounts.length, 1)
})

test('an endpoint-level failure is a partial note, not an error box', () => {
  const built = view(usage({
    report: { accounts: [account({ report: report({ failures: ['usage'] }) })] },
  }))

  assert.equal(built.failure, undefined)
  assert.equal(built.partial, 'partial')
  assert.equal(built.text.partial, 'Some endpoint data unavailable')
})

// ---------------------------------------------------------------------------
// Filtering (shared with the settings card)
// ---------------------------------------------------------------------------

test('accounts staged for removal are hidden from the panel immediately', () => {
  const state = usage({
    report: {
      accounts: [
        account({ id: 'default', label: 'Default account', active: false }),
        account({ id: 'COMMANDCODE_API_KEY_2', label: 'Go #2', active: true }),
      ],
    },
  })

  const all = view(state)
  assert.deepEqual(all.accounts.map((entry) => entry.id), ['default', 'COMMANDCODE_API_KEY_2'])
  assert.equal(all.selectedId, 'COMMANDCODE_API_KEY_2')

  const removing = view(state, true, ['COMMANDCODE_API_KEY_2'])
  assert.deepEqual(removing.accounts.map((entry) => entry.id), ['default'])
  assert.equal(removing.selectedId, 'default', 'selection falls back to a live account')
})

test('a hand-edited document naming one credential twice renders one tab', () => {
  const built = view(usage({
    report: { accounts: [account(), account()] },
  }))

  assert.equal(built.accounts.length, 1)
})

test('the fetch freshness line is empty until something has been fetched', () => {
  const never = view(usage({ status: 'idle', report: undefined, fetchedAt: undefined }), false)

  assert.equal(never.updatedAt, '')
  assert.equal(view(usage()).updatedAt, new Date(1_800_000_000_000).toLocaleTimeString())
})

test('every panel string is English — the surface never consults the harness locale', () => {
  const text = view(usage()).text
  for (const [key, value] of Object.entries(text)) {
    assert.equal(typeof value, 'string', `${key} should resolve`)
    assert.ok(value !== '', `${key} should not be blank`)
    assert.equal(/[\u4e00-\u9fff]/.test(value), false, `${key} must not contain Chinese copy`)
  }
})

// ---------------------------------------------------------------------------
// The monthly limit and usage
// ---------------------------------------------------------------------------

test('the monthly limit is the plan total and usage is what is missing from the remaining balance', () => {
  // The two credit fields mean different things, and the panel must not swap
  // them: `plan.monthlyCredits` is the period's allowance (the LIMIT) while the
  // billing endpoint's `credits.monthlyCredits` is what is LEFT. This is the
  // official CLI's own math (`getCreditDepletionPct` = (plan − remaining)/plan)
  // and its own wording: "Plan: 60% used, 8 credits left".
  const built = view(usage({
    report: { accounts: [account({ report: report({ credits: credits({ monthlyCredits: 8 }) }) })] },
  }))

  const monthly = built.selected?.monthly
  assert.ok(monthly !== undefined)
  assert.equal(monthly.known, true)
  assert.equal(monthly.limit, '$20.00')
  assert.equal(monthly.used, '$12.00')
  assert.equal(monthly.remaining, '$8.00')
  assert.equal(monthly.percent, 60)
  assert.equal(monthly.barPercent, 60)
  assert.equal(monthly.exhausted, false)
  assert.equal(monthly.purchased, '$5.00')
  assert.equal(monthly.free, '$1.00')
})

test('an exhausted monthly balance reads as fully used', () => {
  const built = view(usage({
    report: { accounts: [account({ report: report({ credits: credits({ monthlyCredits: 0 }) }) })] },
  }))

  const monthly = built.selected?.monthly
  assert.equal(monthly?.used, '$20.00')
  assert.equal(monthly?.remaining, '$0.00')
  assert.equal(monthly?.percent, 100)
  assert.equal(monthly?.exhausted, true)
})

test('an overdrawn remaining balance clamps to zero instead of reporting negative usage', () => {
  const built = view(usage({
    report: { accounts: [account({ report: report({ credits: credits({ monthlyCredits: -3 }) }) })] },
  }))

  assert.equal(built.selected?.monthly?.remaining, '$0.00')
  assert.equal(built.selected?.monthly?.used, '$20.00')
  assert.equal(built.selected?.monthly?.exhausted, true)
})

test('an unknown plan still reports its balances but draws no bar', () => {
  // No denominator, no percentage: inventing one from a remaining balance would
  // report a ratio that is not a ratio.
  const built = view(usage({
    report: {
      accounts: [account({
        report: report({
          plan: { planId: 'individual-mystery', name: 'Mystery', status: 'active', monthlyCredits: null, currentPeriodEnd: 0 },
          credits: credits({ monthlyCredits: 8 }),
        }),
      })],
    },
  }))

  const monthly = built.selected?.monthly
  assert.equal(monthly?.known, false)
  assert.equal(monthly?.barPercent, 0)
  assert.equal(monthly?.percent, 0)
  assert.equal(monthly?.remaining, '$8.00')
  assert.equal(monthly?.used, '$0.00')
  assert.equal(built.footerBars.some((bar) => bar.label === 'monthly'), false, 'the sidebar never carries the monthly bar')
  assert.deepEqual(built.footerBars.map((bar) => bar.label), ['fiveHourShort', 'weeklyShort'])
})

test('no monthly view at all when neither endpoint reported credit state', () => {
  const built = view(usage({
    report: { accounts: [account({ report: report({ plan: undefined, credits: undefined }) })] },
  }))

  assert.equal(built.selected?.monthly, undefined)
})

// ---------------------------------------------------------------------------
// The sidebar footer card
// ---------------------------------------------------------------------------

test('the footer card stacks both windows with their own figures', () => {
  const built = view(usage({
    report: {
      accounts: [account({
        report: report({ credits: credits({ fiveHour: windowLimit({ used: 50, cap: 200 }), weekly: windowLimit({ used: 80, cap: 400 }) }) }),
      })],
    },
  }))

  assert.deepEqual(built.footerBars.map((bar) => bar.label), ['fiveHourShort', 'weeklyShort'])
  assert.deepEqual(built.footerBars.map((bar) => bar.percent), ['25%', '20%'])
  assert.deepEqual(built.footerBars.map((bar) => bar.detail), ['$50.00 / $200.00', '$80.00 / $400.00'])
  assert.deepEqual(built.footerBars.map((bar) => bar.warn), [false, false])
})

test('the footer tooltip starts with the visible title and carries every figure', () => {
  const built = view(usage({
    report: {
      accounts: [account({
        report: report({ credits: credits({ fiveHour: windowLimit({ used: 50, cap: 200 }), weekly: windowLimit({ used: 80, cap: 400 }) }) }),
      })],
    },
  }))

  // The accessible name must contain the visible label, so the panel name leads.
  assert.equal(
    built.footTitle,
    'Command Code · Go · 5-hour $50.00 / $200.00 (25%) · Weekly $80.00 / $400.00 (20%) · Spend $0.43',
  )
})

test('the weekly window keeps its overshoot when the five-hour one is uncapped', () => {
  const built = view(usage({
    report: {
      accounts: [account({
        report: report({
          credits: credits({
            fiveHour: windowLimit({ cap: 0 }),
            weekly: windowLimit({ used: 300, cap: 200, exceeded: true }),
          }),
        }),
      })],
    },
  }))

  assert.deepEqual(built.footerBars.map((bar) => bar.label), ['weeklyShort'])
  assert.equal(built.footerBars[0]?.percent, '150%', 'the printed percentage keeps the true overshoot')
  assert.equal(built.footerBars[0]?.barPercent, 100, 'the bar itself clamps')
  assert.equal(built.footerBars[0]?.warn, true)
})

test('the footer tooltip is just the panel name when there is nothing to show', () => {
  const built = view(usage({ status: 'idle', report: undefined }), false)

  assert.deepEqual(built.footerBars, [])
  assert.equal(built.cost, '')
  assert.equal(built.footTitle, 'Command Code')
})

test('the footer card reports the serving account, not the first one', () => {
  const built = view(usage({
    report: {
      accounts: [
        account({ id: 'first', active: false, report: report({ plan: { planId: 'individual-go', name: 'Go', status: 'active', monthlyCredits: 20, currentPeriodEnd: 0 } }) }),
        account({ id: 'serving', active: true, report: report({ plan: { planId: 'individual-pro', name: 'Pro', status: 'active', monthlyCredits: 100, currentPeriodEnd: 0 } }) }),
      ],
    },
  }))

  assert.equal(built.planName, 'Pro')
  assert.equal(built.selectedId, 'serving')
  assert.deepEqual(built.footerBars.map((bar) => bar.label), ['fiveHourShort', 'weeklyShort'])
  assert.equal(built.cost, '$0.43')
})

// ---------------------------------------------------------------------------
// Auto refresh
// ---------------------------------------------------------------------------

/** A timer seam that records schedules and never fires on its own. */
function fakeTimer() {
  const scheduled: Array<{ callback: () => void; ms: number; handle: number }> = []
  const cleared: unknown[] = []
  const timer: AutoRefreshTimer = {
    set(callback, ms) {
      scheduled.push({ callback, ms, handle: scheduled.length + 1 })
      return scheduled.length
    },
    clear(handle) {
      cleared.push(handle)
    },
  }
  return { timer, scheduled, cleared }
}

/** A refresh source that counts calls. */
function refreshSource() {
  let calls = 0
  const source: RefreshSource = {
    state: () => usage(),
    async refresh() {
      calls += 1
      await Promise.resolve()
    },
  }
  return { source, calls: () => calls }
}

beforeEach(() => {
  resetPanelAutoRefresh()
})

test('the first mounted surface fetches immediately and schedules the next tick', () => {
  const { timer, scheduled, cleared } = fakeTimer()
  const { source, calls } = refreshSource()

  const stop = startPanelAutoRefresh(source, () => true, timer)

  assert.equal(calls(), 1, 'the sidebar row must not wait for a click or a tick')
  assert.equal(scheduled.length, 1)
  assert.equal(scheduled[0]!.ms, 120_000)
  assert.deepEqual(cleared, [], 'the loop still runs while a surface is mounted')

  stop()
  assert.deepEqual(cleared, [1], 'the last disposer clears the pending tick')
})

test('a second surface shares the one poll instead of starting another', () => {
  const { timer, scheduled, cleared } = fakeTimer()
  const { source, calls } = refreshSource()

  const stopFirst = startPanelAutoRefresh(source, () => true, timer)
  const stopSecond = startPanelAutoRefresh(source, () => true, timer)

  assert.equal(calls(), 1, 'the second mount piggybacks on the live loop')
  assert.equal(scheduled.length, 1)

  // Only the last disposer stops the loop; the first one just drops its ref.
  stopFirst()
  assert.deepEqual(cleared, [], 'the sidebar row unmounting must not stop the dashboard’s poll')

  stopSecond()
  assert.deepEqual(cleared, [1], 'the last surface unmounting clears the pending tick')
})

test('a tick re-reads the credential fact and fetches when one exists', () => {
  const { timer, scheduled } = fakeTimer()
  const { source, calls } = refreshSource()
  let configured = false

  startPanelAutoRefresh(source, () => configured, timer)
  assert.equal(calls(), 0, 'no key configured means no request — not even the first one')

  configured = true
  scheduled[0]!.callback()
  assert.equal(calls(), 1)
  assert.equal(scheduled.length, 2, 'the loop reschedules itself')
})

test('a stopped surface never fetches on a tick that already fired', () => {
  const { timer, scheduled } = fakeTimer()
  const { source, calls } = refreshSource()

  const stop = startPanelAutoRefresh(source, () => true, timer)
  const firstTick = scheduled[0]!.callback
  stop()
  firstTick()

  assert.equal(calls(), 1, 'the tick belongs to the loop the disposer halted')
})

test('a stopped surface does not halt a loop a later mount owns', () => {
  const { timer, scheduled } = fakeTimer()
  const { source, calls } = refreshSource()

  const stopFirst = startPanelAutoRefresh(source, () => true, timer)
  stopFirst()
  const stopSecond = startPanelAutoRefresh(source, () => true, timer)
  assert.equal(calls(), 2, 'a fresh loop after a full stop fetches again')

  // The stale disposer must not touch the new loop's timer.
  stopFirst()
  scheduled[1]!.callback()
  assert.equal(calls(), 3)
  stopSecond()
})

test('a tick during an in-flight fetch does not double-hit the upstream', async () => {
  // The real controller owns the in-flight collapse (pinned by
  // usage-client.test.ts); this asserts the loop actually rides it rather than
  // stacking a second report request onto every tick.
  const { timer, scheduled } = fakeTimer()
  let requests = 0
  let release: (() => void) | undefined
  const controller = new CommandCodeUsageController({
    report: async () => {
      requests += 1
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return { ok: true, value: { accounts: [account()] } }
    },
    models: async () => ({ ok: true, value: { models: [] } }),
  })

  const stop = startPanelAutoRefresh(controller, () => true, timer)
  assert.equal(requests, 1, 'the first paint issues one request')

  scheduled[0]!.callback()
  assert.equal(requests, 1, 'a tick while that request is in flight collapses onto it')

  release?.()
  await Promise.resolve()
  controller.dispose()
  stop()
})
