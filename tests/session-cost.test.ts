/**
 * View-model tests for the composer's session-cost readout.
 *
 * These pin the arithmetic against hand-checked figures rather than against the
 * implementation: the rates here are a small fixed table, so each expected total
 * is a multiplication a reader can verify. They also pin the three rules that
 * make the readout trustworthy — only Command Code usage is priced, a missing
 * rate is never invented, and anything unpriceable renders nothing rather than
 * a confident zero.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSessionCostView,
  isPeakHour,
  sessionCostAmount,
  sessionCostPillRun,
  sessionCostRowDecorations,
} from '../src/client/session-cost.ts'
import type { CommandCodePriceTable } from '../src/usage-wire.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A fixed price table. `model-a` publishes all four rates, `model-b` is
 * hourly-priced with NO cache-write rate (the common case — the page publishes
 * one for a minority of models), and `free-model` costs nothing on any plan.
 */
const TABLE: CommandCodePriceTable = {
  models: [
    { id: 'vendor/model-a', slug: 'model-a', inputCost: 3, outputCost: 15, cacheReadCost: 0.3, cacheWriteCost: 3.75 },
    {
      id: 'vendor/model-b',
      slug: 'model-b',
      inputCost: 0.15,
      outputCost: 0.6,
      cacheReadCost: 0.003,
      peak: { inputCost: 0.3, outputCost: 1.2, cacheReadCost: 0.006 },
    },
    { id: 'vendor/free-model', slug: 'free-model', inputCost: 0, outputCost: 0, cacheReadCost: 0, free: true },
  ],
  peakHours: [[1, 4], [6, 10]],
}

/** One million uncached input, 100K output, 2M cache reads, 200K cache writes. */
const USAGE = {
  uncachedInputTokens: 1_000_000,
  outputTokens: 100_000,
  cacheReadTokens: 2_000_000,
  cacheWriteTokens: 200_000,
}

/** A selection fold for one Command Code model. */
function selection(model: string, next?: string): { lastUsed: { provider: string; model: string } | null; next: { provider: string; model: string } | null } {
  return {
    lastUsed: { provider: 'commandcode', model },
    next: { provider: 'commandcode', model: next ?? model },
  }
}

/**
 * UTC millis for a weekday (0 = Sunday) at an hour, in a fixed week. Derived
 * from an anchor rather than hardcoded so the fixture cannot silently drift off
 * the weekday it claims to be.
 */
function utcAt(weekday: number, hour: number): number {
  const base = Date.UTC(2026, 8, 6, 0, 0, 0)
  const baseDay = new Date(base).getUTCDay()
  return base + ((((weekday - baseDay) % 7) + 7) % 7) * 86_400_000 + hour * 3_600_000
}

/** Wednesday, inside the 01–04 UTC peak window. */
const PEAK = utcAt(3, 2)
/** Wednesday, outside every peak window. */
const OFF_PEAK = utcAt(3, 12)
/** Saturday, inside a peak window's hours but never peak — weekends are exempt. */
const WEEKEND = utcAt(6, 2)

