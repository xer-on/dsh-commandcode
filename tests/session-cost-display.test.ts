/**
 * Injection tests for the composer's session-cost display (node:test).
 *
 * The display layer is the only part of this feature that touches the DOM, so
 * both the `Document` and the observer factory are injected seams — the same
 * shape the adapter uses for `fetchImpl` — and this file drives them with a
 * double instead of a browser.
 *
 * The double models ONLY what the layer calls. It understands attribute-presence
 * selectors, `#id`, and the pill's own `button[aria-haspopup="dialog"]`; anything
 * else (a class, a combinator, a pseudo) throws, so a new query in production
 * fails here loudly rather than resolving to a silent null. Its `textContent`
 * setter REPLACES the children, exactly as React's `setTextContent` does when a
 * shipped count changes — which is what makes the re-attachment test real.
 *
 * It is not a DOM implementation: it cannot tell you whether a row LOOKS right,
 * only that the layer appends instead of replacing, that the shipped content
 * survives, that a price is put back after the harness rewrites its cell, that a
 * dialog which does not match the figures is left alone, and that disposal gives
 * everything back. The browser is the check for layout — see the module doc of
 * `src/client/session-cost-display.ts`.
 *
 * The figures reuse the shape of `tests/session-cost.test.ts`: a fixed price
 * table and one usage fold, so every expected amount below is a sum a reader can
 * verify (1M in at $3/1M, 100K out at $15/1M, 2M cache read at $0.30/1M, 200K
 * cache write at $3.75/1M → $5.85).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildSessionCostView, type SessionCostView } from '../src/client/session-cost.ts'
import type { CommandCodePriceTable } from '../src/usage-wire.ts'
import type { SessionCostObserverFactory } from '../src/client/session-cost-display.ts'

const { SessionCostDisplay } = await import('../src/client/session-cost-display.ts')

// ---------------------------------------------------------------------------
// The double
// ---------------------------------------------------------------------------

/** Mutating operations, counted so "an unchanged figure writes nothing" is checkable. */
let writes = 0

/** One element of the double: children, attributes, inline style, connectivity. */
class FakeElement {
  readonly tagName: string
  readonly childNodes: FakeElement[] = []
  readonly style: Record<string, string> = {}
  parentNode: FakeElement | null = null
  /** Set on the roots the fixture hangs off `body`, so `isConnected` can walk up. */
  attached = false
  private readonly attrs = new Map<string, string>()
  private text = ''

  constructor(tagName: string) {
    this.tagName = tagName
  }

  /** `id` and `title` reflect to their attributes, as they do in a real DOM. */
  get id(): string {
    return this.attrs.get('id') ?? ''
  }

  set id(value: string) {
    writes += 1
    this.attrs.set('id', value)
  }

  get title(): string {
    return this.attrs.get('title') ?? ''
  }

  set title(value: string) {
    writes += 1
    this.attrs.set('title', value)
  }

  get isConnected(): boolean {
    let node: FakeElement | null = this
    while (node !== null) {
      if (node.attached) return true
      node = node.parentNode
    }
    return false
  }

  get textContent(): string {
    if (this.childNodes.length === 0) return this.text
    return this.childNodes.map((child) => child.textContent).join('')
  }

  /**
   * Replaces the children, exactly as `Element.textContent = …` does: the text
   * becomes a real CHILD text node, which is what a caller iterating `childNodes`
   * (production does, to read a cell's own value past the price it appended) must
   * see. A double that kept the text as a property instead would make every
   * verification read as empty and quietly pass the wrong thing.
   */
  set textContent(value: string) {
    writes += 1
    this.text = value
    for (const child of this.childNodes) child.parentNode = null
    this.childNodes.length = 0
    if (value === '') return
    const text = new FakeElement('')
    text.text = value
    text.parentNode = this
    this.childNodes.push(text)
  }

  appendChild<T extends FakeElement>(child: T): T {
    writes += 1
    if (child.parentNode !== null) child.parentNode.removeChild(child)
    this.childNodes.push(child)
    child.parentNode = this
    return child
  }

