/** Browser-facing bridge for pi-ai's native provider OAuth flow. */
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { createModels } from '@earendil-works/pi-ai'
import { builtinProviders } from '@earendil-works/pi-ai/providers/all'

const OWNER = 'llm-pi-ai'

function messageOf(error) {
  return String((error && error.message) || error)
}

function toPiCredential(record) {
  if (record === undefined) return undefined
  if (record.kind === 'grant') return record.payload
  return {
    type: 'api_key',
    ...(record.key === undefined ? {} : { key: record.key }),
    ...(record.env === undefined ? {} : { env: { ...record.env } }),
  }
}

function toRecord(credential) {
  if (credential.type === 'api_key') {
    return {
      kind: 'api-key',
      ...(credential.key === undefined ? {} : { key: credential.key }),
      ...(credential.env === undefined ? {} : { env: { ...credential.env } }),
    }
  }
  return { kind: 'grant', payload: credential }
}

function publicPrompt(prompt, id) {
  return {
    id,
    kind: prompt.kind,
    message: prompt.message,
    ...(prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder }),
    ...(prompt.options === undefined ? {} : { options: prompt.options }),
  }
}

function relay(event, attempt) {
  if (event.type === 'auth_url') {
    attempt.notice = { message: event.instructions || 'Continue signing in in your browser.', url: event.url }
    return
  }
  if (event.type === 'device_code') {
    attempt.notice = {
      message: 'Enter the device code on the verification page.',
      url: event.verificationUri,
      code: event.userCode,
    }
    return
  }
  if (event.type === 'info') {
    const link = event.links?.[0]
    attempt.notice = { message: event.message, ...(link === undefined ? {} : { url: link.url }) }
    return
  }
  attempt.notice = { message: event.message || 'Signing in…' }
}

function restate(prompt) {
  const signal = prompt.signal === undefined ? {} : { signal: prompt.signal }
  if (prompt.type === 'select') {
    return { ...signal, kind: 'select', message: prompt.message, options: prompt.options }
  }
  return {
    ...signal,
    kind: prompt.type === 'secret' ? 'secret' : 'text',
    message: prompt.message,
    ...(prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder }),
  }
}

export class GatewayOAuthRemote {
  constructor(credentials) {
    this.credentials = credentials
    this.attempts = new Map()
    this.nextPromptId = 1
  }

  keyFor(providerId) {
    return credentialKey(OWNER, providerId)
  }

  nativeProvider(providerId) {
    const provider = builtinProviders().find((candidate) => candidate.id === providerId)
    return provider?.auth?.oauth?.login === undefined ? undefined : provider
  }

  credentialStore() {
    return {
      read: async (id) => toPiCredential(await this.credentials.readRecord(this.keyFor(id))),
      list: async () => (await this.credentials.listRecords())
        .filter((entry) => String(entry.key).startsWith(OWNER + '/'))
        .map((entry) => ({
          providerId: String(entry.key).slice(OWNER.length + 1),
          type: entry.kind === 'grant' ? 'oauth' : 'api_key',
        })),
      modify: async (id, mutate) => toPiCredential(await this.credentials.modifyRecord(this.keyFor(id), async (current) => {
        const next = await mutate(toPiCredential(current))
        return next === undefined ? undefined : toRecord(next)
      })),
      delete: async (id) => this.credentials.deleteRecord(this.keyFor(id)),
    }
  }

  promptAttempt(attempt, prompt) {
    return new Promise((resolve, reject) => {
      const id = String(this.nextPromptId++)
      const pending = {
        public: publicPrompt(prompt, id),
        resolve: (value) => {
          if (attempt.prompt !== pending) return
          attempt.prompt = undefined
          resolve(value)
        },
        reject: (error) => {
          if (attempt.prompt !== pending) return
          attempt.prompt = undefined
          reject(error)
        },
      }
      attempt.prompt?.reject(new Error('authorization prompt was replaced'))
      attempt.prompt = pending
      if (prompt.signal !== undefined) {
        if (prompt.signal.aborted) pending.reject(new Error('authorization prompt withdrawn'))
        else prompt.signal.addEventListener('abort', () => pending.reject(new Error('authorization prompt withdrawn')), { once: true })
      }
    })
  }

  async run(providerId, attempt) {
    const provider = this.nativeProvider(providerId)
    if (provider === undefined) throw new Error(`provider "${providerId}" has no native OAuth login`)
    const models = createModels({ credentials: this.credentialStore() })
    models.setProvider(provider)
    await models.login(providerId, 'oauth', {
      signal: attempt.controller.signal,
      notify: (event) => relay(event, attempt),
      prompt: (prompt) => this.promptAttempt(attempt, restate(prompt)),
    })
  }

  async snapshot(providerId) {
    const provider = this.nativeProvider(providerId)
    const credential = await this.credentials.describeRecord(this.keyFor(providerId))
    const attempt = this.attempts.get(providerId)
    return {
      providerId,
      supported: provider !== undefined,
      configured: credential.configured && credential.kind === 'grant',
      writable: credential.writable,
      methods: provider === undefined ? [] : [{
        id: 'oauth',
        label: provider.auth.oauth.loginLabel || provider.auth.oauth.name,
      }],
      attempt: attempt === undefined ? { state: 'idle' } : {
        state: attempt.state,
        ...(attempt.notice === undefined ? {} : { notice: attempt.notice }),
        ...(attempt.prompt === undefined ? {} : { prompt: attempt.prompt.public }),
        ...(attempt.error === undefined ? {} : { error: attempt.error }),
      },
    }
  }

  async handle(endpoint, payload) {
    try {
      const providerId = payload && payload.providerId
      if (typeof providerId !== 'string' || providerId.length === 0) throw new Error('missing string field: providerId')
      if (endpoint === 'status') return { ok: true, value: await this.snapshot(providerId) }
      if (endpoint === 'begin') {
        const method = payload && payload.method
        if (method !== 'oauth' || this.nativeProvider(providerId) === undefined) {
          throw new Error(`provider "${providerId}" does not offer OAuth login`)
        }
        const current = this.attempts.get(providerId)
        if (current?.state !== 'running') {
          const attempt = { state: 'running', controller: new AbortController() }
          this.attempts.set(providerId, attempt)
          void this.run(providerId, attempt).then(() => {
            attempt.prompt?.reject(new Error('authorization attempt settled'))
            attempt.state = attempt.controller.signal.aborted ? 'cancelled' : 'authorized'
          }, (error) => {
            attempt.prompt?.reject(error)
            attempt.state = attempt.controller.signal.aborted ? 'cancelled' : 'failed'
            if (attempt.state === 'failed') attempt.error = messageOf(error)
          })
        }
        return { ok: true, value: await this.snapshot(providerId) }
      }
      if (endpoint === 'answer') {
        const attempt = this.attempts.get(providerId)
        if (attempt?.state !== 'running' || attempt.prompt?.public.id !== payload.promptId) {
          throw new Error('authorization prompt is no longer pending')
        }
        attempt.prompt.resolve(String(payload.value || ''))
        return { ok: true, value: await this.snapshot(providerId) }
      }
      if (endpoint === 'cancel') {
        const attempt = this.attempts.get(providerId)
        attempt?.controller.abort()
        attempt?.prompt?.reject(new Error('authorization cancelled'))
        return { ok: true, value: await this.snapshot(providerId) }
      }
      throw new Error(`unknown gateway OAuth endpoint: ${endpoint}`)
    } catch (error) {
      return { ok: false, error: { code: 'bad-request', message: messageOf(error), details: {} } }
    }
  }
}
