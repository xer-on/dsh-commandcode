/**
 * Theme-token contract for the plans & quota panel (node:test).
 *
 * The panel is themed entirely through the harness's `--dsw-alias-*` custom
 * properties, and a token the theme does not define is not an error the browser
 * reports: the declaration is simply dropped, so an "exceeded" quota bar or a
 * blocked-report box silently renders in the surrounding text colour and looks
 * like ordinary content. That is exactly the failure this file exists to catch
 * — it was written after shipping `--dsw-alias-label-error` (a name that reads
 * plausibly and appears throughout the settings page's own stylesheet) and
 * finding the theme only defines `--dsw-alias-state-error-primary`.
 *
 * `THEME_ALIAS_TOKENS` is a vendored snapshot of the theme's published token
 * set, taken from
 * `@deepseek-ai/dsh-client-ui-theme/lib/client.js`, which is the single source
 * that projects these values onto `document.body`. It is vendored rather than
 * imported because the theme package is not a dependency of this bundle — the
 * same constraint, and the same vendoring pattern, as `TIER_HEADINGS` in
 * `src/client/model-select.ts`. When upstream adds an alias the panel wants to
 * use, extend this list; the test only ever fails on a token the theme does not
 * have.
 *
 * `--dsw-alias-*` is also the whole domain: the theme's own primitives resolve
 * through these, so a raw hex value in the panel stylesheet would be a
 * hardcoded colour that ignores light/dark and brand packs. That is asserted
 * too.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { PANEL_CSS } from '../src/client/panel-styles.ts'

/**
 * The theme's alias tokens (82 as of dsh 0.1.5-rc.2). A `var()` reference
 * outside this set resolves to nothing.
 */
const THEME_ALIAS_TOKENS: ReadonlySet<string> = new Set([
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-layer-3',
  '--dsw-alias-bg-mask-1',
  '--dsw-alias-bg-mask-2',
  '--dsw-alias-bg-mask-3',
  '--dsw-alias-bg-mask-drop',
  '--dsw-alias-bg-mask-photo',
  '--dsw-alias-bg-module-platform',
  '--dsw-alias-bg-multi-select',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-bg-skeleton',
  '--dsw-alias-border-inverted',
  '--dsw-alias-border-inverted2',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-border-l2-darkmode-thin',
  '--dsw-alias-border-l3',
  '--dsw-alias-border-l4',
  '--dsw-alias-brand-primary',
  '--dsw-alias-brand-primary-invert',
  '--dsw-alias-brand-primary-new-colorprimary-new-color',
  '--dsw-alias-brand-text',
  '--dsw-alias-button-contrast-fill',
  '--dsw-alias-button-elevated-fill',
  '--dsw-alias-button-floating-fill',
  '--dsw-alias-button-floating-hover',
  '--dsw-alias-button-ghost-active-border',
  '--dsw-alias-button-ghost-active-fill',
  '--dsw-alias-button-ghost-active-hover',
  '--dsw-alias-button-info-fill',
  '--dsw-alias-button-info-hover',
  '--dsw-alias-button-primary-dimmed',
  '--dsw-alias-button-primary-fill',
  '--dsw-alias-button-primary-hover',
  '--dsw-alias-button-tool-bar-fill',
  '--dsw-alias-button-tool-bar-fill-invisible',
  '--dsw-alias-button-tool-bar-hover',
  '--dsw-alias-interactive-bg-active',
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-interactive-bg-hover-accent',
  '--dsw-alias-interactive-bg-hover-danger',
  '--dsw-alias-interactive-bg-hover-solid',
  '--dsw-alias-label-caption',
  '--dsw-alias-label-dimmed',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-primary-bluish',
  '--dsw-alias-label-primary-dimmed',
  '--dsw-alias-label-primary-foreground',
  '--dsw-alias-label-primary-inverted',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-layer',
  '--dsw-alias-link',
  '--dsw-alias-markdown-citation',
  '--dsw-alias-markdown-code-block',
  '--dsw-alias-markdown-code-block-banner',
  '--dsw-alias-markdown-code-segment-selected',
  '--dsw-alias-markdown-code-segment-unselected',
  '--dsw-alias-markdown-inline-code',
  '--dsw-alias-markdown-placeholder',
  '--dsw-alias-markdown-tag',
  '--dsw-alias-scrollbar-bg-l1',
  '--dsw-alias-scrollbar-bg-l2',
  '--dsw-alias-scrollbar-hover-l1',
  '--dsw-alias-scrollbar-hover-l2',
  // The separator the SHIPPED stats pill draws between its items
  // (`StatsPills.module.css` `.sep`). The injected session cost copies it, so
  // the token has to be real — the vendored list had simply not caught up when
  // the readout first needed it.
  '--dsw-alias-separator-primary',
  '--dsw-alias-state-business-primary',
  '--dsw-alias-state-business-tertiary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-error-secondary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-success-secondary',
  '--dsw-alias-state-success-tertiary',
  '--dsw-alias-state-warn-label',
  '--dsw-alias-state-warn-primary',
  '--dsw-alias-state-warn-secondary',
  '--dsw-alias-state-warn-tertiary',
  '--dsw-alias-toast-bg',
  '--dsw-alias-token',
  '--dsw-alias-tooltip-bg',
])