  removeChild<T extends FakeElement>(child: T): T {
    writes += 1
    const at = this.childNodes.indexOf(child)
    if (at >= 0) this.childNodes.splice(at, 1)
    child.parentNode = null
    return child
  }

  setAttribute(name: string, value: string): void {
    writes += 1
    this.attrs.set(name, value)
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name)
  }

  removeAttribute(name: string): void {
    writes += 1
    this.attrs.delete(name)
  }

  /** Depth-first pre-order, i.e. the order `querySelector` reports. */
  querySelector(selector: string): FakeElement | null {
    for (const child of this.childNodes) {
      if (matchesSelector(child, selector)) return child
      const nested = child.querySelector(selector)
      if (nested !== null) return nested
    }
    return null
  }

  querySelectorAll(selector: string): FakeElement[] {
    const found: FakeElement[] = []
    for (const child of this.childNodes) {
      if (matchesSelector(child, selector)) found.push(child)
      found.push(...child.querySelectorAll(selector))
    }
    return found
  }
}

/**
 * The selectors production may use. Anything the double does not model throws:
 * it must never answer "no match" for a query it merely does not understand.
 */
function matchesSelector(node: FakeElement, selector: string): boolean {
  const presence = /^\[([a-z-]+)\]$/.exec(selector)
  if (presence !== null) return node.hasAttribute(presence[1]!)
  if (selector === 'button[aria-haspopup="dialog"]') {
    return node.tagName === 'button' && node.getAttribute('aria-haspopup') === 'dialog'
  }
  if (selector.startsWith('#')) return node.id === selector.slice(1)
  throw new Error(`the DOM double does not model the selector ${selector}`)
}

/** The observer seam: records its listener so a test can fire it by hand. */
class FakeObserver {
  target: FakeElement | null = null
  listener: (() => void) | null = null
  disconnects = 0

  readonly factory: SessionCostObserverFactory = (target, listener) => {
    this.target = target as unknown as FakeElement
    this.listener = listener
    return () => {
      this.disconnects += 1
    }
  }

  /** The shipped dialog was portaled onto `body`: announce it. */
  fire(): void {
    this.listener?.()
  }
}

// ---------------------------------------------------------------------------
// The shipped composer, as the display finds it
// ---------------------------------------------------------------------------

/** The two pills the shipped stats row renders, inside one composer card. */
function composerCard(): { card: FakeElement; timePill: FakeElement; usagePill: FakeElement } {
  const card = new FakeElement('div')
  const dock = card.appendChild(new FakeElement('div'))
  dock.setAttribute('data-slot', 'conversation.composer.dock')
  const statsRoot = dock.appendChild(new FakeElement('div'))
  statsRoot.setAttribute('data-composer-stats', '')

  const timePill = statsRoot.appendChild(new FakeElement('span')).appendChild(new FakeElement('button'))
  timePill.setAttribute('aria-haspopup', 'dialog')
  timePill.appendChild(new FakeElement('svg'))
  const timeLabel = timePill.appendChild(new FakeElement('span'))
  timeLabel.setAttribute('class', 'bOPqQW_label')
  timeLabel.textContent = '5 turns · 12 steps'

  const usagePill = statsRoot.appendChild(new FakeElement('span')).appendChild(new FakeElement('button'))
  usagePill.setAttribute('aria-haspopup', 'dialog')
  usagePill.appendChild(new FakeElement('svg'))
  const usageLabel = usagePill.appendChild(new FakeElement('span'))
  usageLabel.setAttribute('class', 'bOPqQW_label')
  usageLabel.textContent = '3.3M tokens · Cache hit 61%'

  return { card, timePill, usagePill }
}

/**
 * The shipped dialog's rows, as `dsh-client-ui-chat` renders them: the cache-hit
 * row while there is billed prompt input, the cache-write row while those tokens
 * are non-zero, and each count formatted `{count} tok`. These are the ENGLISH
 * labels; the Chinese ones are used by a test of their own, because the display
 * layer must never depend on either.
 */
