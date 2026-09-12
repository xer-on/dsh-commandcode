# Command Code for DeepSeek Harness

[![Awesome](https://awesome.re/badge.svg)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
[![GitHub Repo stars](https://img.shields.io/github/stars/xer-on/dsh-commandcode?style=flat-square)](https://github.com/xer-on/dsh-commandcode/stargazers)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4D6BFE?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/xer-on/dsh-commandcode/pulls)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/badge/npm-@xer--on%2Fdsh--commandcode--provider-blue.svg)](https://www.npmjs.com/package/@xer-on/dsh-commandcode-provider)

Unofficial [DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/) LLM provider plugin for **Command Code** — the provider route, its settings page, the sidebar plans & quota panel, and a live session cost inside the composer's token-usage figures.

> This is a community integration. You need your own Command Code account and API key or subscription, and Command Code's terms apply. This project is not affiliated with Command Code, Inc.

## What you get

- **Plugin bundle** — install into any dsh profile with `dsh plugin add`; registers a `commandcode` provider route with a live model catalog.
- **Sidebar plans & quota panel** — a **Command Code** card sits at the bottom of the sidebar, right on top of Settings, showing your plan and both quota limits (5-hour and weekly) with the dollars spent against each; click it for the full dashboard. See [Plans & quota panel](#plans--quota-panel).
- **Live session cost** — the harness's own token-usage line under the message box ends with what the current session has cost so far in dollars, and opening that pill's usage dialog puts a price on the right of each token row. Priced per model from Command Code's published rates and following peak/off-peak pricing. See [Session cost](#session-cost).
- **Dedicated settings page** — API key, connection options, a live account-usage card, and a "Hide out-of-plan models" toggle.
- **Works in the terminal too** — the same install serves a [dsh-TUI](#terminal-ui-dsh-tui) profile, with its own **`/settings` → Command Code** page for the API key and the model controls.
- **Models-page key card** — the **Settings → Models → Command Code** card carries the key status, a paste field, and the sign-in button inline.
- **In-browser sign-in for keys** — start the official authorization flow (the same one `cmd login` runs) from the settings page; the approved key lands in the local credential service automatically. Manual paste remains the fallback.
- **Multi-account rotation** — when one account hits its usage limit, requests switch to the next account automatically. See [Account rotation](#account-rotation).
- **Flexible API key setup** — via the settings page, an environment variable, or the official CLI login file.
- **Model-picker annotations** — minimum plan, active deal or `FREE` badge, peak/off-peak state, image support, and context window; free models listed first.
- **Plan-aware picker** — models above your subscription tier are hidden by default (toggleable); an optional **Model allowlist** keeps only your favorites in the picker.
- **Reasoning-effort support** — models with selectable reasoning effort levels expose them in the picker.
- **Image input** — Vision-capable models accept images.
- **Web search** — the dsh `web_search` tool is backed by the Command Code Provider API (`/alpha/web-search`) with the same key/endpoint as chat, so no separate search key or base URL is needed. See [Web search](#web-search).

See [Screenshots](#screenshots) below for what the UI looks like, and [How it works](#how-it-works) for what happens underneath.

## Install

Pick the release line that matches your DeepSeek Harness version:

- **dsh 0.1.2-rc.1 or later** (the current 0.1.2 line — what `@latest` installs today):

  ```sh
  dsh plugin --profile web add @xer-on/dsh-commandcode-provider@latest
  ```

- **Older dsh releases** (the 0.5.0 line and earlier, which use the rc-era Host/browser APIs) — the last plugin version supporting them is 0.9.1, installed by exact version. That line is no longer under active maintenance:

  ```sh
  dsh plugin --profile web add @xer-on/dsh-commandcode-provider@0.9.1
  ```

> The `latest` tag points at the current 0.1.2-line plugin release. Users on the old 0.5.0-era Harness line must pin `@0.9.1` explicitly.

**pnpm 11 holds back new releases.** Its `minimumReleaseAge` defaults to 1440 minutes, so a version published less than a day ago is skipped and `@latest` resolves to the *previous* release — silently, with a success exit code. To install a release from the last 24 hours, name it exactly:

```sh
dsh plugin --profile web add @xer-on/dsh-commandcode-provider@0.10.5
```

The same applies to every profile you install into, including the terminal UI below.

Fresh pnpm 10 marketplace generations are supported directly. Do not add a separate `@deepseek-ai/dsh-invariants` dependency; the plugin declares it as a Host peer so the active dsh profile remains the owner of Harness packages.

## Updating

Update with the same tag you installed with:

```sh
dsh plugin --profile web update @xer-on/dsh-commandcode-provider@latest     # dsh 0.1.2-rc.1+
dsh plugin --profile web update @xer-on/dsh-commandcode-provider@0.9.1      # older dsh (0.5.0 line, unmaintained)
```

Each profile updates separately — the terminal UI owns its own plugin list (see below):

```sh
dsh plugin --profile dsh-tui update @xer-on/dsh-commandcode-provider@0.10.5
```

To move to a version published less than 24 hours ago, name it exactly as in Install above; pnpm 11's age gate resolves `@latest` to the previous release instead.

Then restart the web app.

## Getting an API key

The easiest path is the official CLI (Node.js 22+):

```sh
npm i -g command-code@latest
cmd login        # macOS/Linux; native Windows: cmdc login
```

Or skip the CLI: click **Sign in to Command Code** under **Settings → Command Code** — your browser opens the commandcode.ai authorization page (the same flow `cmd login` uses) and the key is stored in the local credential service when you approve. You can still create a key on the [Keys settings page](https://commandcode.ai/settings/keys) and paste it into **Settings → Command Code**, or `export COMMANDCODE_API_KEY="user_..."`.

> The sign-in flow needs the Host and your browser on the same machine (loopback callback). With a remote Host, paste the key manually; a literal composition-level `apiKey`, if set, still takes precedence over a signed-in credential.

## Verify it works

After restart, enter your API key in **Settings → Command Code** and save; **Settings → Models** shows a **Command Code** card, and the model picker lists the live catalog under **commandcode**. Send a message with a model your plan includes.

## Terminal UI (dsh-TUI)

The plugin also works under a terminal front door. **Each dsh profile owns its own plugin list**, so the web install above does not reach the terminal — add the plugin to the `dsh-tui` profile as well:

```sh
dsh plugin --profile dsh-tui add @xer-on/dsh-commandcode-provider@0.10.5
```

Pin the exact version here. For the first 24 hours after a release, a bare package name (or `@latest`) is silently resolved to the previous one: the install succeeds, but the profile gets the older build — which is how a fresh terminal install ends up with no **`/settings` → Command Code** page and no `commandcode` models at all.

Then pick the provider in the model selector, or name it directly:

```text
/model commandcode/deepseek/deepseek-v4.1-flash
```

`/model` lists every registered provider, with Command Code's live catalog and its plan/deal/context annotations.

**Entering the key.** The TUI has no web Models page, so the plugin declares its own page in the TUI settings screen — **`/settings` → Command Code** — with the API key, the API base, the out-of-plan model filter, and the active account. The key field is write-only: it shows whether a key is configured and writes what you type to the credential store, never to a settings document. The same page is the only place a TUI-only user needs to visit.

**Picking models.** That page lists the whole catalog as checkboxes, grouped by plan tier (Go → GOAT → Pro → Provider) with the free models first, so nothing has to be typed from memory. Everything starts checked, because an unset allowlist means "show every model" — uncheck the ones you do not want in the picker. The choice is stored as per-model overrides next to the `visibleModels` list the web page edits, so both surfaces can be used interchangeably and a plain `visibleModels` written by hand still works.

Alternatively, set the key outside the TUI — any of these work, in this order of precedence:

```sh
export COMMANDCODE_API_KEY="user_..."   # launching environment
cmd login                               # writes ~/.commandcode/auth.json
```

**Making Command Code the default.** dsh-TUI pins its own agent route, and its `agent-default-model` setting does not override it. To start every session on Command Code, override the `agent-loop` row in your profile patch (`$DSH_HOME/profiles/dsh-tui/cordis.patch.yml`):

```yaml
- id: agent-loop
  inject: [tuiStartup]
  config:
    agents:
      - id: main
        provider: commandcode
        model: deepseek/deepseek-v4.1-flash
        reasoningEffort: max
        cwd: !!js process.cwd()
```

**Engine version.** The plugin needs a dsh engine that exports `ToolCallId` from `@deepseek-ai/dsh-llm` — **dsh 0.1.2-alpha.3 or later**. That includes the engine dsh-TUI recommends (0.1.2-rc.1) and every later release, but *not* the oldest engines its peer range nominally allows: on dsh 0.1.0-rc.6 or 0.1.1-rc.2 the plugin's module import fails and the TUI will not start. Upgrade the engine, or use the web profile.

## Plans & quota panel

The sidebar ends with a **Command Code** card, sitting directly above the Settings entry, so your limits and what you have spent against them are visible without opening Settings:

- **The card** shows the serving account's plan, then **both quota limits — the 5-hour window and the weekly one — each with the dollars spent against it** (`$1.32 / $6.00`), its percentage and a bar. The ring beside the title fills with the tighter 5-hour window and turns red once that window is over its cap. A window your account is not capped on is left out rather than drawn at a meaningless 0%. Collapse the sidebar and the card becomes a single icon.
- **Clicking the card** opens the full dashboard in the center column: the monthly bar with the plan's limit, the amount used, what is left and the purchased and free balances, both quota windows with their reset times, and the request, cost and token totals. On a multi-account setup, a tab strip switches between accounts.
- **It refreshes itself** while it is on screen — one fetch as the card appears, then every two minutes. **Refresh** in the dashboard header fetches immediately.
- **It reads in English** regardless of the rest of the interface's language. Everything else — the settings page, the harness itself — keeps your configured language; **Settings → General → Language** still controls those.

The card and the settings page read the same account data, so a key or account change made in either place is reflected in the other.

The card carries the two rolling windows because those are what actually stop a session; the monthly allowance moves only once a billing period, so it lives on the dashboard instead. The period's total spend is in the card's tooltip — on screen it would just repeat the weekly window's figure.

### How the monthly figures are read

On the dashboard, `Monthly limit` is your plan's credit allowance for the billing period, `Monthly used` is how much of it you have spent, and `Remaining` is what is left. These are the same two numbers the official `command-code` CLI reports, read the same way — its line is `Plan: N% used, X credits left`, where the percentage is drawn from your plan's allowance. `Purchased` and `Free` are separate balances that extend what you can spend, so they are shown on their own rather than folded into the limit. If your subscription plan is not recognized, the balances still appear but no bar is drawn — a percentage needs an allowance to measure against.

## Session cost

The harness's own session figures under the message box (tokens / cache hit) now end with what the current session has cost so far in dollars — the last item of that same text run, not a control beside it. **Open the token pill's usage dialog** — the one that already lists input, cache reads, cache writes and output — and the price is on the right of each row:

- **What is priced** — the session's own token accounting, bucket by bucket, at Command Code's published rate for the model that served it. Each of the dialog's own rows gains its price on the right (`3,206,544 tok  $0.07`) rather than a second block of rows underneath, so every figure stays on one line and the harness's layout is untouched. The cache-write row is dropped — the pricing page publishes a rate for it on a minority of models, so it read `unpriced` far more often than a number — while its tokens still count toward the total on the pill.
- **Peak and off-peak** — models with time-of-day pricing are charged at the rate actually in force: full price inside the peak windows (01:00–04:00 and 06:00–10:00 UTC, Monday to Friday), half price the rest of the week. This is why an identical amount of work can cost twice as much at 02:00 UTC on a Tuesday as at 22:00 the same day.
- **Command Code sessions only.** A session served by another provider, or running a model with no published price, shows no figure at all — pricing someone else's tokens with Command Code's rates would be worse than showing nothing.
- **Nothing is guessed.** Where the pricing page publishes no rate for a bucket, that cell is simply left unpriced rather than filled with an invented number, and the pill's tooltip says so. A session that has switched models part-way through is marked `≈`, because every token is then priced at the rate of the model the latest request used.
- **Free models** show `Free` instead of `$0.00`, and their dialog rows carry no prices at all.

The rates are the ones the official pricing page publishes (USD per million tokens), read by the plugin's Host half, so the figure comes from the same data behind the model picker's `Peak` / `Half` labels. The session cost is this session's own spend, not a billing-period total — for the account's period figures, see [Plans & quota panel](#plans--quota-panel).

## Account rotation

With several Command Code subscriptions, the plugin **switches to the next account automatically** when one hits its usage limit:

- **Setup** — use the **Account rotation** card at Settings → **Command Code** to add accounts with a label and API key; the top-level key always serves first as the `default` account.
- **Manual switching** — the **Active account** dropdown pins a preferred account; if it is exhausted, requests fall back to other accounts and return once its window resets.
- **Route models to accounts** — the **Route models to accounts** card picks catalog models (multi-select, fetched from the live catalog) and routes them to an account. A request whose model is in a rule serves from that account while it is usable; an exhausted or invalid routed account falls back to the normal rotation. Rules match in list order — the first hit wins.
- **Show only favorite models** — the **Model allowlist** card keeps only the checked models in the model picker; unchecked shows all (the default).
- **Status** — the **Account usage** card reports per-account state.

The equivalent YAML (`$DSH_HOME/settings.yaml` or composition config):

```yaml
llm-commandcode:
  apiKeyEnv: COMMANDCODE_API_KEY        # first (default) account
  activeAccount: COMMANDCODE_API_KEY_2   # optional: pin the active account (`default` or an account's credential ref)
  accounts:                              # rotation order after it
    - label: Go #2
      apiKeyEnv: COMMANDCODE_API_KEY_2
    - label: Go #3
      apiKeyEnv: COMMANDCODE_API_KEY_3
  modelAccountRules:                     # optional: route models to accounts (first match wins)
    - models:                            # catalog model ids (multi-select)
        - deepseek/deepseek-v4-pro
        - deepseek/deepseek-v4-flash-vision-exp
      account: COMMANDCODE_API_KEY_2
    - models:
        - tencent/hy4-preview
      account: default
  visibleModels:                       # optional: show only these models in pickers (catalog model ids); unset shows all
    - deepseek/deepseek-v4-pro
    - tencent/hy4-preview
```

## Configure

**Settings → Command Code** covers the API key, API base URL, working directory, and request/stream timeouts; once a key is saved, a live **Account usage** card appears at the top of the page.

The same options live in `$DSH_HOME/settings.yaml` (changes apply immediately, no restart):

```yaml
llm-commandcode:
  apiKeyEnv: COMMANDCODE_API_KEY   # credential reference
  apiBase: https://api.commandcode.ai
  workingDir: /path/to/project     # optional
  modelsCachePath: ~/.commandcode/models-cache.json
  requestTimeoutMs: 60000          # default 60s
  streamIdleTimeoutMs: 300000      # default 300s
```

## Web search

When your deployment's dsh shell mounts the web capability (`@deepseek-ai/dsh-web` + `@deepseek-ai/dsh-tool-web`), the model's `web_search` tool is served by this plugin's `commandcode` search provider — it calls the Command Code Provider API's `/alpha/web-search` endpoint with the **same API key and base URL** as chat. You do not configure a separate search key, endpoint, or model.

**On by default.** The plugin's **Settings → Command Code** page has a *"Serve dsh web search with Command Code"* toggle (`webSearch`, default on). When on, the plugin selects `commandcode` as the active search backend automatically; turn it off to hand the selection back to whichever backend was there before (a sibling search plugin such as modsearch keeps working — it is never forced back to dsh's shipped DeepSeek search). The toggle takes effect on the next search — no restart needed.

- The provider registers as `commandcode` on `ctx.web` only when the web service is present; without it this stays a chat-only plugin.
- The toggle works by selecting `commandcode` in the web seam at boot and on every settings change, remembering the backend it displaced; turning the toggle off (or unloading the plugin) restores that backend. If you'd rather pin it durably, set `searchProvider: commandcode` (or `$DSH_WEB_SEARCH_PROVIDER=commandcode`); that remains effective even if this plugin's runtime selection is unavailable.
- `numResults` from the dsh tool is clamped to the Command Code range (1–10, default 5); results map to the dsh `WebSearchSource` shape (`url`/`title`/`snippet`).

> This reuses the Command Code Provider API directly (like the official CLI's built-in `web_search`), so it is distinct from a DeepSeek-native search backend.

## How it works

Everything starts from one service the plugin owns: it registers the `commandcode` provider route on the harness's `llm` service and declares itself in the configurable-provider directory. Every other surface is a view onto that same route, which is why a key you enter in one place changes what all the others show.

### The request path

A chat turn goes through five steps:

1. **Resolve the connection.** The plugin reads the `llm-commandcode` settings section and resolves the API key in a fixed order — a literal `config.apiKey`, then the credential reference (`apiKeyEnv`, default `COMMANDCODE_API_KEY`) through the harness credential store, then the launching environment, then the official CLI's own `~/.commandcode/auth.json`. Nothing is cached: the next request already sees the next settings write, so a key or endpoint change needs no restart.
2. **Pick the account.** With more than one subscription, the account pool chooses a key — a model-routing rule first, then the pinned **Active account**, then rotation order. Rotation is passive: a key is marked only when the server rejects a request *before* any output (429 or 401). A mid-stream failure never rotates, because the request is already half-sent and the answer could not be replayed safely.
3. **Choose a transport.** Accounts with Provider API access use the documented, OpenAI-shaped `POST /provider/v1/chat/completions`. Accounts whose plan has no Provider API access — and any account the Provider API answers with `upgrade_required` — use the CLI's own `POST /alpha/generate` instead. The two are otherwise interchangeable, and the plugin picks per request.
4. **Convert, then stream.** Harness messages become Command Code wire messages (a tool call is replayed only when it has a paired tool result; an image becomes a base64 part in whichever shape the chosen transport expects), and the response — SSE for the Provider API, JSONL events for the CLI transport — is assembled into the harness's `StreamChunk` protocol: text and reasoning blocks opened and closed by index, token usage emitted before `finish`, and nothing after it.
5. **Report failures in the harness's own vocabulary.** HTTP failures become typed `LlmError`s (`INVALID_CREDENTIAL`, `RATE_LIMIT`, `PROVIDER_HTTP_ERROR`), and the transient ones carry a smart wait — a 429's `Retry-After`, or the time until the earliest quota window resets — so the harness's retry layer backs off by the right amount instead of guessing.

### The browser never holds your key

The settings page, the Models card, the sidebar panel and the composer's session cost all run in the browser, and none of them calls the Command Code API. The two halves are wired together by a small set of request/response contracts the plugin contributes to the harness's remote gateway:

| Contract | What the browser asks for |
| --- | --- |
| `commandcode/report` | The per-account usage report — plan, quota windows, spend, tokens |
| `commandcode/models` | The full model catalog, for the two model editors |
| `commandcode/prices` | The published per-model rates and the peak windows |
| `commandcode/login*` | Start, poll and cancel the sign-in flow |

The Host half does the credential work and the HTTP calls; the browser only sends a request name and receives JSON. This is also why a remote-Host setup behaves the way it does: sign-in needs a loopback callback on the Host machine, so it falls back to pasting a key, and a literal key in the config is stripped from anything the Host serves.

### Where the facts come from

Command Code publishes no machine-readable catalog, so the plugin splits its facts by how often they move:

- **Live, per request** — the model catalog (`GET /provider/v1/models`) and every usage figure come from the API itself, with an on-disk cache as a fallback so the picker still lists models when a fetch fails.
- **Vendored snapshots** — plan tiers, reasoning-effort levels, Vision support, deals and the peak/off-peak schedule. These change when Command Code ships a new CLI, so they are checked in and re-synced against the official CLI bundle and docs; the picker's annotations are read straight out of them.
- **The price table** — the per-model rates from the official pricing page, in USD per million tokens. It lives on the Host half and reaches the browser over `commandcode/prices`, so a corrected rate ships with a plugin update instead of drifting in two places.

### Where each surface lives

| Surface | Registered as | Shows |
| --- | --- | --- |
| Settings page | `settings.section` (`commandcode`) | Key, endpoint, timeouts, account rotation, model filters |
| Models card | `settings.models.provider-card` | Key status, paste field, sign-in, save |
| Sidebar panel | `sidebar.footer.action` + `main` | Plan, both quota windows and their spend; click for the dashboard |
| Session cost | `conversation.composer.dock` | What this session has cost, appended to the harness's own token-usage pill and its usage dialog |
| TUI page | `tuiSettingsSections` | The key and model controls for a terminal-only profile |

Every one of them is optional at runtime: a profile that does not mount the slot or the service simply does not get that surface, and the rest keep working.

## Notes & limitations

- **Image input is model-gated** — only Vision models accept images; text-only models refuse them.
- Switching to a text-only model in an image-bearing session is rejected by dsh — pick a model marked *`Image`* or remove the images first.
- **No `stop` sequences** — requests carrying one fail.
- On the legacy `/alpha/generate` transport, reasoning blocks are not replayed into later turns; on the `/provider/v1/chat/completions` transport, historical reasoning is passed back as `reasoning_content` so tool-calling loops can keep their chain of thought. Only tool calls with a paired tool result are replayed on both transports.
- The model catalog is browsable without a key; chat requests need one.

## Permissions & privacy

The plugin only communicates between your local dsh profile and your Command Code account: locally it touches only the credential store and the models cache (plus `~/.commandcode/auth.json` as a last-resort fallback); on the network it calls only the Command Code API. No telemetry.

## Disabling / uninstalling

- **Disable** without removing: edit your profile's `cordis.patch.yml` and comment out (or remove) the `llm-commandcode` row, or set `disabled: true`, then restart.
- **Uninstall** completely:

  ```sh
  dsh plugin --profile web remove @xer-on/dsh-commandcode-provider
  ```

  Your API key in the dsh credential store and `~/.commandcode/auth.json` are left untouched.

## Development

```sh
npm install
npm run typecheck   # tsc --noEmit
npm run build       # tsdown -> lib/
```

To try a local build in a profile:

```sh
dsh plugin --profile web add /path/to/dsh-commandcode-provider
```

After changing `src/`, re-run `npm run build` and restart the app.

## Community & feedback

- <img src="https://cdn.simpleicons.org/github/111827" width="16" alt="GitHub" /> [GitHub Repository](https://github.com/xer-on/dsh-commandcode)
- <img src="https://cdn.simpleicons.org/github/111827" width="16" alt="Releases" /> [GitHub Releases](https://github.com/xer-on/dsh-commandcode/releases)
- <img src="https://cdn.simpleicons.org/npm/111827" width="16" alt="npm" /> [npm Package](https://www.npmjs.com/package/@xer-on/dsh-commandcode-provider)
- <img src="https://cdn.simpleicons.org/discourse/111827" width="16" alt="Linux.do" /> [Linux.do community](https://linux.do/)

## License

MIT — see [LICENSE](./LICENSE).