/** Every custom property the stylesheet references, in source order. */
function referencedTokens(css: string): string[] {
  return [...css.matchAll(/var\((--[a-z0-9-]+)/gi)].map((match) => match[1]!)
}

test('every theme token the panel stylesheet references is a real alias', () => {
  const referenced = referencedTokens(PANEL_CSS)
  assert.ok(referenced.length > 0, 'the stylesheet should be themed, not bare')

  const unknown = [...new Set(referenced)].filter((token) => !THEME_ALIAS_TOKENS.has(token))
  assert.deepEqual(
    unknown,
    [],
    `unknown theme token(s): ${unknown.join(', ')} — a var() the theme does not define renders as nothing`,
  )
})

test('the exceeded/warning treatment uses the state aliases, not a label alias', () => {
  // The regression this file was written for: `--dsw-alias-label-error` does
  // not exist, so the warning colours silently fell back to inherited text.
  assert.ok(PANEL_CSS.includes('var(--dsw-alias-state-error-primary)'), 'the exceeded colour is the state error alias')
  assert.ok(PANEL_CSS.includes('--dsw-alias-state-warn-primary'), 'the subscription-status badge is warn-tinted')
  assert.equal(PANEL_CSS.includes('label-error'), false, 'label-error is not a theme token')
  assert.equal(PANEL_CSS.includes('state-warning'), false, 'the warn alias is state-warn-*, not state-warning-*')
})

test('the panel stylesheet carries no hardcoded colours', () => {
  // Strip the one legitimate inline asset (the SVG chevron is not in this
  // stylesheet) and the `currentColor`/`transparent` keywords, then assert no
  // hex / rgb() / hsl() literal remains: a hardcoded colour would ignore the
  // active theme and every brand pack.
  const withoutKeywords = PANEL_CSS
    .replace(/currentColor/g, '')
    .replace(/transparent/g, '')
    .replace(/#fff\b/g, '')
  const literals = [...withoutKeywords.matchAll(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi)].map((match) => match[0])
  assert.deepEqual(literals, [], `hardcoded colour literal(s): ${literals.join(', ')}`)
})

test('the footer row is stacked, because both of its occupants want a full line', () => {
  // The sidebar renders `sidebar.footer.action` as a flex ROW, and its two
  // occupants — ui-cordis's chip and this card — each declare a full-width line
  // and refuse to shrink. Left as a row the pair overflows the column, which is
  // how a card can end up zero-width and invisible without any error. The
  // override is matched by the CSS-module class STEM, never a hashed name.
  assert.ok(
    PANEL_CSS.includes('[class*="_footerActions"]{flex-direction:column}'),
    'the footer action row must be turned into a column',
  )
  assert.equal(/hHd-Xa|Nqubda/.test(PANEL_CSS), false, 'a hashed class name must never be hardcoded')
  assert.match(PANEL_CSS, /\.ccp-foot\{[^}]*width:100%/, 'the card claims the full width of its line')
  assert.match(PANEL_CSS, /\.ccp-foot\{[^}]*flex:0 0 auto/, 'and says so in flex terms too')
})

test('the footer bars are real boxes, not inline spans', () => {
  // The footer card's markup has to stay PHRASING content — it renders inside
  // the shell's own <button> — so its bars are <span>s rather than <div>s. That
  // makes the display mode load-bearing: an INLINE box ignores `width` and
  // `height` outright, so the 5px track still painted (a flex item is
  // blockified by its container) while the fill collapsed to 0x0 and the bar
  // showed no usage at all. The markup and every render test were perfectly
  // correct while the card was visibly broken, which is why this invariant is
  // pinned against the stylesheet instead of the rendered HTML.
  for (const className of ['ccp-footBar', 'ccp-footFill']) {
    const rule = new RegExp(`\\.${className}\\{([^}]*)\\}`).exec(PANEL_CSS)
    assert.ok(rule !== null, `${className} must have a rule of its own`)
    assert.match(
      rule[1]!,
      /display:block/,
      `${className} must be blockified, or its width/height are ignored`,
    )
  }
})

test('the stylesheet is keyed so injection stays idempotent and disposable', async () => {
  const { PANEL_CSS_ID } = await import('../src/client/panel-styles.ts')

  assert.match(PANEL_CSS_ID, /^@xer-on\/dsh-commandcode-provider\//, 'the id is namespaced under the package')
  assert.notEqual(
    PANEL_CSS_ID,
    '@xer-on/dsh-commandcode-provider/CommandCodeSettingsPage.module.css',
    'the panel owns its own stylesheet id, distinct from the settings page',
  )
})