const SHIPPED_ROWS: ReadonlyArray<readonly [string, string]> = [
  ['Cache hit', '61%'],
  ['Uncached input', '1,000,000 tok'],
  ['Cached input', '2,000,000 tok'],
  ['Cache write', '200,000 tok'],
  ['Output', '100,000 tok'],
]

/** A page double: `body`, one composer, the shipped dialog, and a live display. */
function page() {
  const body = new FakeElement('body')
  body.attached = true
  let current = composerCard()
  body.appendChild(current.card)
  const observer = new FakeObserver()
  const doc = {
    body,
    createElement: (tagName: string) => new FakeElement(tagName),
    querySelector: (selector: string) => body.querySelector(selector),
  } as unknown as Document
  const display = new SessionCostDisplay({
    doc,
    // Re-reads the composer it currently owns, so a remount is followed.
    scope: () => current.card,
    observe: observer.factory,
  })
  display.start()
  return {
    doc,
    body,
    observer,
    display,
    get usagePill() {
      return current.usagePill
    },
    get timePill() {
      return current.timePill
    },
    /** React re-created the composer: a fresh card, a fresh stats row. */
    remount: () => {
      body.removeChild(current.card)
      current = composerCard()
      body.appendChild(current.card)
      return current
    },
    /** Portal the shipped usage dialog onto the body, as the harness does. */
    openUsageDialog: (rows: ReadonlyArray<readonly [string, string]> = SHIPPED_ROWS) => {
      const panel = body.appendChild(new FakeElement('div'))
      const dialog = panel.appendChild(new FakeElement('dl'))
      dialog.setAttribute('data-session-stats-usage', '')
      for (const [label, value] of rows) {
        const dt = dialog.appendChild(new FakeElement('dt'))
        dt.textContent = label
        const dd = dialog.appendChild(new FakeElement('dd'))
        dd.textContent = value
      }
      observer.fire()
      return dialog
    },
    dialogHost: () => body.querySelector('[data-session-stats-usage]'),
  }
}

// ---------------------------------------------------------------------------
// The fixture figures
// ---------------------------------------------------------------------------