/** Build a view over the fixed table. */
function view(overrides: Record<string, unknown> = {}) {
  return buildSessionCostView({
    usage: USAGE,
    selection: selection('vendor/model-a'),
    table: TABLE,
    now: OFF_PEAK,
    ...overrides,
  } as never)
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

test('every bucket is charged at its own published rate', () => {
  const cost = view({ selection: selection('vendor/model-a') })
  assert.ok(cost !== undefined)
  // 1M in at $3/1M = 3.00, 100K out at $15/1M = 1.50,
  // 2M cache read at $0.30/1M = 0.60, 200K cache write at $3.75/1M = 0.75.
  assert.equal(cost.total, 5.85)
  assert.equal(cost.value, '$5.85')
  assert.equal(cost.unpricedCacheWriteTokens, 0)
})

test('cache reads are billed at the cache rate, not the input rate', () => {
  // The whole point of the buckets: pricing 2M cache reads at the input rate
  // would overstate this session by two orders of magnitude.
  const cost = view({ selection: selection('vendor/model-b') })
  assert.ok(cost !== undefined)
  // 1M in at $0.15/1M = 0.15, 100K out at $0.60/1M = 0.06,
  // 2M cache read at $0.003/1M = 0.006. Cache writes are unpriced here.
  assert.equal(Number(cost.total.toFixed(6)), 0.216)
})

test('unpriced cache-write tokens are reported, never guessed at', () => {
  const cost = view({ selection: selection('vendor/model-b') })
  assert.ok(cost !== undefined)
  assert.equal(cost.unpricedCacheWriteTokens, 200_000)
  assert.match(cost.title, /cache write tokens have no published rate/)
})

test('a model that publishes a cache-write rate has nothing unpriced', () => {
  const cost = view({ usage: { ...USAGE, cacheWriteTokens: 0 } })
  assert.ok(cost !== undefined)
  assert.equal(cost.unpricedCacheWriteTokens, 0)
  assert.doesNotMatch(cost.title, /no published rate/)
})

test('a free model costs nothing and is labelled rather than priced', () => {
  const cost = view({ selection: selection('vendor/free-model') })
  assert.ok(cost !== undefined)
  assert.equal(cost.total, 0)
  assert.equal(cost.free, true)
  assert.equal(cost.value, 'Free')
  assert.equal(cost.label, undefined, 'the word alone is the whole message')
})

// ---------------------------------------------------------------------------
// Peak / off-peak
// ---------------------------------------------------------------------------

test('peak hours double the rate for hourly-priced models', () => {
  const off = view({ selection: selection('vendor/model-b'), now: OFF_PEAK })
  const peak = view({ selection: selection('vendor/model-b'), now: PEAK })
  assert.ok(off !== undefined && peak !== undefined)
  assert.equal(peak.peak, true)
  assert.equal(off.peak, false)
  // 1M in at $0.30 = 0.30, 100K out at $1.20 = 0.12, 2M cache read at $0.006 = 0.012.
  assert.equal(Number(peak.total.toFixed(6)), 0.432)
  assert.equal(Number(off.total.toFixed(6)), 0.216)
  assert.match(peak.title, /peak rates/)
  assert.match(off.title, /off-peak rates/)
})

test('weekends are off-peak even inside a peak window', () => {
  const cost = view({ selection: selection('vendor/model-b'), now: WEEKEND })
  assert.ok(cost !== undefined)
  assert.equal(cost.peak, false)
  assert.equal(Number(cost.total.toFixed(6)), 0.216)
})

test('a flat-priced model is unaffected by the hour', () => {
  const off = view({ selection: selection('vendor/model-a'), now: OFF_PEAK })
  const peak = view({ selection: selection('vendor/model-a'), now: PEAK })
  assert.ok(off !== undefined && peak !== undefined)
  assert.equal(peak.total, off.total)
  assert.equal(peak.peak, false)
})

test('the peak windows come from the table, not a client-side constant', () => {
  const cost = view({ now: PEAK, table: { ...TABLE, peakHours: [] } })
  assert.ok(cost !== undefined)
  assert.equal(cost.peak, false)
  assert.equal(isPeakHour(PEAK, []), false)
  assert.equal(isPeakHour(PEAK, [[1, 4]]), true)
})

test('the peak window is end-exclusive', () => {
  // 01:00–04:00 means 01, 02, 03 are peak and 04:00 is not.
  assert.equal(isPeakHour(utcAt(3, 1), TABLE.peakHours), true)
  assert.equal(isPeakHour(utcAt(3, 3), TABLE.peakHours), true)
  assert.equal(isPeakHour(utcAt(3, 4), TABLE.peakHours), false)
  assert.equal(isPeakHour(utcAt(3, 6), TABLE.peakHours), true)
  assert.equal(isPeakHour(utcAt(3, 10), TABLE.peakHours), false)
})

// ---------------------------------------------------------------------------
// Gating: what must render NOTHING
// ---------------------------------------------------------------------------

test('another provider\u2019s session is never priced with Command Code rates', () => {
  const cost = view({ selection: { lastUsed: { provider: 'deepseek', model: 'vendor/model-a' }, next: null } })
  assert.equal(cost, undefined)
})

test('a model the table does not know renders nothing', () => {
  assert.equal(view({ selection: selection('vendor/unknown') }), undefined)
})

test('a table that has not landed renders nothing', () => {
  assert.equal(view({ table: undefined }), undefined)
  assert.equal(view({ table: { models: [], peakHours: [] } }), undefined)
})

test('a session with no usage renders nothing rather than $0.00', () => {
  assert.equal(view({ usage: undefined }), undefined)
  assert.equal(
    view({ usage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
    undefined,
  )
})

test('a selection the Host has not reported renders nothing', () => {
  assert.equal(view({ selection: undefined }), undefined)
  assert.equal(view({ selection: { lastUsed: null, next: null } }), undefined)
})

test('a non-finite or negative bucket cannot produce a bogus total', () => {
  const cost = view({
    selection: selection('vendor/model-b'),
    usage: { ...USAGE, uncachedInputTokens: Number.NaN, outputTokens: -5 },
  })
  assert.ok(cost !== undefined)
  // Both bad buckets read as absent, leaving only the priced cache-read bucket:
  // 2M at $0.003/1M. Cache writes have no published rate on this model.
  assert.equal(Number(cost.total.toFixed(6)), 0.006)
})

// ---------------------------------------------------------------------------
// Model resolution and the approximate marker
// ---------------------------------------------------------------------------

test('the amount is priced at the model the tokens were actually billed at', () => {
  // `lastUsed` is what the accumulated tokens were consumed by; a pending
  // selection must not retroactively reprice them.
  const cost = view({ selection: selection('vendor/model-b', 'vendor/model-a') })
  assert.ok(cost !== undefined)
  assert.equal(Number(cost.total.toFixed(6)), 0.216)
})

test('a session that has used more than one model is marked approximate', () => {
  const cost = view({ selection: selection('vendor/model-b', 'vendor/model-a') })
  assert.ok(cost !== undefined)
  assert.equal(cost.approximate, true)
  assert.equal(cost.value, '≈$0.22')
  assert.match(cost.title, /more than one model/)
})

test('re-selecting the same model is not approximate', () => {
  const cost = view({ selection: selection('vendor/model-a', 'vendor/model-a') })
  assert.ok(cost !== undefined)
  assert.equal(cost.approximate, false)
  assert.equal(cost.value, '$5.85')
})

test('a first request with only a pending selection is priced at it', () => {
  const cost = view({ selection: { lastUsed: null, next: { provider: 'commandcode', model: 'vendor/model-a' } } })
  assert.ok(cost !== undefined)
  assert.equal(cost.total, 5.85)
  assert.equal(cost.approximate, false)
})

// ---------------------------------------------------------------------------
// Amount formatting
// ---------------------------------------------------------------------------

test('a live session total states a bound instead of a flat $0.0000', () => {
  assert.equal(sessionCostAmount(0), '$0.00')
  assert.equal(sessionCostAmount(0.00004), '<$0.0001')
  assert.equal(sessionCostAmount(0.0042), '$0.0042')
  // The panel's own convention: cents once the amount is worth a cent, four
  // decimals below that, so the readout and the quota figures cannot disagree
  // about how money is printed.
  assert.equal(sessionCostAmount(0.216), '$0.22')
  assert.equal(sessionCostAmount(5.85), '$5.85')
  assert.equal(sessionCostAmount(Number.NaN), '$0.00')
})

test('the readout is English-only copy', () => {
  const cost = view()
  assert.ok(cost !== undefined)
  assert.equal(/[\u4e00-\u9fff]/.test(`${cost.value}${cost.title}${cost.label ?? ''}`), false)
})

// ---------------------------------------------------------------------------
// What the shipped token-usage UI receives
// ---------------------------------------------------------------------------

test('the pill run is the amount behind the shipped separator', () => {
  // The shipped pill is a flex row whose gap already spaces the appended item,
  // so the separator is what makes the cost read as the last part of its text
  // run rather than as a value parked at the end of it. It travels as its own
  // node because it carries the shipped separator's colour, not the label's.
  const priced = view()
  assert.ok(priced !== undefined)
  assert.deepEqual(sessionCostPillRun(priced), { separator: '·', value: '$5.85' })

  const free = view({ selection: selection('vendor/free-model') })
  assert.ok(free !== undefined)
  assert.deepEqual(sessionCostPillRun(free), { separator: '·', value: 'Free' })

  const approximate = view({ selection: selection('vendor/model-b', 'vendor/model-a') })
  assert.ok(approximate !== undefined)
  assert.deepEqual(sessionCostPillRun(approximate), { separator: '·', value: '≈$0.22' })
})

// ---------------------------------------------------------------------------
// How the harness's own usage dialog is decorated
// ---------------------------------------------------------------------------

test('every token row is priced on its own, in the shipped order', () => {
  const cost = view()
  assert.ok(cost !== undefined)
  // The shipped dialog renders: cache hit (a percentage, never priced), uncached
  // input, cached input, cache write (dropped on request), output — in that
  // order, which is what lets the display layer match rows positionally.
  assert.deepEqual(sessionCostRowDecorations(cost), [
    { row: 'cacheHit', tokens: undefined, amount: undefined, hidden: false },
    { row: 'uncachedInput', tokens: 1_000_000, amount: '$3.00', hidden: false },
    { row: 'cacheRead', tokens: 2_000_000, amount: '$0.60', hidden: false },
    { row: 'cacheWrite', tokens: 200_000, amount: undefined, hidden: true },
    { row: 'output', tokens: 100_000, amount: '$1.50', hidden: false },
  ])
})

test('the cache-write row is dropped and never priced', () => {
  // The pricing page publishes a cache-write rate for a minority of models, so
  // that cell read `unpriced` far more often than a number. It goes even on a
  // model that DOES publish a rate, and its tokens still count toward the total
  // the pill shows.
  const cost = view({ selection: selection('vendor/model-a') })
  assert.ok(cost !== undefined)
  assert.deepEqual(
    sessionCostRowDecorations(cost).find((row) => row.row === 'cacheWrite'),
    { row: 'cacheWrite', tokens: 200_000, amount: undefined, hidden: true },
  )
})

test('a session with no cache writes has no cache-write row to drop', () => {
  const cost = view({ usage: { ...USAGE, cacheWriteTokens: 0 } })
  assert.ok(cost !== undefined)
  assert.deepEqual(
    sessionCostRowDecorations(cost).map((row) => row.row),
    ['cacheHit', 'uncachedInput', 'cacheRead', 'output'],
  )
})

test('the shape follows the shipped component\u2019s own conditions', () => {
  // The cache-hit row exists while there is billed prompt input, so a session
  // whose only usage is output has none — and since rows are matched
  // POSITIONALLY, a shape this planner got wrong would price the wrong cells.
  const outputOnly = view({
    usage: { uncachedInputTokens: 0, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 },
  })
  assert.ok(outputOnly !== undefined)
  assert.deepEqual(
    sessionCostRowDecorations(outputOnly).map((row) => row.row),
    ['uncachedInput', 'cacheRead', 'output'],
  )

  // A cache read alone IS billed prompt input, so the cache-hit row is there.
  const cacheReadOnly = view({
    usage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 900, cacheWriteTokens: 0 },
  })
  assert.ok(cacheReadOnly !== undefined)
  assert.deepEqual(
    sessionCostRowDecorations(cacheReadOnly).map((row) => row.row),
    ['cacheHit', 'uncachedInput', 'cacheRead', 'output'],
  )
})

test('a free model prices no row at all', () => {
  const cost = view({ selection: selection('vendor/free-model') })
  assert.ok(cost !== undefined)
  const plan = sessionCostRowDecorations(cost)
  assert.deepEqual(plan.map((row) => row.row), ['cacheHit', 'uncachedInput', 'cacheRead', 'cacheWrite', 'output'])
  assert.deepEqual(plan.map((row) => row.amount), [undefined, undefined, undefined, undefined, undefined])
  assert.equal(plan.find((row) => row.row === 'cacheWrite')?.hidden, true, 'and the cache-write row still goes')
})

test('everything handed to the shipped surfaces is English-only copy', () => {
  const cost = view()
  assert.ok(cost !== undefined)
  const run = sessionCostPillRun(cost)
  const amounts = sessionCostRowDecorations(cost).map((row) => row.amount ?? '')
  assert.equal(/[\u4e00-\u9fff]/.test([run.separator, run.value, ...amounts].join('')), false)
})
