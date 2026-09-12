/**
 * Snapshot invariants for the vendored model price table.
 *
 * The table is extracted from the official pricing page rather than hand-typed,
 * so these tests are what keep that extraction honest: they pin the figures the
 * page states, the coverage of the plugin's own catalog, and the two rules the
 * composer's cost math depends on (a `peak` block means time-of-day pricing, and
 * a missing `cacheWriteCost` means unpriced rather than free).
 *
 * The coverage assertion is the one that fails when upstream adds a model: a
 * catalog id with no price row and no free deal is a model the readout could
 * only render as nothing, so it must be an explicit decision (add the slug rule
 * or the override) rather than a silent gap.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { modelPriceTable } from '../src/model-prices.ts'
import { KNOWN_PLANS, KNOWN_PEAK_PRICING, PEAK_HOUR_RANGES, isFreeModel } from '../src/capabilities.ts'

/** The table, rebuilt per test so a mutation in one cannot leak into another. */
function table(): ReturnType<typeof modelPriceTable> {
  return modelPriceTable()
}

/** One row by catalog id, or undefined. */
function row(id: string): ReturnType<typeof modelPriceTable>['models'][number] | undefined {
  return table().models.find((model) => model.id === id)
}

test('every catalog model is either priced or explicitly free', () => {
  const priced = new Set(table().models.map((model) => model.id))
  const gaps = Object.keys(KNOWN_PLANS).filter((id) => {
    if (priced.has(id)) return false
    return !isFreeModel(id) && !id.endsWith(':free')
  })
  assert.deepEqual(gaps, [], `catalog id(s) with no price and no free deal: ${gaps.join(', ')}`)
})

test('free models are served at zero so the readout can say so', () => {
  for (const id of ['meituan/LongCat-2.0:free', 'inclusionai/ling-3.0-flash-sante:free', 'poolside/laguna-s-2.1-free']) {
    const price = row(id)
    assert.ok(price !== undefined, `${id} should be served`)
    assert.equal(price.free, true, `${id} should be flagged free`)
    assert.equal(price.inputCost, 0)
    assert.equal(price.outputCost, 0)
    assert.equal(price.cacheReadCost, 0)
  }
})

test('priced models never carry a zero input or output rate', () => {
  for (const model of table().models) {
    if (model.free === true) continue
    assert.ok(model.inputCost > 0, `${model.id} input rate`)
    assert.ok(model.outputCost > 0, `${model.id} output rate`)
    assert.ok(Number.isFinite(model.cacheReadCost), `${model.id} cache-read rate`)
  }
})

test('the time-of-day rows are exactly the models the picker labels peak', () => {
  const peakRows = new Set(table().models.filter((model) => model.peak !== undefined).map((model) => model.id))
  assert.deepEqual([...peakRows].sort(), [...KNOWN_PEAK_PRICING].sort())
})

test('peak rates are exactly double the off-peak rates on every hourly model', () => {
  for (const model of table().models) {
    if (model.peak === undefined) continue
    assert.equal(model.peak.inputCost, model.inputCost * 2, `${model.id} peak input`)
    assert.equal(model.peak.outputCost, model.outputCost * 2, `${model.id} peak output`)
    assert.equal(model.peak.cacheReadCost, model.cacheReadCost * 2, `${model.id} peak cache read`)
  }
})

test('the DeepSeek figures match what the pricing page publishes', () => {
  // Spot-checks taken straight off the page: the two DeepSeek rows the plugin
  // documents, the flat-priced fast variant (the row that must NOT be peak),
  // and the model this very session runs on.
  const flash = row('deepseek/deepseek-v4-flash')
  assert.equal(flash?.inputCost, 0.15)
  assert.equal(flash?.outputCost, 0.6)
  assert.equal(flash?.cacheReadCost, 0.003)
  assert.equal(flash?.peak?.inputCost, 0.3)
  assert.equal(flash?.peak?.outputCost, 1.2)

  const v41 = row('deepseek/deepseek-v4.1-flash')
  assert.equal(v41?.inputCost, 0.15)
  assert.equal(v41?.outputCost, 0.6)
  assert.equal(v41?.cacheReadCost, 0.003)
  assert.equal(v41?.peak?.cacheReadCost, 0.006)

  const fast = row('deepseek/deepseek-v4-flash-fast')
  assert.equal(fast?.inputCost, 0.28)
  assert.equal(fast?.outputCost, 0.56)
  assert.equal(fast?.cacheReadCost, 0.07)
  assert.equal(fast?.peak, undefined, 'the fast variant is flat-priced and must not carry peak rates')
})

test('a cache-write rate is present only where the page publishes one', () => {
  // The page publishes `cacheWriteCost` for a minority of models; the rest have
  // unpriced cache-write tokens, which the cost math must surface rather than
  // price at the input rate.
  const priced = row('Qwen/Qwen3.8-Max')
  assert.equal(priced?.cacheWriteCost, 2.5)
  const unpriced = row('deepseek/deepseek-v4.1-flash')
  assert.equal(unpriced?.cacheWriteCost, undefined)
})

test('the peak windows travel with the table', () => {
  assert.deepEqual(table().peakHours, PEAK_HOUR_RANGES.map(([start, end]) => [start, end]))
})

test('rows are unique per id and every row carries the slug it came from', () => {
  const models = table().models
  const ids = models.map((model) => model.id)
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(', ')}`)
  for (const model of models) {
    assert.ok(model.slug.length > 0, `${model.id} slug`)
  }
})

test('a page row the catalog has not learned yet is still served, under its slug', () => {
  // The catalog snapshot is synced per release while the price table comes from
  // the live page, so the page can be ahead. Such a row is served keyed by its
  // own slug, which is why the readout looks up by slug as well as catalog id.
  const models = table().models
  const slugOnly = models.filter((model) => !(model.id in KNOWN_PLANS) && model.free !== true)
  for (const model of slugOnly) {
    assert.equal(model.id, model.slug, `${model.slug} should be keyed by its slug when no catalog model claims it`)
  }
})

test('building the table twice yields equal but independent values', () => {
  const first = table()
  const second = table()
  assert.deepEqual(first, second)
  assert.notEqual(first.models, second.models)
})