const TABLE: CommandCodePriceTable = {
  models: [
    { id: 'vendor/model-a', slug: 'model-a', inputCost: 3, outputCost: 15, cacheReadCost: 0.3, cacheWriteCost: 3.75 },
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

/** The priced view: 3.00 + 1.50 + 0.60 + 0.75 = $5.85. */
function view(model = 'vendor/model-a', usage: typeof USAGE = USAGE): SessionCostView {
  const built = buildSessionCostView({
    usage,
    selection: { lastUsed: { provider: 'commandcode', model }, next: null },
    table: TABLE,
    now: 0,
  })
  assert.ok(built !== undefined, `expected a view for ${model}`)
  return built
}

/** The injected cost span inside a shipped pill. */
function injected(pill: FakeElement): FakeElement | null {
  return pill.querySelector('[data-composer-session-cost]')
}

/**
 * The visible run the display appended: the separator node and the amount node.
 * The hidden description is a third child and deliberately excluded.
 */
function runOf(pill: FakeElement): string {
  const root = injected(pill)
  assert.ok(root !== null, 'the cost must be appended to the shipped token pill')
  return root.childNodes
    .slice(0, 2)
    .map((node) => node.textContent)
    .join(' ')
}

/** The shipped dialog's `dt`/`dd` pairs, in document order. */
function pairsOf(dialog: FakeElement): Array<{ dt: FakeElement; dd: FakeElement }> {
  const pairs: Array<{ dt: FakeElement; dd: FakeElement }> = []
  let label: FakeElement | null = null
  for (const node of dialog.childNodes) {
    if (node.tagName === 'dt') label = node
    else if (node.tagName === 'dd' && label !== null) {
      pairs.push({ dt: label, dd: node })
      label = null
    }
  }
  return pairs
}

/** A value cell's own text, i.e. without the price this module put in it. */
function hostText(dd: FakeElement): string {
  return dd.childNodes
    .filter((node) => !node.hasAttribute('data-session-cost-price'))
    .map((node) => node.textContent)
    .join('')
}

/** The price the display appended to a value cell, or null. */
function priceOf(dd: FakeElement): FakeElement | null {
  return dd.querySelector('[data-session-cost-price]')
}

// ---------------------------------------------------------------------------
// The pill
// ---------------------------------------------------------------------------

test('the cost is appended to the token pill, leaving the shipped content untouched', () => {
  const p = page()
  p.display.sync(view())

  const root = injected(p.usagePill)
  assert.ok(root !== null, 'the cost must be appended to the shipped token pill')
  assert.equal(
    p.usagePill.childNodes[p.usagePill.childNodes.length - 1],
    root,
    'appended LAST, so the pill reads tokens · cache hit · cost',
  )
  assert.deepEqual(
    root.childNodes.map((node) => node.textContent),
    ['·', '$5.85', 'Session cost $5.85'],
    'the shipped separator, then the amount, then the hidden description',
  )
  assert.equal(root.getAttribute('data-approximate'), null, 'a single-model session is exact')

  // Appending, never replacing: the shipped label and its figures survive.
  assert.equal(p.usagePill.childNodes[1]!.textContent, '3.3M tokens · Cache hit 61%')
  assert.equal(injected(p.timePill), null, 'the time pill must not be touched')
  assert.equal(p.timePill.childNodes.length, 2, 'the time pill keeps its icon and its label')
})

test('the amount reaches assistive technology through a description', () => {
  // The pill computes its own `aria-label` on every render, so the cost cannot be
  // added to it; a hidden node named by `aria-describedby` is what carries it.
  const p = page()
  const current = view()
  p.display.sync(current)

  const describedBy = p.usagePill.getAttribute('aria-describedby')
  assert.ok(describedBy !== null, 'the button must describe itself with the cost')
  const a11y = p.usagePill.querySelector(`#${describedBy}`)
  assert.ok(a11y !== null, 'the description node must exist')
  assert.equal(a11y.textContent, 'Session cost $5.85')
  assert.equal(a11y.style.display, 'none', 'the description is hidden, not visible text')
  assert.equal(injected(p.usagePill)!.title, current.title, 'and the mouse tooltip carries the breakdown')
})

test('an approximated total is marked, and a free model reads Free', () => {
  const p = page()
  const approximate = buildSessionCostView({
    usage: USAGE,
    selection: {
      lastUsed: { provider: 'commandcode', model: 'vendor/model-a' },
      next: { provider: 'commandcode', model: 'vendor/free-model' },
    },
    table: TABLE,
    now: 0,
  })
  assert.ok(approximate !== undefined)
  p.display.sync(approximate)
  assert.equal(runOf(p.usagePill), '· ≈$5.85')
  assert.equal(injected(p.usagePill)!.getAttribute('data-approximate'), 'true')

  p.display.sync(view('vendor/free-model'))
  assert.equal(runOf(p.usagePill), '· Free', 'a free model states the word, never $0.00')
  assert.equal(
    injected(p.usagePill)!.getAttribute('data-approximate'),
    null,
    'and the marker goes away once the session is exact again',
  )
})

// ---------------------------------------------------------------------------
// The dialog: a price on the right of each token row
// ---------------------------------------------------------------------------

test('each shipped token row gains its price, and the cache-write row is dropped', () => {
  const p = page()
  const dialog = p.openUsageDialog()
  p.display.sync(view())

  const pairs = pairsOf(dialog)
  assert.equal(pairs.length, 5, 'the shipped rows are the only rows: none is appended')

  // The count cell keeps the harness's own text and gains the price after it.
  const input = pairs[1]!
  assert.equal(hostText(input.dd), '1,000,000 tok')
  assert.equal(priceOf(input.dd)?.textContent, '$3.00')
  assert.equal(priceOf(input.dd), input.dd.childNodes[input.dd.childNodes.length - 1], 'appended last')
  assert.equal(priceOf(pairs[2]!.dd)?.textContent, '$0.60')
  assert.equal(priceOf(pairs[4]!.dd)?.textContent, '$1.50')

  // The percentage row is never priced, and the cache-write row is gone
  // entirely — both cells, or the grid leaves an empty label behind.
  assert.equal(priceOf(pairs[0]!.dd), null)
  assert.equal(hostText(pairs[0]!.dd), '61%')
  assert.equal(priceOf(pairs[3]!.dd), null)
  assert.equal(pairs[3]!.dt.style.display, 'none')
  assert.equal(pairs[3]!.dd.style.display, 'none')
})

test('the price is a fixed-width right-aligned column, not a ragged tail', () => {
  const p = page()
  const dialog = p.openUsageDialog()
  p.display.sync(view())

  const price = priceOf(pairsOf(dialog)[1]!.dd)
  assert.ok(price !== null)
  assert.equal(price.style.display, 'inline-block', 'a box, so the width means something')
  assert.equal(price.style.minWidth, '56px', 'every price gets the same box')
  assert.equal(price.style.textAlign, 'right', 'and right-aligns inside it')
  assert.equal(price.style.marginLeft, '6px', 'the counts are not crowded')
})

test('rows are matched by position, never by their label', () => {
  // The shipped labels are the `chat` locale's own strings. A Chinese harness
  // must be decorated exactly like an English one, which is why the planner
  // predicts the shape and the display confirms it by token count.
  const p = page()
  const dialog = p.openUsageDialog([
    ['缓存命中', '61%'],
    ['未缓存输入', '1,000,000 tok'],
    ['缓存读取', '2,000,000 tok'],
    ['缓存写入', '200,000 tok'],
    ['输出', '100,000 tok'],
  ])
  p.display.sync(view())

  const pairs = pairsOf(dialog)
  assert.equal(priceOf(pairs[1]!.dd)?.textContent, '$3.00')
  assert.equal(priceOf(pairs[2]!.dd)?.textContent, '$0.60')
  assert.equal(priceOf(pairs[4]!.dd)?.textContent, '$1.50')
  assert.equal(pairs[3]!.dd.style.display, 'none')
})

test('a price is put back after the harness rewrites its value cell', () => {
  // React renders each count as a single string and rewrites the cell through
  // `Element.textContent` when the count moves, which drops every child with it.
  // The commit lands before this layer's next sync, so the price has to be
  // re-attached rather than assumed to still be there.
  const p = page()
  const dialog = p.openUsageDialog()
  p.display.sync(view())
  const cell = pairsOf(dialog)[2]!.dd
  assert.equal(priceOf(cell)?.textContent, '$0.60')

  // The next turn: the dialog shows the new count, and the figure that arrives
  // with it is the one that explains it.
  const grown = { ...USAGE, cacheReadTokens: 4_000_000 }
  cell.textContent = '4,000,000 tok'
  assert.equal(priceOf(cell), null, 'the rewrite takes the price with it')

  p.display.sync(view('vendor/model-a', grown))
  assert.equal(priceOf(cell)?.textContent, '$1.20', 'and the next figure puts it back')
  assert.equal(hostText(cell), '4,000,000 tok', 'beside the count, not instead of it')
})

test('a dialog that does not match the figures is left alone', () => {
  // The cache-write row is missing while the session has cache-write tokens, so
  // these cannot be the pairs this view predicts: a positional match would price
  // the wrong cells. Nothing is decorated, and nothing is hidden.
  const p = page()
  const dialog = p.openUsageDialog([
    ['Cache hit', '61%'],
    ['Uncached input', '1,000,000 tok'],
    ['Cached input', '2,000,000 tok'],
    ['Output', '100,000 tok'],
  ])
  p.display.sync(view())

  const pairs = pairsOf(dialog)
  assert.equal(pairs.length, 4)
  for (const pair of pairs) {
    assert.equal(priceOf(pair.dd), null, 'no cell is priced')
    assert.notEqual(pair.dt.style.display, 'none', 'and no row is hidden')
  }
})

test('a free model prices nothing but still drops the cache-write row', () => {
  const p = page()
  const dialog = p.openUsageDialog()
  p.display.sync(view('vendor/free-model'))

  const pairs = pairsOf(dialog)
  for (const pair of pairs) assert.equal(priceOf(pair.dd), null, 'a free model has nothing to price')
  assert.equal(pairs[3]!.dd.style.display, 'none', 'the cache-write row still goes')
})

test('a closed dialog takes the prices with it, and reopening decorates afresh', () => {
  const p = page()
  const first = p.openUsageDialog()
  p.display.sync(view())
  assert.equal(priceOf(pairsOf(first)[1]!.dd)?.textContent, '$3.00')

  // The harness unmounts the portaled panel on close and ports a fresh one next
  // time, so the display must not keep pointing at the dead nodes.
  p.body.removeChild(first.parentNode!)
  p.observer.fire()
  p.display.sync(view())

  const second = p.openUsageDialog()
  assert.notEqual(second, first)
  assert.equal(priceOf(pairsOf(second)[1]!.dd)?.textContent, '$3.00', 'decorated once, on the new dialog')
  assert.equal(
    second.querySelectorAll('[data-session-cost-price]').length,
    3,
    'one price per priced row: the cache-hit and cache-write cells get none',
  )
})

// ---------------------------------------------------------------------------
// Idempotence, removal and disposal
// ---------------------------------------------------------------------------

test('re-applying an unchanged figure writes nothing', () => {
  const p = page()
  p.openUsageDialog()
  const current = view()
  p.display.sync(current)
  writes = 0
  p.display.sync(current)
  p.display.sync(current)
  assert.equal(writes, 0, 'a re-render with the same figures must touch no node')
})

test('an unpriceable figure removes everything this layer injected', () => {
  const p = page()
  const dialog = p.openUsageDialog()
  p.display.sync(view())
  assert.notEqual(injected(p.usagePill), null)

  p.display.sync(undefined)
  assert.equal(injected(p.usagePill), null, 'the pill goes back to exactly what the harness rendered')
  assert.equal(p.usagePill.hasAttribute('aria-describedby'), false, 'and the description with it')
  assert.equal(priceOf(pairsOf(dialog)[1]!.dd), null, 'the prices are gone')
  assert.notEqual(pairsOf(dialog)[3]!.dd.style.display, 'none', 'and the cache-write row is back')
  assert.equal(p.usagePill.childNodes.length, 2, 'the shipped pill is whole again')
})

test('disposal takes back every node and stops observing', () => {
  const p = page()
  const dialog = p.openUsageDialog()
  p.display.sync(view())

  p.display.dispose()
  assert.equal(injected(p.usagePill), null)
  assert.equal(p.usagePill.hasAttribute('aria-describedby'), false)
  assert.equal(dialog.querySelectorAll('[data-session-cost-price]').length, 0)
  assert.notEqual(pairsOf(dialog)[3]!.dd.style.display, 'none', 'the hidden row is given back')
  assert.equal(p.observer.disconnects, 1, 'the observer is released with the fiber')

  // Disposal is idempotent: a second call must neither throw nor detach twice.
  p.display.dispose()
  assert.equal(p.observer.disconnects, 1)
})

test('a remounted shipped pill is re-injected rather than lost', () => {
  // React re-creates the stats row when the session binding changes; the display
  // must self-heal on the next figure instead of leaving the cost behind.
  const p = page()
  p.display.sync(view())
  const previous = p.usagePill
  const next = p.remount()

  p.display.sync(view())
  assert.notEqual(injected(next.usagePill), null, 'the cost follows the new row')
  assert.equal(injected(previous), null, 'and the discarded row gives the node back')
})
