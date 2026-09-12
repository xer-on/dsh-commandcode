# AGENTS.md

Instructions for AI coding agents working in this repository.

## What this is

An unofficial [DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/) LLM provider plugin that connects the `commandcode` model provider to the Command Code Provider API. See [README.md](./README.md#how-it-works) for how it works end to end.

- **Provider route**: `commandcode` (registered on the dsh `llm` service).
- **Plugin name**: `llm-commandcode`; package `@xer-on/dsh-commandcode-provider`.
- **Distributed as**: a dsh *bundle* (npm package with a `dsh.bundle` manifest + `cordis.patch.yml` layer), installable via `dsh plugin --profile <name> add <pkg|github:...|path>`.

## Repository layout

```
src/adapter.ts        CommandCodeAdapter (LlmAdapter) — wire protocol, message
                      conversion, SSE/JSONL stream parsing, catalog + cache,
                      pre-stream account rotation loop.
src/capabilities.ts   Static capability snapshot (model efforts/vision/thinking,
                      plan tiers, subscription plans, deals, peak pricing) +
                      its read helpers — the sync-only surface for upstream
                      CLI/doc updates; imported by src/adapter.ts and re-exported
                      from src/index.ts.
src/accounts.ts       CommandCodeAccountPool — multi-account slots, per-key
                      rotation state (429/401 marks), window-probe revival.
src/index.ts          Plugin entry: Config schema, credential resolution,
                      settings namespace, route + directory registration,
                      usage-Remote wiring.
src/usage-wire.ts     Shared `commandcode/report` Remote contract: hand-rolled
                      strict result schema + the one descriptor object both
                      halves register (dependency-free; the client inlines it).
src/usage-remote.ts   Host half of the usage Remote: `commandcodeUsage`
                      service + `typert` registry contribution (optional inject).
src/wire-shared.ts    Shared boundary-validation + Remote-descriptor plumbing
                      for the hand-rolled Typert wire contracts (dependency-free;
                      imported by the wire files so the client can inline it).
src/client/index.ts   Browser client entry: registers the "Command Code"
                      settings page (settings.section, id `commandcode`), the
                      Models-page provider card
                      (settings.models.provider-card, key `llm-commandcode`),
                      the sidebar plans & quota panel
                      (sidebar.footer.action + main, id `commandcode-panel`),
                      and the composer session-cost entry
                      (conversation.composer.dock, id
                      `commandcode-session-cost`; it renders no surface of its
                      own — see the composer bullet below).
src/client/settings.ts  Settings-page controller (scope + credentials + staged
                      form; React-free so node tests can drive it).
src/client/legacy-credentials.ts  Pre-0.1.2 ApiProxy-to-current credential face adapter.
src/client/usage.ts   Account-card controller (Remote fetch lifecycle +
                      formatting; React-free) + the TypertRemoteMap merge
                      declaration for `commandcode/report`.
src/client/section.tsx  The settings page React component (settings form +
                      account-usage card).
src/client/panel-copy.ts  English copy table for the sidebar plans & quota panel
                      (a plain constant, NOT the `settings.commandcode` locale
                      namespace — see the sidebar-panel bullet below).
src/client/panel.ts   Sidebar-panel view model (React-free): projects the shared
                      usage snapshot + settings facts into one `PanelView`
                      render tree (footer-card plan, both quota windows with
                      their own spend and limit, rotation state; per-account
                      monthly credits, windows, usage) and owns the shared
                      refcounted background refresh.
src/client/panel-view.tsx  The two panel React components (sidebar footer card +
                      center-column dashboard) rendering one `PanelView`, plus
                      the `SidebarFooterActionOwnerProps` re-declaration.
src/client/panel-slots.ts  SlotMap merge for `main` + `sidebar.footer.action` —
                      the panel's slots belong to ui-layout / ui-sidebar, which
                      are not dependencies of this bundle (mirrors card.tsx).
src/client/panel-styles.ts  Panel stylesheet (`ccp-` classes) as a string,
                      installed and removed with the panel's slot declaration.
                      The composer's session cost ships no CSS: it is injected
                      into the harness's own pill and dialog (see below).
src/model-prices.ts   Vendored per-model price table (USD per 1M tokens) read out
                      of the official pricing page's embedded model JSON, plus
                      the slug rules that reconcile its ids with the catalog's.
                      Host-only: the browser gets these rates over
                      `commandcode/prices` and never inlines the table.
src/client/session-cost.ts  Composer session-cost view model (React-free): turns
                      the session's cumulative token buckets + the price table
                      into one presentation value AND the plan the harness's
                      token-usage pill and dialog receive, and owns its English
                      copy.
src/client/session-cost-display.ts  The DOM half (browser only): appends the
                      amount to the harness's token-usage pill and a price to
                      each of its usage dialog's token rows, over injected
                      `Document` + observer seams; it hides the cache-write row.
src/client/session-cost-view.tsx  The composer session-cost ENTRY: a headless
                      mount (a hidden marker plus the two seats), registered in
                      `conversation.composer.dock` for those seats only.
src/client/session-cost-slots.ts  SlotMap merge for `conversation.composer.dock`
                      — declared by ui-conversation, occupied by ui-chat.
src/client/prices.ts  Browser controller for the price table (one-shot cache
                      over the `commandcode/prices` Remote; React-free).
src/client/card.tsx   The Models-page provider card (keyed-slot component +
                      the SlotMap merge for `settings.models.provider-card` /
                      `settings.models.footer` mirroring upstream 0.1.2).
src/client/sessions.ts  selectModel friendly-error wrapper (React-free).
src/client/version.ts  Plugin version for the settings-page footer (package.json import, inlined at build).
src/client/update.ts   Update hint: throttled npm-registry `latest` check +
                       tolerant semver compare (React-free, storage/fetch/time
                       seams); the page footer links to releases when newer.
src/login.ts           Host half of the browser login: loopback callback
                       server mirroring `command-code login` (POST /callback,
                       state token, whoami validation) → storeKey seam.
src/login-wire.ts      Login Remote contract: `commandcode/login*` endpoints'
                       descriptors + strict status parser (dependency-free).
src/web-search.ts      CommandCode web-search provider over `ctx.web` (registered
                       only when the profile mounts the web seam; reuses the
                       plugin's apiBase + credential chain for `/alpha/web-search`).
src/tui-settings.ts    dsh-TUI settings section over the optional
                       `tuiSettingsSections` seam: declares the Command Code
                       page (`apiKey` secret field, apiBase, plan filter, a
                       per-model checkbox list under plan-tier groups, active
                       account) with local structural types, so no
                       dependency on the terminal front door (issue #28).
src/client/locales.ts   English page copy + LocaleNamespaceMap augmentation.
src/client/login.ts   Login-panel controller (Remote poll lifecycle; React-free
                      so node tests can drive it).
src/client/login-row.tsx  Shared login row rendered by both the settings page
                      and the Models-page provider card.
src/client/snapshot-store.ts  Vendored getSnapshot/subscribe/set triple (avoids a
                      version-specific module-table request).
tests/adapter.test.ts Core adapter unit tests (node:test + tsx).
tests/accounts.test.ts Account-pool rotation tests.
tests/usage-report.test.ts getUsage parsing tests (stubbed fetch, no network).
tests/settings.test.ts settings-page controller tests.
tests/card.test.ts    Models-page provider-card tests (posture logic, key
                      write path, login affordance parity).
tests/legacy-credentials.test.ts  Legacy credential-envelope adapter tests.
tests/snapshot-store.test.ts  Snapshot-store notification and disposal tests.
tests/update.test.ts  update-hint tests (semver compare, payload parse,
                      throttle cache, failure semantics).
tests/usage-wire.test.ts usage-Remote schema + descriptor tests.
tests/usage-client.test.ts account-card controller tests.
tests/panel.test.ts   Sidebar-panel view-model + auto-refresh tests (both
                      footer windows and their spend amounts, the card/dashboard
                      split, monthly limit/usage math, per-account projection,
                      every degraded state, English-only copy, refcounted poll
                      lifecycle).
tests/panel-render.test.ts  Panel render tests (react-dom/server over both
                      components: footer card wide/rail, dashboard sections,
                      account tabs, blocked/stale states, English markup).
tests/model-prices.test.ts  Vendored price-table invariants (catalog coverage,
                      the peak rows and their 2x relation, the published rates
                      spot-checked against the page, optional cache-write rate).
tests/session-cost.test.ts  Composer session-cost view-model tests (per-bucket
                      pricing, peak/off-peak, unpriced cache writes, every
                      gating path, the amount thresholds, the plan the shipped
                      surfaces receive, English copy).
tests/session-cost-display.test.ts  Injection tests over an injected DOM double
                      (append-not-replace, the shipped content surviving, a
                      dialog that opens later, idempotence, disposal).
tests/session-cost-render.test.ts  Composer entry render tests (the hidden
                      marker, the free/approximate variants, and that every
                      unpriceable state renders nothing instead of crashing).
tests/login.test.ts   browser-login flow integration tests (real loopback
                      server driven with fetch; every failure reason).
tests/login-wire.test.ts login descriptor uniformity + status parser.
tests/login-client.test.ts login-panel controller poll lifecycle.
tests/client.test.ts  selectModel friendly-error rewrite tests (real envelope shape).
tests/client-boot.test.ts client-boot integration tests (real apply() against a
                      DSH 0.1.2 client assembly; settings page + provider card).
tests/package.test.ts package-metadata contract (Harness peers start at rc.1,
                      no dsh-client-runtime).
tests/config-schema.test.ts Config credential contract: literal apiKey fields
                      carry role('secret') and are stripped by redactSecrets.
tests/web-search.test.ts web-search provider tests (wire body, result mapping,
                      failure taxonomy, selection-field rewrite).
tests/tui-settings.test.ts dsh-TUI settings-section tests (declared fields,
                      secret-ref safety, unset-reachable options, effective
                      boolean defaults, registration lifecycle).
scripts/verify-isolated-install.mjs  pnpm 10 marketplace-generation tarball install smoke.
scripts/sync-model-prices.mjs  Re-derives src/model-prices.ts from the pricing
                      page's embedded model JSON (fetches, or reads a saved
                      HTML dump for an offline re-derivation), asserting the
                      page still duplicates its rates into `offPeak`. Run it
                      when prices or models move, then review the diff.
cordis.patch.yml      Bundle patch layer (inserts the llm-commandcode row).
tsdown.config.ts      Build config (tsdown -> lib/, ESM, .d.ts + client.js).
```

## Key facts an agent must know

- **Client bundle**: the package's `dsh.client` declaration (`platform: web`,
  `inject: [...]`) makes the host serve `lib/client.js` as a client module.
  The bundle may only `require` platform/seed modules (`react`,
  `react/jsx-runtime`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-ui-slots`,
  `@deepseek-ai/dsh-client-web-react`, `@deepseek-ai/dsh-client-ui-primitives`,
  `@deepseek-ai/dsh-client-schema-form`, `@deepseek-ai/dsh-client-ui-attachment`)
  and host-shipped platform modules resolvable from the loader's module table
  (e.g. `@deepseek-ai/dsh-client-ui-primitives`). The 0.1.2 Web shell
  seeds `@deepseek-ai/dsh-client-store`; this client keeps the smaller local
  `getSnapshot`/`subscribe`/`set` subset in `src/client/snapshot-store.ts`, so
  it issues no extra module-table request. The settings page binds the
  `llm-commandcode` namespace through `ctx.settingsScope` and writes the API
  key through `ctx.remote.credentials` under the `COMMANDCODE_API_KEY`
  reference — never through the settings section, so the key literal cannot
  leak into a settings document. The retained legacy credential adapter is
  defensive only; the published peer contract starts at 0.1.2-rc.1.
  `tests/settings.test.ts` and `tests/legacy-credentials.test.ts` pin these
  internal faces. The sidebar panel adds no new external require: its two
  foreign slots are reached through a type-only SlotMap merge
  (`src/client/panel-slots.ts`), because ui-layout and ui-sidebar are not
  dependencies of this bundle (they are not peerDependencies, and adding them
  would make the browser resolve modules the panel never calls). `react-dom` is
  a DEVdependency only, used by `tests/panel-render.test.ts` to server-render
  the components; it never enters the bundle. The composer session cost follows
  the same rule and needs no new external either: it injects plain DOM nodes
  into the harness's own pill and usage dialog, reads the session's token
  projection through a prop the composer supplies, and gets its rates over the
  `commandcode/prices` Remote — so the vendored price table stays in the HOST
  bundle and `lib/client.js` carries no rates at all.
- **Isolated package install**: pnpm 10 auto-installs the package's DSH peers
  when a desktop marketplace prepares a fresh generation. Keep
  `@deepseek-ai/dsh-invariants` as an explicit `^0.1.2-rc.1` peer matching
  the other Harness packages; otherwise pnpm reaches it only through
  `dsh-llm`, rewrites the prerelease range to an unsatisfiable stable range,
  and aborts with `ERR_PNPM_NO_MATCHING_VERSION`. Do not move it to
  `dependencies`: the active profile owns Harness packages. Run
  `npm run test:install` after changing DSH peer metadata.
- **Models-page provider card (`settings.models.provider-card`)**: a keyed
  SlotMap seat ui-settings-models declares in dsh 0.1.2 (rc.1) — it
  dispatches with `entryKey = settingsNs` on every provider card of an adapter
  family. The client entry registers a cell with `key: 'llm-commandcode'`
  (the directory row's settings namespace), carrying its own inject face
  (store hooks + actions) because the declaring entry is ui-settings-models',
  not ours; the `t` seat comes from the registration's own `locale`
  namespace. The card (src/client/card.tsx) is the row's configuration panel
  driven by the OFFICIAL Edit toggle: closed it renders nothing (the row looks
  like any other provider row); open, it hides the official editor shell —
  for `llm-commandcode` the page's `layoutOf` returns "unknown", so that shell
  is only the settings.yaml hint over a permanently disabled apply — and shows
  the real controls (key status + route badges, paste field, sign-in,
  discard/save) wired to the SHARED settings controller (the authoritative
  credential fact is `apiKeyConfigured`; the owner's `keyConfigured` is
  fallback only). The shell is found as an immediate sibling of the renderer's
  stable `data-slot="settings.models.provider-card"` outlet wrapper (after it
  in a row, before it in the setup/add cards) by its CSS-module `editor` class
  stem — no hashed class is hardcoded — via a MutationObserver on the parent;
  if dsh restructures, detection fails benign and the stock shell reappears.
  The SlotMap merge for the two seats lives in card.tsx and must stay
  structurally identical to upstream's declaration (compile-time duplicate
  merge would fail once a peer ships it). On dsh builds without the slot the
  declaration never exists and `slots.inject` never fires — the registration
  silently does not happen; do not "harden" that into an error.
- **Wire protocol** (reverse-engineered, command-code@1.28.4; re-verified unchanged against 1.53.0):
  - `POST {apiBase}/alpha/generate` — CLI transport body `{ config, memory, taste, skills, params: { model, messages, tools, system, max_tokens, temperature, stream, reasoning_effort? }, threadId }`. Used for Go-plan accounts (the only plan without Provider API access) and as the fallback when `/provider/v1/chat/completions` returns `upgrade_required`.
  - `POST {apiBase}/provider/v1/chat/completions` — documented OpenAI-format transport with a flat body `{ model, messages, tools?, max_tokens, temperature, stream, reasoning_effort? }`. Used for accounts with Provider API access; historical reasoning is replayed as `reasoning_content`.
  - Image parts use the official CLI wire shape on `/alpha/generate`: `{ type: 'image', source: { type: 'base64', media_type, data } }`; OpenAI `/provider/v1/chat/completions` uses `{ type: 'image_url', image_url: { url: 'data:...' } }`.
  - CLI stream: SSE-ish JSONL events `text-delta | reasoning-start/delta/end | tool-call | tool-result | finish | error`.
  - OpenAI stream: standard SSE chunks with `delta.reasoning` / `delta.reasoning_content` / `delta.content` / `delta.tool_calls`, a `finish_reason`, and optional `usage`.
  - Catalog: `GET {apiBase}/provider/v1/models` → `{ object: 'list', data: [{ id, name, context_length }] }`.
  - Web search: `POST {apiBase}/alpha/web-search` — body `{ query, numResults, allowedDomains?, blockedDomains? }` → `{ results: [{ title, url, snippet }] }`; same `Authorization: Bearer <key>` + `x-command-code-version` as generate.
  - Defaults: `apiBase = https://api.commandcode.ai`, `COMMAND_CODE_CLI_VERSION = '1.53.0'`.
- **API key resolution order** (in `src/index.ts`): `config.apiKey` → credential ref `apiKeyEnv` (default `COMMANDCODE_API_KEY`, via the dsh credentials seam) → launch environment → official CLI auth file `~/.commandcode/auth.json`. **No other tool's credential store is scanned** — keep it that way.
- **Multi-account rotation** (`src/accounts.ts` + the adapter's connect loop): the top-level key forms the `default` slot; `Config.accounts` (`[{ label, apiKeyEnv | apiKey }]`) adds more, in rotation order. Rotation is **passive**: a key is marked only on a real pre-stream rejection (429 → `unknown` cooldown, 401 → `disabled`), and the adapter's `rotateApiKey` hook re-sends the same request with the next account's key (safe: nothing streamed, the body is account-independent, `threadId` random per request — mid-stream failures NEVER rotate). When every account is marked, the pool probes `/alpha/billing/credits` per key (`probeFiveHourWindow`) to revive reset windows, else throws `RATE_LIMIT` naming the earliest `resetAt` (all-401 → `INVALID_CREDENTIAL`). State is keyed by API key, not slot — shared credentials share one mark. **Manual selection**: `Config.activeAccount` (a slot id) pins the serving account via the pool's `preferredId` seam + `selectActiveAccount()` (shared with the usage view's active badge); a pinned-but-exhausted or unknown id falls back to rotation order. **Model routing**: `Config.modelAccountRules` (`[{ models: string[], account }]`) lists catalog model ids per account slot; the request's model reaches key resolution (`resolveApiKey(connection, model)`), the pool's `modelAccountRules` seam re-reads rules per resolution, and `matchModelRule()`/`selectAccountForModel()` serve the routed account before preferred/rotation — an unusable routed account falls back, so the router is a hint, never a hard gate. The rules editor's model list comes from a Host-side `commandcode/models` Remote (the FULL adapter catalog via `listModels(…, { unfiltered: true })`, sorted), so the browser never calls the Command Code API; `SettingsPageApi.models` is optional, so legacy transports degrade to the empty-catalog state. Extra-account slot ids are the credential reference itself (`COMMANDCODE_API_KEY_2`, …) so a stored selection survives list reorders/removals; only literal-only composition entries keep positional `account-N` ids. The settings page edits `activeAccount` through the generic section-field machinery (a `<select>` bound to a text field) and `modelAccountRules` through its own rules card (staged rows like `accounts`, one `modelAccountRules` write). The picker's billing-access cache is per key. The usage Remote result is `CommandCodeAccountsReport` (`{ accounts: [...] }`); host and client ship in one bundle, so wire-shape changes need no migration — only synced edits in `src/usage-wire.ts`, `src/usage-remote.ts`, and `src/client/usage.ts`.
- **Web search (`src/web-search.ts` + the optional `web` seam)**: the model-facing `web_search` tool (from `@deepseek-ai/dsh-tool-web`) is served by a `CommandCodeSearchProvider` registered as `commandcode` on `ctx.web` — same `Authorization: Bearer <key>` + `x-command-code-version` chain, same `apiBase`, so DSH's web search needs NO separate key/endpoint config (unlike `dsh-web-search-deepseek`, which needs its own Anthropic-compatible base). It POSTs `{ query, numResults, allowedDomains?, blockedDomains? }` to `/alpha/web-search` and maps `{ title, url, snippet }` → `WebSearchSource`. Registration rides `ctx.inject(['web'], ...)` exactly like `typert`: the provider is registered only when the profile mounts the web service, and the fiber never activates otherwise (this stays an LLM-provider-only plugin without web). The pool's `resolveKey()` (rotation + auth-file revived) is reused, so search benefits from the same multi-account selection; the search endpoint is account-independent so no mid-flight rotation happens. **Selection**: whether the `commandcode` provider WINS over the shipped `deepseek-official` (or a sibling search plugin's pin, e.g. modsearch's `searchProvider: modsearch`) is `Config.webSearch` (default on). The web seam has NO public runtime selector, so the plugin writes its private `searchProviderId` field (read per call by `web.search()`) via `applyCommandCodeSearchSelection()` in `src/web-search.ts` — applied at boot AND on every settings change (the `installSection` `onChange` hook), and restored on fiber unload. The tracked `CommandCodeSearchSelection` remembers the displaced backend id, so toggle-off (and unload) hands the selection back to it — it NEVER forces the factory default, because that is what silenced sibling plugins with Command Code search off (issue #26); a fresh boot straight into `webSearch: false` leaves the field untouched. Re-enables keep the original `displaced` (the field holds our own id then, which must not overwrite the memory), and a field already reading `commandcode` at first touch means "nothing to restore". That write depends on the runtime shape (a plain writable property, not `#private`); the durable alternative is the boot-time `searchProvider: commandcode` cordis patch. The legacy `selectCommandCodeSearchProvider()` stays exported for compatibility but always restores the factory default on disable — new code must not use it. `dsh-web` is a `^0.1.2-rc.1` peer (kept external in tsdown); `tests/web-search.test.ts` pins the wire body, header, result mapping, the `WEB_ABORTED`/`WEB_PROVIDER_CREDENTIAL_MISSING`/`WEB_PROVIDER_ERROR` taxonomy, the selection-field handoff (sibling-pin restore, re-enable memory, unload path via the real host `apply()`), and the legacy rewrite.
- **StreamChunk contract** (dsh-llm): each block starts with `block-start`, deltas by `index`, ends with `block-end`; `usage` before `finish`; nothing after `finish`. Tool-call `arguments` are raw JSON strings. On the legacy `/alpha/generate` transport, reasoning blocks are intentionally NOT replayed into later turns (matches the CLI; private reasoning must not leak); on the `/provider/v1/chat/completions` transport they are passed back as `reasoning_content` for tool-loop continuity. Only tool calls with a paired tool result are replayed on both transports. **Tool-result images** (`read_image` returns text + a nested `image` block): neither wire can hold an image inside a tool result — the CLI's `tool-result.output` is text-only (the official CLI's own `toV2ToolOutput` filters out everything but text) and Chat Completions forbids non-text `role: 'tool'` content — so `toolResultMedia()` splits each result and both converters emit the bytes in a user message immediately after the tool message, led by the `Attached image(s) from tool result:` note (the shape `@deepseek-ai/dsh-llm-deepseek` uses). Deduplicated by attachment id per result; an image-only result gets a `(image returned; see the attached image)` tool text instead of an empty string; a result without a paired call drops its images with the result. Never flatten a tool result with `blockText` alone again — that is issue #30. The `hasImageContent` gate (model Vision capability + attachment seam) already recurses into tool results, so these images ride the same `readImage` resolver user attachments use.
- **Errors**: throw `LlmError` with stable codes. 401 → `INVALID_CREDENTIAL`; 429 → `RATE_LIMIT`; other HTTP → `PROVIDER_HTTP_ERROR` (403 body's `error.code`, e.g. `MODEL_NOT_IN_PLAN`, is parsed into the message). Unsupported options (`stop`) and image input throw `UNSUPPORTED_OPTION` / `UNSUPPORTED_CONTENT` rather than silently dropping.
- **Adapter is cordis-free** by design: `src/adapter.ts` takes a per-request `options()` thunk + `resolveApiKey()` from the plugin entry, so settings changes reach the next request without re-registration. It also accepts an injectable `fetchImpl` for tests.
- **Usage Remote (`commandcode/report`)**: the settings page's account card
  fetches the usage report Host-side through the Typert Gateway — the browser
  never holds the API key. Host: `src/usage-remote.ts` registers a
  `commandcodeUsage` service + strict descriptor on the `typert` registry.
  Client: `src/client/index.ts` mounts the shared contribution
  (`src/usage-wire.ts`) on `ctx.remote`, then resolves the `remote.commandcode`
  namespace via a **dynamic `ctx.inject(['remote.commandcode'], ...)`** — cordis
  only serves a fiber the services it declares in `inject` (a bare
  `ctx.remote.commandcode` access throws `cannot get property ... without
  inject`), and a static inject would deadlock because the namespace service
  exists only after our own mount. Keep that pattern when touching the mount.
- **Browser login (`commandcode/loginBegin|loginStatus|loginCancel`)**: the
  settings page's key field can start the official `command-code login` flow
  instead of pasting a key — reverse-engineered from the CLI bundle's
  `createAuthFlowController`/`createAuthServer` (command-code@1.32.1): bind
  `127.0.0.1` from port 5959 upward, open
  `{studio}/studio/auth/cli?callback=http://localhost:{port}/callback&state=…`,
  receive a **POST JSON body** `{apiKey,state,userId,userName,keyName}` from
  the Studio page (no OAuth code exchange), validate via `/alpha/whoami`,
  then store through the credentials seam under the default slot's ref. The
  loopback server mirrors the CLI contract exactly (POST-only `/callback`,
  10 KB body cap, state-token equality, `{success}` JSON responses); three
  deliberate hardenings over the CLI — CORS origins are echoed **only when
  allowlisted** (the CLI falls back to the first origin), `Connection: close`,
  and the denial branch (`{"error":…}`) checks the state token **before** it
  ends the attempt, exactly where the CLI checks it. That last one is
  load-bearing: a denial is terminal and a `text/plain` POST rides as a CORS
  simple request (the browser sends it whatever the origin allowlist says), so
  without the check any open page could cancel a login in progress. Attempt
  ownership (`attemptSeq` + `ownsAttempt()`) is the other non-obvious rule:
  the delivered key is validated over an await, and a cancel or a new `begin()`
  during that window must win — no key write and no status publish from an
  attempt that no longer owns the flow. `begin()` likewise retires a `waiting`
  status whose server is gone (the callback was consumed, the port is closed)
  instead of handing back a dead authUrl. The
  three endpoints ride the SAME `commandcodeUsage` service and one combined
  contribution (one Host registration, one Client mount); the namespace-level
  `TypertRemoteNamespaceMap.commandcode` augmentation lives ONLY in
  `src/client/usage.ts` (interface merging forbids duplicate members). A
  literal composition `apiKey` still outranks the stored credential; a
  remote-Host setup (browser ≠ Host machine) falls back to manual paste by
  design.
- **Literal API keys are `role('secret')`** (`Config.apiKey` and
  `Config.accounts[].apiKey`): the settings page writes keys through the
  credentials seam, so the literal path exists only for composition configs —
  but that path IS a settings value, and the harness strips a secret role from
  every descriptor it serves (`settings.describe()` runs with
  `redactSecrets: true`). Dropping the role leaks the key to the browser
  verbatim (another machine on a remote Host). Pinned by
  `tests/config-schema.test.ts` against the real `redactSecrets`.
- **dsh-TUI settings section (`src/tui-settings.ts` + the optional
  `tuiSettingsSections` seam)**: a TUI-only user has NO other way to enter the
  API key — dsh-TUI's `/provider` wizard manages its own `llm-pi-ai` routes
  exclusively, and `/settings` renders only sections a plugin DECLARES (it
  never reads `settings.installSection`). So the plugin declares a Command Code
  page over `ctx.inject(['tuiSettingsSections'], …)`, exactly like
  `web`/`typert`; without dsh-TUI the fiber never activates and the
  plugin stays an LLM-provider-only bundle. Four rules are load-bearing.
  (1) **No dependency on the terminal front door**: the seam's types are
  re-declared locally, because the plugin must not import
  `@deepseek-harness-tui/dsh-tui`. Every read is defensive (missing service,
  non-object, missing `register` → no section) and the read goes through the
  REFLECTIVE `ctx.get('tuiSettingsSections')`, never a bare property access —
  cordis throws `cannot get property … without inject` for an undeclared
  service, which would take the plugin's boot down on every non-TUI profile.
  (2) **The key field is a `secret` field**, so dsh-TUI writes the draft
  through the credentials seam under the declared ref and never into a
  settings document; the ref must stay out of the host-reserved namespace
  (`DEEPSEEK_API_KEY`/`DEEPSEEK_*`/`DSH_*` — dsh-TUI silently DROPS a field
  with a reserved ref, which would leave a page with no key input at all), and
  a secret field has no `format`/`parse` (the host never seeds a draft from
  the document).
  (3) **Unset must stay reachable**: dsh-TUI's `select` kind can only land on
  a declared option, so `activeAccount` is `text` + `options` (the host's own
  preset-plus-custom shape) with an `auto` sentinel whose `parse`
  emits `{ kind: 'clear' }`. `filterModelsByPlan` likewise FORMATS its
  effective default (`true` when unset) instead of the raw `undefined`, since
  a raw boolean format would render "(empty)" on a fresh install.
  (4) **Registration is a declaration, not a binding**: the host renders a
  fixed field list, so anything frozen into it (the credential ref, the
  account-slot option list) is refreshed by re-registering from the
  `installSection` `onChange` hook — withdraw first, then declare, and only
  when `sectionSignature()` actually moved, or every ordinary settings write
  would churn the screen's section list. A rejecting host is contained with a
  warning (a shadow-mode capability policy, a future contract change) and stays
  retryable, never fatal. Pinned by `tests/tui-settings.test.ts`.
- **Client-side staging survives a failed save** (`src/client/settings.ts`):
  writes run in order and stop at the first failure, so reconcile must keep
  every draft the failed write did not land. A label draft is dropped only when
  the stored label proves it landed; a rule draft only when the stored rules
  fingerprint changed (the rules write landed, positional ids shifted, and a
  kept draft would land on the wrong row) — `ruleFingerprint()`. Treating
  "absent from the stored section" as "already applied" silently reverted typed
  labels and rule edits with `dirty` false, i.e. no retry. `writeAccounts()`
  additionally rebuilds the stored list rather than the page's rows: the
  settings layer replaces the whole `accounts` array, so a rebuilt list deletes
  every composition entry the page cannot name (literal-key entries have no
  row) and strips their literal keys.
- **`catalogIsReady` gates the stale-model cleanup** (`src/client/model-select.ts`):
  an empty catalog — before the first fetch lands, or after a failure — makes
  every selected id look retired, so the one-click cleanup would empty the
  allowlist. Require a non-empty catalog and no failure; the explicit "show
  all" action stays available without one.
- **Sidebar plans & quota panel (`sidebar.footer.action` + `main`, both id
  `commandcode-panel`)**: the plugin's usage facts used to be reachable only
  through **Settings → Command Code**; the sidebar now ends with a **Command
  Code** card pinned directly above the Settings seat, showing the serving
  account's plan, BOTH quota windows (5-hour then weekly) with each window's own
  spend and limit, plus a ring glyph, and clicking it opens a full dashboard in
  the center column. Eight rules are load-bearing.
  (0) **The two surfaces show different things, on purpose.** The card answers
  "what stops me right now", so it carries only the ROLLING windows and, for
  each one, that window's OWN spend against its own limit (`$1.32 / $6.00`) as a
  full-width bar under a head line. The monthly limit/usage bar is
  DASHBOARD-ONLY — it moves once a billing period, so it is not a live ceiling.
  Do not "complete" the card by adding the monthly bar back, and do not drop the
  windows from it; `tests/panel.test.ts` and `tests/panel-render.test.ts` both
  assert the split (the card carries no `monthly` bar, the dashboard still
  carries its tiles). The window amounts really are dollars — the endpoint
  reports a Pro account's five-hour cap as `3` and its weekly cap as `6` (the
  captured response in `tests/usage-report.test.ts`) — so they go through the same
  `money()` helper as every other figure (2 decimals, 4 below a cent). A window
  with no cap is skipped rather than drawn at a meaningless `0%`, and the
  period's total spend (`usage.totalCost`) is NOT a row: it would sit beside the
  weekly window's near-identical figure, so it rides `footTitle` (the tooltip
  and accessible name) instead.
  (1) **Two registrations, one navigation entry — both are required.**
  `sidebar.footer.action` is the list the shell renders in its foot area
  directly above `sidebar.settings` (`footArea` = `footerActions` then
  `settingsArea`); `sidebar.panellist` — the top global-panel list — is NOT used
  and a row registered there appears at the very top of the column instead.
  The card calls `ctx.layout.selectPanel(id)` itself, which resolves the id
  against the layout's keyed `main` registry and **throws** when nothing
  occupies that cell, so the panel registers a `main` cell under the SAME
  `commandcode-panel` id; the registration also sets `order: 1` because the
  renderer sorts list entries by `order` ascending (ties keep registration
  order) and ui-cordis's footer chip sits at the default 0 — that is what keeps
  the card the last action, adjacent to Settings. Neither slot belongs to this
  plugin (ui-sidebar / ui-layout declare them), and neither package is a
  dependency of this bundle, so `src/client/panel-slots.ts` re-states both
  SlotMap entries exactly as `card.tsx` does for the Models card — keep the
  merge structurally identical to upstream's, since it is what turns an
  upstream contract change into a compile error here instead of a silent
  mis-registration.
  (2) **The panel is English by construction, not by locale.** Its copy lives
  in the plain `src/client/panel-copy.ts` table; neither registration declares
  a `locale` namespace and the components never take a `t` seat. That is the
  whole mechanism: this panel was English before the rest of the plugin was.
  Every surface is English-only now, so routing this one through `ctx.locale`
  would gain nothing; `tests/panel.test.ts` / `tests/panel-render.test.ts`
  assert the rendered markup carries no Chinese.
  (3) **The components take the framework-bound `useX` seats — never a raw
  `hooks` bag.** A registration's `inject` factory returns `{ hooks: {...},
  ...actions }`, and the renderer's `bindInjectSources` (ui-renderer
  `lib/client.js`) DESTRUCTURES that `hooks` compartment out and re-exposes each
  member as a `use<Name>` prop: `commandCodeUsage` arrives as
  `props.useCommandCodeUsage(selector)`. Reading `props.hooks.*` therefore
  finds `undefined` at runtime and throws during render — and the slot renderer
  contains a render crash by **abdicating** the entry (`SlotErrorBoundary` →
  `reportEntryError(..., { abdicate: true })`), so the surface vanishes with NO
  visible error at all. That is exactly how the panel first shipped invisible:
  the live Slots inspector on the running page showed our slot with
  `occupants: []` while our `settings.section` entry was present — the bundle
  had applied, so the entry had registered and then abdicated. This works for a
  FOREIGN slot (`main`) just as well as for one we declare, because the seat
  derives from OUR entry's inject face, not from the slot's declarer — do not
  hand-roll a store subscription instead.
  Both registrations must carry `inject` (`panelFace`), or that entry receives
  none of the panel's data. `tests/panel-render.test.ts` reproduces
  `bindInjectSources` and renders only the bound props, so a regression fails
  loudly there instead of silently in the browser. When a slot surface is
  mysteriously absent, inspect the live slot tree BEFORE re-reading the source:
  an empty `occupants` for a declared slot separates "never registered or
  abdicated" from "rendered but styled/clipped wrong".
  (4) **A footer action is the WHOLE surface, and `wide` is really supplied.**
  Unlike a `sidebar.panellist` row — where the shell owns the button, the
  selected highlight and the `[glyph][title]` chrome, and resolves the title
  from the registration's cached `label` — `sidebar.footer.action` wraps nothing:
  the component renders its own `<button>`, its own title and tooltip, and calls
  the `open` action itself. `SidebarFooterActionOwnerProps` is `{ wide }`, so the
  rail variant is driven by the real prop (16px ring card when wide, a 36px
  rail icon button when not). That removal of the shell's label cache is why
  there is no more re-register-on-text-change dance: the plan and the percentages
  simply re-render from the usage store.
  (5) **The footer action row must be stacked, and the card must claim a line.**
  The shell renders `footerActions` as a flex ROW whose occupants each declare a
  full-width line and shrink-proof flex (ours and ui-cordis's chip), so two
  occupants overflow the column and one can be squeezed to zero width — an
  invisible surface with no error, the same failure shape as (3). The panel
  stylesheet therefore sets `[class*="_footerActions"]{flex-direction:column}`
  and `.ccp-foot{flex:0 0 auto;width:100%;min-width:0}`. Match a container by its
  CSS-module class STEM, never a hashed name (the hashes change per build), and
  keep the degradation graceful: a dsh that renames the stem leaves the shell's
  own row. `tests/panel-styles.test.ts` pins both the override and the absence of
  a hardcoded hash.
  **And its bars must be blockified.** Because the card renders inside the
  shell's own button, its content is phrasing content, so the bars are spans —
  and an INLINE box ignores width and height, which is exactly how the card
  shipped with a painted track and an invisible fill (the track is a flex item
  and so gets blockified by its container; the fill is not). `.ccp-footBar` and
  `.ccp-footFill` both declare `display:block`, pinned in the same test. A
  collapsed CSS box is invisible to server-rendered markup, so layout invariants
  of this kind belong in a stylesheet assertion, not in
  `tests/panel-render.test.ts`.
  (6) **One upstream poll, refcounted** (`startPanelAutoRefresh` in
  `panel.ts`): the footer card and the dashboard can be mounted at once, so the
  first mount fetches immediately and the module-level loop is released only
  when the refcount hits zero. Ticks go through `usageController.refresh()`,
  whose in-flight collapse is what keeps a tick from stacking a second report
  request. The disposer checks the REFCOUNT, not its own ticket — the surface
  that started the loop is not necessarily the last one to unmount.
  (7) **The stylesheet rides its own `ctx.effect`** (`injectPanelCss`, called
  once from `applyClientSurfaces`), not an `inject` callback's return value, so
  its lifetime is the plugin fiber's and is unaffected by a slot declaration
  collapsing and re-declaring. Each registration is individually guarded
  (try/catch around `slots.inject`) because `slots.inject` rethrows a callback
  failure synchronously once the declaration exists, which would abort
  `applyClientSurfaces` and take the other surfaces down with it —
  `tests/client-boot.test.ts` pins that containment by failing one slot.
  **The monthly figures mean what the official CLI means by them.**
  `plan.monthlyCredits` is the period's allowance — the LIMIT — while the billing
  endpoint's `credits.monthlyCredits` is what is *left* of it, so usage is the
  difference (`getCreditDepletionPct` in `command-code/dist/cli.mjs`, whose own
  wording is "Plan: N% used, X credits left"). Never print the remaining balance
  as if it were the limit, and never derive a percentage without a limit: an
  unknown plan keeps its balances and gets no bar (`PanelMonthlyView.known`).
  `tests/panel.test.ts` pins the math (including a negative balance clamping to
  zero) and the unknown-plan fallback.
- **Composer session cost (`conversation.composer.dock`, id
  `commandcode-session-cost`)**: the harness's own token-usage UI shows the cost
  — the amount as the last item of the shipped pill's text run
  (`1.2M tokens · Cache hit 87% · $0.0123`), and a price on the right of each of
  the usage dialog's OWN token rows — no rows of ours, and the cache-write row
  dropped. The registered entry renders NO
  surface of its own; it exists for its SEATS, since `useProjection` is a prop
  the composer hands every dock occupant (`src/client/session-cost-view.tsx` is a
  hidden marker plus those seats, `src/client/session-cost-display.ts` owns the
  injection). Eight rules are load-bearing.
  (1) **Inject, never shadow.** Registering under the shipped `stats` cell's id
  would REPLACE the tokens / cache-hit / throughput readout (the registry's
  `entriesOfSlot` dedupes a `list` slot by id and keeps the first), and owning
  that cell means owning the `chat` locale's token and duration formatters, the
  exact-integer `formatCacheHitPercent` (a partial hit may never round up to
  100%), both dialogs and their CSS. `tests/client-boot.test.ts` pins the
  distinct id, the absent `order`, and an inject face of exactly
  `commandCodePrices`.
  (2) **Both anchors are semantic `data-` attributes, never hashed classes**:
  `[data-composer-stats]` (the shipped stats row) and
  `[data-session-stats-usage]` (its usage dialog's `<dl>`, unique in
  `dsh-client-ui-chat` — the per-message turn-usage panel has its own markup).
  The pill is the LAST `button[aria-haspopup="dialog"]` in that row (the time
  pill precedes it, and is no button at all when no step carries timing). The row
  is found through our outlet anchor's parent (rule 6); the dialog is found
  document-wide because it is portaled onto `body` — a single-composer
  assumption DSH satisfies today.
  (3) **The price goes INSIDE the shipped value cell, which is why there is no
  CSS.** ui-chat styles that `<dl>` as a two-column grid and then `.details dt` /
  `.details dd` — by ELEMENT, not by class — so a span appended to a `dd`
  inherits that cell's tabular numerals and right alignment. It carries only
  inline layout (`inline-block`, `min-width:56px`, `text-align:right`, a `6px`
  left margin), so the prices line up as a column of their own beside the counts.
  Nothing is appended to the `dl` itself: the rows stay the harness's. The panel
  is `width:max-content`, so the first decoration may widen it —
  `useAnchoredPosition` observes the panel and re-anchors it when that happens.
  (4) **Rows are matched by POSITION and confirmed by VALUE, and a price is
  re-attached rather than assumed.** The shipped labels are the `chat` locale's
  own strings (`Uncached input` in English, `未缓存输入` in Chinese), so no label is
  ever read: the shape is predicted from the buckets (the cache-hit row while
  there is billed prompt input, the cache-write row while those tokens are
  non-zero) and every other cell must then carry exactly the count predicted for
  it. A dialog that does not confirm is left completely alone — pricing the wrong
  cell would be worse than pricing none. React renders each count as ONE string
  and rewrites such a cell through `textContent` when the count moves, which
  drops every child with it, so each sync re-checks that our price is still
  parented and appends it again if not. The cache-write pair is hidden instead
  (`display:none` on both cells, given back on disposal), because the page
  publishes a rate for that bucket on a minority of models; its tokens still
  count toward the total the pill shows. The only observer is a `childList` one
  on `body`, and only to learn that the dialog opened or closed (it has no slot
  of ours inside it) — never `subtree`, or streaming text would wake it.
  `tests/session-cost-display.test.ts` drives the injected `Document` and
  observer seams with a double that throws on a selector it does not model.
  (5) **The amount survives a narrow composer and reads as one run.** The pill is
  an inline flex row with a `gap`, and its label carries `min-width:0` plus
  ellipsis while our span keeps the default `min-width:auto` — so the LABEL
  truncates and the cost stays visible. The separator is its own `aria-hidden`
  node carrying the shipped separator colour with a right margin only (its left
  spacing is the flex gap); the value inherits the pill's typography and
  hover/expanded tint. For assistive technology the cost rides a hidden node
  named by `aria-describedby` — the pill computes its own `aria-label` every
  render and cannot be extended — claimed only when the button has none of its
  own and released on dispose, plus a `title` with the breakdown.
  (6) **The entry renders a hidden marker and nothing else**, solely to locate
  THIS composer (`closest()` on the dock outlet, then its parent). The marker is
  inline `display:none`, so it adds neither a box nor a card flex gap, and it
  mounts only while there is a figure, so an unpriceable session contributes no
  markup. It stays a dock ENTRY because that registration is what delivers the
  seats; `tests/session-cost-render.test.ts` pins the marker-only markup, every
  quiet null, and that the plugin-owned panel is gone.
  (7) **Tokens come from the whole-log projection, never the chat window**: the
  buckets are `useProjection('tokenUsage')`, the same durable accumulation the
  shipped pill reads, so the two figures cannot disagree. The model comes from
  `modelSelection` — `lastUsed` wins (what the tokens were billed at), `next`
  covers a first request, and a pending selection that DIFFERS from `lastUsed`
  marks the figure `≈` instead of repricing it. Only `provider === 'commandcode'`
  is priced at all. Everything unpriceable (no usage, no model, no table, an
  unknown model, another provider's session, all-zero buckets) injects NOTHING
  rather than `$0.00`; a free model says `Free` on the pill and prices no dialog
  row. `tests/session-cost.test.ts` pins the arithmetic, the tooltip, and the
  plan both surfaces receive.
  (8) **The rates are Host-owned and the peak half is chosen from the ROW.**
  `src/model-prices.ts` vendors the page's per-model rates (USD per 1M tokens)
  and serves them over `commandcode/prices` with the peak windows; the browser
  carries no rates at all (a client copy would drift, and a rate update would
  need a rebuild). Its ids are the page's SLUGS (`deepseek-v4.1-flash`) while a
  session reports a CATALOG id (`deepseek/deepseek-v4.1-flash`), so the Host
  resolves them with generated candidates (lowercase, vendor-stripped,
  hyphen-inserted, date/preview-suffix trimmed) plus one override for
  `nvidia/nemotron-3-ultra-550b-a55b` → `nemotron-3-ultra`, serves rows keyed by
  catalog id AND slug, and includes page rows no catalog model claims;
  `tests/model-prices.test.ts` fails when a catalog model has neither a price nor
  a free deal — the reminder to extend that mapping. A row's top-level rates ARE
  its off-peak rates (the generator asserts it against the page's duplicated
  `offPeak` block), so which half of the day applies follows from the ROW having
  a `peak` block plus `isPeakPricingHour()`, never from `KNOWN_PEAK_PRICING`
  membership, which keys off the catalog id spelling. Nothing here polls: the
  table is static, so `CommandCodePricesController` is a one-shot cache fetched
  once the Remote namespace lands.
- **Static capability snapshots** (all in `src/capabilities.ts`, synced from official sources — see the `dsh-commandcode-upstream` skill for the exact extraction procedures; `src/adapter.ts` imports them and keeps only stable wire/runtime logic):
  - `KNOWN_EFFORTS` — model → selectable reasoning-effort levels. Authoritative source is the CLI bundle's commandcode-provider model table (`command-code/dist/cli.mjs`; minified table/variable names change per release — locate it by the `reasoningEfforts` feature, see the skill), **not** the docs page (whose `Reasoning` flag means "thinks", not "has effort levels").
  - `KNOWN_IMAGE_MODELS` — Vision-capable models, synced from [commandcode.ai/docs/reference/cli/models](https://commandcode.ai/docs/reference/cli/models); note catalog IDs can differ from doc IDs (e.g. `claude-haiku-4-5-20251001` vs doc's `claude-haiku-4-5`).
  - `KNOWN_THINKING_MODELS` — models with `reasoning:!0` but no effort levels in the commandcode-provider table (they think automatically). Not displayed in the picker.
  - `KNOWN_PLANS` — catalog ID → minimum plan tier (`go`/`goat`/`pro`/`provider`), synced from the plan pages ([go](https://commandcode.ai/docs/plans/go) ⊂ [goat](https://commandcode.ai/docs/plans/goat) ⊂ [pro](https://commandcode.ai/docs/plans/pro) ⊂ provider/max). Strict superset chain; every catalog ID covered exactly once (44/50/63/70 as of 2026-09-10, command-code@1.53.0 — 1.53.0 added `deepseek/deepseek-v4.1-flash` on Go; 1.52.0 added the free `inclusionai/ling-3.0-flash-sante:free` on Go; re-verified unchanged from 1.49.0, which added `gpt-6-astra` on Provider/Max; 1.48.0 added `max` effort to Muse Spark 1.3; 46/52/65/71 as of 2026-09-04, command-code@1.47.0 — 1.41.0 added `Qwen/Qwen3.8-Max-0902` on Go, 1.42.0 added `meituan/LongCat-2.0:free` on Go, 1.43.0 added `google/gemini-3.8-flash` on GOAT, 1.44.0 added `meta/muse-spark-1.3` on GOAT + its Contributor sibling on Go; 43/47/60/66 at command-code@1.40.1 — `claude-fable-5-1` joined Provider/Max after 1.40.0 shipped it on the Provider API (the alpha.5 note that it was Anthropic-OAuth-only was wrong); 43/46/59/64 at 1.40.1 before that fix; `deepseek/deepseek-v4-flash-fast` joined Go in 1.39.0; 1.39.2 retired `minimax/minimax-m3-free` + `minimax/minimax-m2.7-free` and the upstream catalog renamed `tencent/Hy3` to `tencent/hy3-paid` (the hidden free variant); `inclusionai/ling-3.0-flash-free` was removed when its free promo ended 2026-08-03; 40/44/57/62 at 1.37.0 — `tencent/hy4-preview` joined Go (routed through OpenRouter); 39/43/56/61 as of 2026-08-27, command-code@1.36.0 — `Qwen/Qwen3.8-Flash` + `z-ai/glm-5.3-flash` joined Go and `stealth/ox-alpha` left when its preview ended in 1.34.0; 38/40/53/60 as of 2026-08-26, command-code@1.33.0 — the `minimax/minimax-m3-free` + `minimax/minimax-m2.7-free` promo variants joined Go; 36/40/53/58 at 1.32.2 when `deepseek/deepseek-v4-flash-vision-exp` joined Go in 1.32.0; 35/39/52/57 at 1.31.0 when `stealth/ox-alpha` joined Go; 34/38/51/56 at 1.28.4).
  - `KNOWN_SUBSCRIPTION_PLANS` — subscription `planId` prefix → `{ name, monthlyCredits, tierWeight }` for the account's own plan (from `/alpha/billing/subscriptions`), synced from the CLI bundle's plan maps (minified variable names change per release — locate them by the `"individual-go"` key; `tierWeight` is plugin-added for the picker filter). `subscriptionPlanInfo()` mirrors the CLI's `getPlanInfo` longest-prefix matching. Distinct from `KNOWN_PLANS` (model → minimum tier).
  - `KNOWN_DEALS` — catalog ID → `{ label, expiresAt?, free? }` from the pricing page's `#deals`. **Expiry-aware**: `dealLabel()` hides a deal once `Date.now()` passes its `expiresAt`, so an un-updated plugin never shows a lapsed discount.
  - `KNOWN_PEAK_PRICING` — catalog IDs with hourly (peak/off-peak) pricing, synced from the pricing page's **embedded model JSON `timeOfDay` blocks** (never the rendered row text — see the skill). Exactly four models as of 2026-09-10: `deepseek/deepseek-v4-pro`, `deepseek/deepseek-v4-flash`, `deepseek/deepseek-v4-flash-vision-exp`, `deepseek/deepseek-v4.1-flash` (added in command-code@1.53.0 at $0.15/$0.60 off-peak, $0.30/$1.20 peak, same schedule); `deepseek/deepseek-v4-flash-fast` is flat-priced ($0.28/$0.56/$0.07) and must stay out. Peak windows live in `PEAK_HOUR_RANGES` (UTC, end-exclusive) and apply **Monday–Friday only** — the official rule charges Saturday/Sunday completely off-peak for all 24 hours — so `peakPricingState()`/`peakPricingLabel()` map the current UTC **weekday+hour** to `Peak`/`Half` (35 peak hours per week, 7 per weekday, 0 on weekends). `PEAK_HOUR_RANGES` is exported and `isPeakPricingHour()` splits the weekday+hour rule out of the membership test: the vendored price table stores each hourly model's `peak` block, so the cost math selects the peak half from a ROW (not from `KNOWN_PEAK_PRICING` membership) and would otherwise misprice a row whose id spelling differs from the catalog's.
  - The picker `description` is composed by `capabilityDescription()`: plan tier · active deal · peak/off-peak state (`Peak`/`Half`, hourly-priced models only) · `Image` (Vision only) · context (`formatContext()`: `1M`/`256K`/`262K`). Text-only models show no capability marker. Do not reintroduce "Text only" or "Supports image input".
  - The picker list is **sorted free models first, then by plan tier, then name** (`compareByPlan()` in `src/capabilities.ts`; free = `KNOWN_DEALS` `free: true` via `isFreeModel()`, tier weights in `PLAN_ORDER`): FREE → Go → GOAT → Pro → Provider/Max, alphabetical within each group, unknown plans last. Keep this order when changing `listModels()`. `formatContext()` renders sub-1K windows raw (never `"0K"`).
  - The picker also **hides models above the account's subscription tier** (`modelVisibleInPlan()`, on by default via `filterModelsByPlan`): the billing facts mirror the CLI's `createBilling` flow — whoami → orgId, then `/alpha/billing/subscriptions` (planId, honored only for `active`/`trialing`/`past_due` statuses) and `/alpha/billing/credits` (on-demand balances; its `credits.planId` is the fallback when subscriptions fails) — cached for `BILLING_ACCESS_TTL_MS`. The filter **fails open** everywhere (endpoint failure, unknown plan, unknown model) and is **bypassed by any positive on-demand balance** (`purchasedCredits + freeCredits > 0`) — mirroring the CLI's `evaluateModelAccess`. The catalog itself is never filtered; `resolveModel` still serves every model and the server remains the final gate.
  - The picker also supports a **visible-model allowlist** (`Config.visibleModels: string[]`, the settings page's Visible models card): a non-empty list narrows `listModels()` to those catalog ids AFTER the plan filter; empty/unset shows everything. It never gates named requests (`resolveModel` still serves every model). The allowlist is staged through `visibleModelsDraft` in `src/client/settings.ts` (same draft/dirty/plan/write/reconcile shape as the rules card, one `visibleModels` write) and cleaned of non-strings/blanks at both ends (`storedVisibleModels()` + `resolveAdapterOptions`). `listModels(provider, { unfiltered: true })` skips BOTH filters so the `commandcode/models` Remote always serves the full catalog to the page editors; the adapter override stays signature-compatible with the base (`_provider` only) via the optional second param. `tests/adapter.test.ts` pins the narrowing + unfiltered paths; `tests/settings.test.ts` pins the controller staging.
  - **`Config.modelVisibility: Record<string, boolean>`** is the terminal page's per-model override layer over that array: an id present decides its own model (`true` listed, `false` hidden), an id absent keeps following `visibleModels` exactly as before, and the plan filter still applies on top. It exists because of a hard dsh-TUI constraint, not a preference: the seam's only control for a per-model list is a `boolean` field, and the host keys a staged draft by the field's PATH (`fieldKey` in its `settingsEditor.ts`) — so N checkboxes sharing the `visibleModels` path share ONE draft, every one of them parses it in `save()`, all N write ops address the same path, and **only the last field's op survives**. That silently rewrote the allowlist from the last catalog model instead of the row the user toggled (found by driving the real `SettingsForm` over the section). A map gives every checkbox a path of its own. The TUI stages an override only when it DISAGREES with the array (otherwise a `clear`), so toggling back to the inherited state leaves no residue; `readModelVisibility()` drops non-boolean entries, so a hand-edited document falls back to the array instead of hiding a model. `tests/tui-settings.test.ts` pins the unique-path invariant (a regression test for that bug) and the override semantics; `tests/adapter.test.ts` pins the resolution order.
  - The settings page's model editors share one dropdown (`ModelMultiSelect` in `src/client/section.tsx` over React-free helpers in `src/client/model-select.ts`, pinned by `tests/model-select.test.ts`): a search box filters by id/display-name substring (blank = all), entries group under plan-tier headings, stale selections (retired upstream) render flagged with a one-click cleanup on the Visible models card (never auto-dropped — an empty catalog from a fetch failure must not wipe the list). Tier headings ride the `commandcode/models` Remote per entry (`CommandCodeCatalogModel.tier`, stamped Host-side from `KNOWN_PLANS`; optional on the wire for older Hosts, shaped defensively in `refreshCatalog()`), because the client bundle cannot import `src/capabilities.ts` — when upstream adds a plan tier, extend BOTH the Host snapshot and the vendored `TIER_HEADINGS` in `model-select.ts`. The client-bundle constraint (platform/seed modules only, see the tsdown `external` list) is why the tier travels on the wire instead of an import.
- **Retry**: `providerRetryPolicy()` pins a near-unbounded transient-only policy (`mode: 'normal'`, `maxRetries: 1000`, whitelist `EMPTY_RESPONSE`/`RATE_LIMIT`/`SERVER`/`TIMEOUT`/`TRANSPORT`) — opencode-style persistence that still fails fast on permanent errors (`INVALID_CREDENTIAL` etc. are not retryable); waits double from 500 ms and cap at 15 min (`RETRY_MAX_DELAY_MS` in accounts.ts, ±10% jitter); executed by dsh-llm-retry (active in every default profile via dsh-base) at agent-step boundaries. Smart waits ride `providerRetryAfterMs` on the thrown `LlmError`: a 429's `Retry-After` header is parsed and attached, and the rotation pool's all-exhausted `RATE_LIMIT` attaches the wait until the earliest known window reset — both **capped at `RETRY_MAX_DELAY_MS`**, because in normal mode the executor abandons (not falls back on) a retry whose attached wait exceeds the cap. Captured once at route registration, so any future config knob for it would apply on profile restart.

## Commands

```sh
npm install             # devDeps incl. tsdown, tsx, typescript
npm run typecheck       # tsc --noEmit
npm test                # node --import tsx --test tests/**/*.test.ts
npm run test:install    # pack + install in a fresh pnpm 10.34.5 generation
npm run build           # tsdown -> lib/ (also runs via `prepare` on publish/git install)
npm pack --dry-run      # verify publish contents (must include lib/, cordis.patch.yml, README.md, LICENSE)
```

## Release procedure

1. `npm version patch|minor|major --no-git-tag-version` — bump without auto-tag.
2. `npm run typecheck && npm test && npm run build`.
3. Commit, then `npm publish` (requires the maintainer's 2FA OTP; the maintainer runs it, not the agent).
4. Tag and push: `git tag v<version> && git push && git push --tags`.
5. **Create a GitHub Release** for the tag (`gh release create v<version> --title "v<version>" --notes-file <file>`). The release notes are written in **English**. **Style: short and user-facing** — one or two sentences per entry saying WHAT was added, changed, or fixed and what it means for the user; NEVER how (no file names, no internal function/mechanism names, no implementation or debugging narrative). This repository keeps **no changelog file**, so the release notes are the only user-facing record of a change — write each entry to stand on its own. Releases — not tags or pushes — are what star followers see in their activity feed and get notified about; skipping this step makes the release invisible to users who starred the repo.

## Rules

- Keep changes focused; the wire logic is pinned by tests — update `tests/adapter.test.ts` when you change behavior.
- Do not commit, tag, push, or publish unless explicitly asked.
- Do not reintroduce scanning other tools' auth files.
- Public API (exports from `src/index.ts`) is used by dsh's loader/registry — preserve `name`, `inject`, `Config`, `apply` and the `dsh.bundle` manifest shape.
