# Adaptation for DSH 0.2.0-rc.2

`v0.3.0` targets DSH `0.1.1-rc.1`. It is adapted here for `0.2.0-rc.2`, the
version shipped by both the DeepSeek Harness Desktop app and
`npm i -g @deepseek-ai/dsh@0.2.0-rc.2`. `git diff` against upstream `0345fa5`
is the complete change set.

## Manifest (`package.json`)

| Field | Before | After | Why |
|---|---|---|---|
| `version` | `0.3.0` | `0.3.1` | Distinguishes the adapted build. |
| `peerDependencies` (`@deepseek-ai/dsh-tools`, `-credentials`, `-client-connection`) | `0.1.1-rc.1` | `^0.2.0-rc.2` | App boot refuses to load a plugin whose `@deepseek-ai/dsh*` peers do not satisfy the running runtime (`evaluatePluginCompatibility`). |
| `peerDependencies["@earendil-works/pi-ai"]` | `^0.82.1` | `^0.87.1` | `^0.82.1` excludes `0.87.1`, the version the runtime bundles. Not peer-checked (only `@deepseek-ai/dsh*` is), but it documents the real contract. |
| `dsh.client.inject` | `["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-connection"]` | `["@deepseek-ai/dsh-client-connection", "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-settings"]` | `@deepseek-ai/dsh-client-runtime` does not exist in 0.2.0; `inject` names are boot-graph package ids and an unknown id is silently skipped, so the real dependencies were never ordered ahead of this plugin. |
| `dsh.bundle.patch` | — | `./cordis.patch.yml` | 0.2.0 installs a *bundle*: without a bundle patch the package is only a plain dependency, its Loader row never mounts, and its client bundle is never scanned or served. |

## Host half (`lib/index.js`)

- **`llm.discoverModels` cancellation.** `signal` is the third parameter
  (`discoverModels(settingsNs, request, signal)` in both `0.1.5-rc.2` and
  `0.2.0-rc.2`), not a request field. Passing it inside `request` relied on the
  pi-ai adapter spreading an off-schema key into its own request; the strict
  Remote codec drops it. Now passed as the third argument.
- **`authority: 'loopback'` removed.** `HostConnectionService.rpc.handle` takes
  exactly `(channel, handler)` in 0.2.0 — there is no per-channel authority
  tier. Admission is now the Host/Origin fence plus the browser session, run by
  `admit()` before the handler. The extra argument was inert.
- **OAuth channel registration is best-effort.** See the upstream defect below:
  if the channel cannot be opened the plugin now warns and keeps
  `gateway_configure`, instead of losing every capability to an optional
  transport.

## Client half (`lib/client.js`)

`connection.api` — the 0.1.x bundle of Host Remote namespaces — no longer
exists. 0.2.0 exposes one Cordis service per namespace (`remote.<namespace>`)
with positional arguments and a flat envelope.

| Before | After |
|---|---|
| `const api = connection.api` | `const api = { credentials, llm, settings }` from `ctx.get("remote.credentials" \| "remote.llm" \| "remote.settings")` (declared in `inject`) |
| `api.credentials.describe({ refs: [ref] })` | `api.credentials.describe([ref])` |
| `api.credentials.set({ ref, value })` | `api.credentials.set(ref, value)` |
| `api.settings.describe({})` | `api.settings.describe()` |
| `api.settings.mutate({ ns, ops })` | `api.settings.mutate(ns, ops, undefined)` |
| `api.llm.discoverModels({ settingsNs, ... })` | `api.llm.discoverModels(settingsNs, { ... })` |
| `response.result.ok / .value / .error` | `response.ok / .value / .error` |

Remote methods validate their argument count exactly
(`prepareInvocation`: `values.length` must equal `descriptor.parameters.length`,
or that plus one declared `AbortSignal`), so the optional `expectedRevision`
must still be passed — omitting it fails with
`settings/mutate expected 3 argument(s), got 2`.

Without this the section registers but renders nothing: `connection.api` is
`undefined`, so the panel's `api === undefined` guard returns `null`.

## Model plan: an import never drops a model it did not discover

A route's `models` list **replaces** that route's built-in catalog, and for a
catalog route that catalog is the only source of its ids. An import that wrote
exactly the ticked ids therefore deleted two things silently: a model added by
hand because the installed catalog has not caught up with the provider — and a
model the gateway stopped advertising.

`gpt-6.1-sol` is the concrete case. It exists in pi-ai 1.0.2 but not in the
0.87.1 that every current DSH pins, and the Codex route cannot discover it
either: discovery returns the installed catalog without touching the network,
and `openai-codex-responses` is not in `LISTABLE_PROTOCOLS`
(`anthropic-messages`, `openai-completions`, `openai-responses`), so this route
has no `/models` to read. A gateway route (`cindy`, `sub2api`, `generic`) is not
a catalog id, so it does hit `GET {baseURL}/models` and picks such a model up
automatically.

The panel now writes `selected + carried + typed`:

| Source | Written as |
|---|---|
| Ticked, discovered here | full entry: id plus the discovered capabilities |
| Present in settings, **not** discovered here | carried over verbatim, so hand-declared capabilities survive |
| Typed in the new extra-model field | `{ id }`; api and baseURL are inherited from the route |

Ids that *were* discovered but left unticked are still dropped: unticking means
"remove". `gateway_configure` exposes the same ability as a comma-separated
`extraModels` string.

## Upstream defect: `connection.rpc.handle()` cannot reach `webServer`

`HostConnectionService.register()` ends with
`owner.effect(() => owner.webServer.register(route))`, where `owner` is the
*service's own* context. The shipped `connection` row injects only
`[webRuntime]`, so cordis raises `cannot get property "webServer" without
inject` — and because `handle()` is called from `apply()`, the whole plugin row
fails to load. Reproduced against the shipped classes:

```js
new HostConnectionService(connectionRowCtx, [], auth)   // row injects []
ctx.connection.rpc.handle('/ch', handler)               // THROWS
```

No shipped package calls `rpc.handle` (API Gateway only uses `rpc.intercept`),
which is why the path is untested upstream. Adding `webServer` to the plugin's
own `inject` does not help — the context that matters belongs to the
`connection` row. A consumer therefore cannot fix this from its own `inject`.

`cordis.patch.yml` in this bundle adds the missing injection. Loader patches
merge field-by-field, so only `inject` is overridden while the row's `name` is
asserted and its `config` (`trustedHosts`) is left untouched:

```yaml
- id: connection
  name: '@deepseek-ai/dsh-client-connection'
  inject: [webRuntime, webServer]
```

## Verification

Plugin smoke test against the real 0.2.0-rc.2 modules: `apply(ctx)` registers
`gateway_configure` (real `defineTool` validates the parameter and
`{ type: 'json' }` output schemas) and the `/gateway-oauth` channel.

A throwaway profile with the same bundles booted under `dsh --profile … --port
3099`:

- clean startup, no warnings, plugin row active;
- `gateway-config/client.js` present in the served boot graph with the adapted
  `inject`;
- the served client bundle carries the `remote.*` services and no
  `response.result` envelopes;
- `POST /gateway-oauth/status` → `200` with a real payload
  (`{"providerId":"openai-codex","supported":true,…}`), `401` without a browser
  session, and an unregistered channel still answers `405` — so the custom RPC
  channel is genuinely registered.
