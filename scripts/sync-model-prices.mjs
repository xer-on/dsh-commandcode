/**
 * Re-extract the vendored model price table from the official pricing page.
 *
 * Writes `src/model-prices.ts` wholesale, because the table is machine-derived
 * and hand-editing it is how it drifts. The page is a Next.js app whose data
 * rides an escaped flight payload rather than the rendered rows — and the
 * rendered rows are actively misleading (each row's price annotation sits in
 * its own container immediately before the NEXT row, so flattening the page to
 * text attributes every price to the wrong model). This script therefore reads
 * the embedded `models` array and nothing else.
 *
 * Usage:
 *   node scripts/sync-model-prices.mjs                  # fetch the live page
 *   node scripts/sync-model-prices.mjs <saved.html>     # re-derive from a dump
 *
 * Then review the diff: a model that appears or disappears, or a rate that
 * moved, is the whole point of running it. `npm test` afterwards re-checks the
 * invariants (catalog coverage, the peak rows, the 2x relation).
 */

import { readFileSync, writeFileSync } from 'node:fs'

const PRICING_URL = 'https://commandcode.ai/docs/resources/pricing-limits'
const TARGET = new URL('../src/model-prices.ts', import.meta.url)

/**
 * Read the page's embedded model array.
 *
 * The payload escapes every quote (`\"`), so unescape before scanning for the
 * balanced array — scanning the escaped text cannot tell an escaped quote from
 * a string delimiter. The opening bracket is looked up from the `"models"`
 * marker's own position: searching for the next `[` after the marker's id
 * fragment instead skips the array's opening bracket and silently returns a
 * short, plausible-looking slice of it.
 * @param html - the page's HTML.
 * @returns the parsed rows.
 */
function extractRows(html) {
  const plain = html.replace(/\\"/g, '"')
  const marker = '"models":[{"id":'
  const at = plain.indexOf(marker)
  if (at < 0) throw new Error('the pricing page no longer embeds a models array with ids')
  const start = plain.indexOf('[', at + 8)
  let depth = 0
  let end = -1
  let inString = false
  let escaped = false
  for (let i = start; i < plain.length; i += 1) {
    const ch = plain[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) throw new Error('the embedded models array is unbalanced')
  const rows = JSON.parse(plain.slice(start, end + 1))
  if (!Array.isArray(rows) || rows.length < 10) throw new Error(`implausibly small price table (${rows.length})`)
  return rows
}

/**
 * Assert the assumption the snapshot's shape rests on: the page's top-level
 * rates ARE its own off-peak block. The module stores only the peak override and
 * treats top-level as off-peak, so a page that stopped repeating the rates would
 * be silently mispriced for half of every week.
 * @param rows - the extracted rows.
 */
function assertShape(rows) {
  const problems = []
  for (const row of rows) {
    if (row.inputCost === undefined || row.outputCost === undefined || row.cacheReadCost === undefined) {
      problems.push(`${row.id}: missing a published rate`)
      continue
    }
    if (row.timeOfDay === undefined) continue
    const { peak, offPeak } = row.timeOfDay
    if (peak === undefined || offPeak === undefined) {
      problems.push(`${row.id}: timeOfDay without both peak and offPeak`)
      continue
    }
    const rates = [row.inputCost, row.outputCost, row.cacheReadCost].join(',')
    const off = [offPeak.inputCost, offPeak.outputCost, offPeak.cacheReadCost].join(',')
    if (rates !== off) problems.push(`${row.id}: rates (${rates}) != offPeak (${off})`)
  }
  if (problems.length > 0) {
    throw new Error(`the pricing page changed shape:\n${problems.join('\n')}`)
  }
}

/**
 * Render the rows as the snapshot's table entries.
 * @param rows - the extracted rows.
 * @returns one source line per model.
 */
function tableLines(rows) {
  return [...rows]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((row) => {
      const rates = [row.inputCost, row.outputCost, row.cacheReadCost]
      if (row.cacheWriteCost !== undefined) rates.push(row.cacheWriteCost)
      const parts = [`id: '${row.id}'`, `rates: [${rates.join(', ')}]`]
      if (row.timeOfDay !== undefined) {
        const peak = row.timeOfDay.peak
        parts.push(`peak: [${[peak.inputCost, peak.outputCost, peak.cacheReadCost].join(', ')}]`)
      }
      return `  { ${parts.join(', ')} },`
    })
}

const saved = process.argv[2]
const html = saved === undefined
  ? await (async () => {
    const response = await fetch(PRICING_URL)
    if (!response.ok) throw new Error(`${PRICING_URL} answered HTTP ${response.status}`)
    return response.text()
  })()
  : readFileSync(saved, 'utf8')

const rows = extractRows(html)
assertShape(rows)
const current = readFileSync(TARGET, 'utf8')
// Keep the module's hand-written head (doc comment, types, the slug rules and
// the table builder) and replace only the table between its markers.
const opening = 'const MODEL_PRICE_ROWS: readonly ModelPriceRow[] = [\n'
const head = current.slice(0, current.indexOf(opening) + opening.length)
const tail = current.slice(current.indexOf('\n]\n', current.indexOf(opening)))
if (head === '' || tail === '') throw new Error('src/model-prices.ts lost its table markers')
writeFileSync(TARGET, `${head}${tableLines(rows).join('\n')}${tail}`)

const hourly = rows.filter((row) => row.timeOfDay !== undefined).map((row) => row.id)
console.log(`wrote ${rows.length} price rows to src/model-prices.ts`)
console.log(`time-of-day priced: ${hourly.join(', ') || '(none)'}`)
console.log(`with a cache-write rate: ${rows.filter((row) => row.cacheWriteCost !== undefined).length}`)
