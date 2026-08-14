# gateway-config

A [DSH](https://github.com/iceprosurface/dsh) plugin for configuring any
OpenAI-compatible LLM gateway (any endpoint that serves `GET /models`) as a
provider — one provider route per gateway, multiple gateways side by side.

## What it provides

- Host tool: `gateway_configure`
- Web settings panel: **LLM 网关配置**
- Gateway model discovery via `GET /models` with non-chat model filtering
- Per-model reasoning-effort mappings
- Per-model text/image input capability mappings
- One managed credential per route (`<ROUTE>_API_KEY`, e.g. `CINDY_API_KEY`)

Providers are fixed presets; no ad-hoc routes are created. Anything that
speaks the OpenAI `GET /models` shape (the de-facto standard DSH discovery
reads) works:

- `cindy` (Cindy), `sub2api` (Sub2API) — private gateways; addresses never
  live in this repository. The host tool reads them from `CINDY_BASE_URL` /
  `SUB2API_BASE_URL`; the web panel remembers the last address per route.
- `generic` (通用) — any other OpenAI-compatible endpoint; supply its base
  URL (`GATEWAY_BASE_URL` env or the panel's Base URL field).
- Public vendors with OpenAI-compatible APIs carry their documented base
  URLs out of the box: `deepseek`, `moonshot` (Kimi), `zhipu` (GLM), `qwen`,
  `openrouter`, `siliconflow`, `xai` (Grok).

## Install into an existing DSH profile

This repository is a plugin package. It does not replace or contain a
complete DSH home.

```bash
dsh plugin --profile web add https://github.com/iceprosurface/dsh-gateway-config.git
```

If your DSH version expects a Git URL package, use:

```bash
dsh plugin --profile web add git+https://github.com/iceprosurface/dsh-gateway-config.git
```

If the plugin entry is not reconciled automatically, add this to the existing
`$DSH_HOME/profiles/web/cordis.patch.yml` without deleting other entries:

```yaml
- insert:
    - id: gateway-config
      name: gateway-config
```

Then restart the existing DSH web process.

## Configure a gateway

Open **LLM 网关配置**. Pick a gateway from the provider dropdown (Cindy, Sub2API, 通用, or a
public vendor), fill in the Base URL if not pre-filled (the gateway's OpenAI-compatible root, e.g.
ending in `/v1`), then click **拉取模型**: the chat-capable models are
listed with checkboxes; tick the ones to keep and mark one radio button as
the default model, then click **写入配置**. The key is stored in DSH local
managed credentials and never written to this repository. Later, leave the
key blank; the plugin reuses `<ROUTE>_API_KEY`.

The host-side equivalent:

```
gateway_configure(apiKey, baseURL, route, displayName, defaultModel?)
```

## Development

- `lib/index.js`: host-side tool
- `lib/client.js`: web-side settings panel

```bash
node --check lib/index.js
node --check lib/client.js
```

## Security

Never commit API keys, gateway addresses you consider private, credential
files, personal DSH settings, sessions, attachments, generated dependencies,
or runtime databases.

## License

MIT
