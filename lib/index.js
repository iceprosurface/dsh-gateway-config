/**
 * gateway-config — persistent Host plugin.
 *
 * Registers one model Tool `gateway_configure` that configures the supported
 * OpenAI-compatible LLM gateways (any endpoint exposing GET /models) as
 * pi-ai providers in DSH:
 *   1. discovers the model list from the gateway endpoint, keeping only
 *      chat-capable models (image/video/embedding/audio models are filtered),
 *   2. stores the API key as a managed credential,
 *   3. writes the provider profile into the `llm-pi-ai` settings section
 *      (the pi-ai adapter hot-reloads routes from settings — no restart),
 *      declaring per-model reasoning efforts so the composer picker offers
 *      a reasoning-intensity selector,
 *   4. optionally sets the default model selection.
 *
 * Providers are fixed presets (one route per gateway); no ad-hoc routes are
 * created. Gateway addresses are never hardcoded: each preset reads its
 * default base URL from its own environment variable (CINDY_BASE_URL,
 * SUB2API_BASE_URL), overridable via the baseURL parameter.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { GatewayOAuthRemote } from './oauth-remote.js'

export const name = 'gateway-config'
export const inject = ['tools', 'connection', 'credentials']

const SETTINGS_NS = 'llm-pi-ai'

/**
 * Fixed provider presets — one route per supported gateway. Anything that
 * speaks the OpenAI `GET /models` shape works: private gateways keep their
 * address in a per-route environment variable, the generic preset takes any
 * OpenAI-compatible endpoint, and public vendors carry their documented
 * base URLs outright.
 */
const PRESETS = [
  // Private gateways — addresses never live in this repository.
  { route: 'cindy', displayName: 'Cindy', env: 'CINDY_BASE_URL' },
  { route: 'sub2api', displayName: 'Sub2API', env: 'SUB2API_BASE_URL' },
  // Generic catch-all for any OpenAI-compatible endpoint (GET /models).
  { route: 'generic', displayName: 'Generic', env: 'GATEWAY_BASE_URL' },
  // Public vendors with OpenAI-compatible APIs (documented base URLs).
  { route: 'deepseek', displayName: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1' },
  { route: 'moonshot', displayName: 'Kimi', baseURL: 'https://api.moonshot.cn/v1' },
  { route: 'zhipu', displayName: 'Zhipu GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4' },
  { route: 'qwen', displayName: 'Qwen', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { route: 'openrouter', displayName: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1' },
  { route: 'siliconflow', displayName: 'SiliconFlow', baseURL: 'https://api.siliconflow.cn/v1' },
  { route: 'xai', displayName: 'xAI Grok', baseURL: 'https://api.x.ai/v1' },
  { route: 'openai-codex', displayName: 'OpenAI Codex (ChatGPT)', oauth: true },
]

function presetFor(route) {
  return PRESETS.find((p) => p.route === route)
}

function deriveKeyRef(route) {
  return `${route.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/**
 * Non-chat model markers. Gateways advertise every model they proxy
 * (chat, image generation, video generation, embeddings, speech/ASR, …);
 * only chat-capable models belong in the composer picker.
 */
const NON_CHAT_PATTERN = /(^|[/_.-])(image|img|embedding|embed|voyage|seedream|seedance|happyhorse|t2v|i2v|r2v|video|realtime|asr|whisper|tts|speech|audio|doc)([/_.-]|$)/i

function isChatModel(modelId) {
  return !NON_CHAT_PATTERN.test(modelId)
}

/** DeepSeek-family models use DeepSeek's reasoning wire dialect. */
const DEEPSEEK_PATTERN = /(^|[/_.-])deepseek([/_.-]|$)/i

/** OpenAI GPT-5.6 family (luna / sol / terra) expose xhigh + max. */
const GPT56_PATTERN = /(^|[/_.-])gpt-5\.6([/_.:-]|$)/i

/** OpenAI GPT-5.4 / 5.5 family expose xhigh, but not max. */
const GPT54_55_PATTERN = /(^|[/_.-])gpt-5\.(4|5)([/_.:-]|$)/i

/** Gemini flash / omni-flash thinking is on/off only. */
const GEMINI_FLASH_PATTERN = /(^|[/_.-])(gemini-.*flash|omni-flash)([/_.-]|$)/i

/** Gemini pro thinking is low/high only (no medium / off). */
const GEMINI_PRO_PATTERN = /(^|[/_.-])gemini-.*pro([/_.-]|$)/i

/** Models known to accept image input through OpenAI-compatible gateways. */
const IMAGE_INPUT_PATTERN = /(^|[/_.-])(gpt-5\.(4|5|6)|grok-4\.[5-9]|gemini-(?!.*image)|omni-flash)([/_.:-]|$)/i

function inputFor(model) {
  const declared = model && (model.input || model.inputModalities || model.modalities)
  if (Array.isArray(declared) && declared.length > 0) return declared.includes('image') ? ['text', 'image'] : ['text']
  if (model && (model.supportsImages === true || model.imageInput === true)) return ['text', 'image']
  return IMAGE_INPUT_PATTERN.test(String((model && model.id) || '')) ? ['text', 'image'] : ['text']
}

/**
 * Declared reasoning efforts per family. Keys are the selectable levels,
 * values the wire spelling sent to the gateway; a null value means the level
 * is supported by omitting the parameter. Families differ — do not collapse
 * every chat model onto one off/low/medium/high map.
 */
function reasoningFor(modelId) {
  if (DEEPSEEK_PATTERN.test(modelId)) {
    return { off: null, high: 'high', max: 'max' }
  }
  if (GPT56_PATTERN.test(modelId)) {
    return { off: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }
  }
  if (GPT54_55_PATTERN.test(modelId)) {
    return { off: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' }
  }
  if (GEMINI_FLASH_PATTERN.test(modelId)) {
    return { off: null, high: 'high' }
  }
  if (GEMINI_PRO_PATTERN.test(modelId)) {
    return { low: 'low', high: 'high' }
  }
  // Grok 4.5+, MiniMax, and other OpenAI-dialect chat models.
  return { off: null, low: 'low', medium: 'medium', high: 'high' }
}

function compatFor(modelId) {
  return DEEPSEEK_PATTERN.test(modelId) ? { thinkingFormat: 'deepseek' } : { thinkingFormat: 'openai' }
}

export function apply(ctx) {
  const oauth = new GatewayOAuthRemote(ctx.credentials)
  // 0.2.0 dropped the per-channel `authority: 'loopback'` option: admission is
  // now the Host/Origin fence plus the browser session, applied by
  // `HostConnectionService.admit` before the handler runs.
  //
  // Opening the channel is best-effort. `rpc.handle()` registers its prefix
  // route through the Connection service's own context, so it only works when
  // that row can reach `webServer`; this bundle's cordis.patch.yml adds that
  // injection. If the channel still cannot be opened, the gateway tool must
  // survive — losing the whole plugin over an optional OAuth transport is a
  // far worse outcome than losing ChatGPT sign-in.
  try {
    ctx.effect(() => ctx.connection.rpc.handle(
      '/gateway-oauth',
      (endpoint, payload) => oauth.handle(endpoint, payload),
    ), 'gateway-config: OAuth RPC')
  } catch (error) {
    const message = String((error && error.message) || error)
    if (typeof ctx.logger?.warn === 'function') ctx.logger.warn(`gateway-config: ChatGPT OAuth channel unavailable: ${message}`)
    else console.warn(`gateway-config: ChatGPT OAuth channel unavailable: ${message}`)
  }

  ctx.tools.register(defineTool({
    name: 'gateway_configure',
    description: [
      'Configure a supported OpenAI-compatible LLM gateway (GET /models) as a provider in DSH, given its API key.',
      'Discovers the gateway model list, filters to chat-capable models only, stores the key as a managed credential,',
      'writes the provider profile into the llm-pi-ai settings section with per-model reasoning efforts',
      '(pi-ai adapter hot-reloads — no restart), and optionally sets the default model.',
      `Supported routes: ${PRESETS.map((p) => p.route).join(', ')}.`,
    ].join(' '),
    parameters: {
      apiKey: {
        type: 'string',
        description: 'Gateway API key. Omit for an OAuth preset after signing in through the settings page.',
      },
      baseURL: {
        type: 'string',
        description: 'Gateway base URL (must serve GET /models); defaults to the route\'s environment variable.',
      },
      route: {
        type: 'string',
        description: `Provider route — one of the fixed presets: ${PRESETS.map((p) => `${p.route} (env ${p.env})`).join(', ')}; default ${PRESETS[0].route}.`,
      },
      displayName: {
        type: 'string',
        description: 'Human-readable provider name shown in selectors; defaults to the preset display name.',
      },
      defaultModel: {
        type: 'string',
        description: 'Model id to set as the default model selection; omit to leave the current default unchanged.',
      },
      alsoDeepseek: {
        type: 'boolean',
        description: 'Also store the key as DEEPSEEK_API_KEY so the deepseek-official route works; default true for cindy, false otherwise.',
      },
      cleanup: {
        type: 'boolean',
        description: 'Remove the existing malformed "openai" provider from llm-pi-ai settings (its model ids contain spaces); default true.',
      },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const apiKey = String((args && args.apiKey) || '').trim()
      const route = String((args && args.route) || PRESETS[0].route).trim()
      const preset = presetFor(route)
      const oauth = preset?.oauth === true
      const defaultModel = (args && args.defaultModel) || undefined
      const alsoDeepseek = args && args.alsoDeepseek !== undefined ? args.alsoDeepseek : route === 'cindy'
      const cleanup = (args && args.cleanup) !== false

      if (!preset) {
        throw new Error(`route "${route}" is not a supported preset: use ${PRESETS.map((p) => p.route).join(' or ')}`)
      }
      if (!oauth && !apiKey) throw new Error('missing required parameter: apiKey')
      const baseURL = String((args && args.baseURL) || preset.baseURL || (preset.env && process.env[preset.env]) || '').trim()
      if (!oauth && !baseURL) {
        throw new Error(`missing gateway base URL: set the ${preset.env} environment variable or pass baseURL`)
      }
      const displayName = String((args && args.displayName) || preset.displayName).trim()

      const llm = ctx.get('llm')
      const settings = ctx.get('settings')
      const credentials = ctx.get('credentials')
      if (llm === undefined) throw new Error('llm service unavailable')
      if (settings === undefined) throw new Error('settings service unavailable')
      if (credentials === undefined) throw new Error('credentials service unavailable')

      // 1. Discover the model list, keeping only chat-capable models.
      if (oauth) {
        const grant = await credentials.describeRecord(credentialKey(SETTINGS_NS, route))
        if (!grant.configured || grant.kind !== 'grant') {
          throw new Error(`provider "${route}" is not signed in; complete OAuth in the LLM gateway settings first`)
        }
      }
      // `discoverModels(settingsNs, request, signal)` takes cancellation as a
      // separate argument: a `signal` inside `request` is not part of the
      // request schema, so it is dropped and discovery becomes uncancellable.
      const discovered = await llm.discoverModels(SETTINGS_NS, oauth ? {
        provider: route,
      } : {
        provider: route,
        baseURL,
        api: 'openai-completions',
        apiKey,
      }, exec.signal)
      if (!Array.isArray(discovered) || discovered.length === 0) {
        throw new Error('the gateway advertised no models; check the baseURL and key')
      }
      const chatModels = discovered.filter((m) => isChatModel(m.id))
      if (chatModels.length === 0) {
        throw new Error('no chat-capable models found after filtering; check the gateway model list')
      }

      // 2. Store the key as a managed credential.
      const ref = oauth ? undefined : deriveKeyRef(route)
      if (!oauth) await credentials.set(ref, apiKey)

      // 3. Write the provider profile; the pi-ai adapter hot-reloads routes.
      const ops = []
      if (cleanup && !oauth) ops.push({ op: 'unset', path: ['providers', 'openai'] })
      ops.push({
        op: 'set',
        path: ['providers', route],
        value: {
          displayName,
          ...(oauth ? {} : { apiKeyEnv: ref, api: 'openai-completions', baseURL }),
          // Native OAuth routes inherit their installed pi-ai catalog entry.
          // Only the selected ids belong in settings; OpenAI-compatible
          // capability overrides can be invalid for Codex Responses.
          models: chatModels.map((m) => oauth ? { id: m.id } : {
            id: m.id,
            ...(m.name ? { name: m.name } : {}),
            ...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
            ...(m.maxTokens ? { maxTokens: m.maxTokens } : {}),
            input: inputFor(m),
            reasoningEfforts: reasoningFor(m.id),
            compat: compatFor(m.id),
          }),
        },
      })
      await settings.mutate(SETTINGS_NS, ops)

      // 4. Optional: set the default model selection.
      let defaultSaved = false
      if (defaultModel) {
        const adm = ctx.get('agentDefaultModel')
        if (adm !== undefined) {
          await adm.saveSelection({ provider: route, model: defaultModel })
          defaultSaved = true
        }
      }

      // 5. Optional: sync DEEPSEEK_API_KEY for the deepseek-official route.
      let deepseekStored = false
      if (alsoDeepseek && !oauth) {
        await credentials.set('DEEPSEEK_API_KEY', apiKey)
        deepseekStored = true
      }

      return {
        ok: true,
        count: chatModels.length,
        filtered: discovered.length - chatModels.length,
        route,
        ref,
        defaultSaved,
        deepseekStored,
        models: chatModels.map((m) => m.id),
      }
    },
  }))
}
