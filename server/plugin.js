import { agentDisplayName, resolveAgent, tokensMatch } from './agents.js'
import { dynamicVariables, findClient, listClients, presentClient } from './clientes.js'
import { isConversationId, presentConversation } from './conversation.js'

function requestUrl(req) {
  return new URL(req.url ?? '/', 'http://localhost')
}

function headerValue(req, name) {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()]
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 4096) {
        reject(new Error('payload'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('json'))
      }
    })
    req.on('error', reject)
  })
}

function authError(token, env) {
  if (!env.loginToken) {
    return {
      status: 503,
      error: 'O acesso desta bancada ainda não foi configurado.',
    }
  }
  if (!tokensMatch(token, env.loginToken)) {
    return { status: 401, error: 'Token inválido.' }
  }
  return null
}

async function elevenFetch(env, path, init) {
  if (!env.apiKey) {
    return { ok: false, status: 503, error: 'A ElevenLabs ainda não foi configurada.' }
  }
  let response
  try {
    response = await fetch(`https://api.elevenlabs.io${path}`, {
      ...init,
      headers: {
        'xi-api-key': env.apiKey,
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    return { ok: false, status: 502, error: 'Não foi possível falar com a ElevenLabs.' }
  }
  const text = await response.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }
  if (response.ok) {
    return { ok: true, status: response.status, body }
  }
  if (response.status === 401) {
    return { ok: false, status: 401, error: 'A chave da ElevenLabs foi recusada.' }
  }
  if (response.status === 404) {
    return {
      ok: false,
      status: 404,
      error: 'Não encontrei esse agente na conta da ElevenLabs configurada.',
    }
  }
  return { ok: false, status: 502, error: 'Não foi possível falar com a ElevenLabs.' }
}

async function withLiveName(env, agent) {
  const remote = await elevenFetch(env, `/v1/convai/agents/${agent.id}`)
  if (!remote.ok) {
    return { ...agent, error: remote.error }
  }
  return {
    ...agent,
    name: agentDisplayName(remote.body) || agent.name,
    error: '',
  }
}

export async function dispatchApi({ method, pathname, searchParams, token, body }, env) {
  const path = pathname.replace(/\/+$/, '') || '/'
  const voice = resolveAgent(env)

  if (path === '/api/login' && method === 'POST') {
    const error = authError(String(body?.token ?? '').trim(), env)
    if (error) {
      return { status: error.status, payload: { error: error.error } }
    }
    return { status: 200, payload: { ok: true } }
  }

  if (!path.startsWith('/api/')) {
    return null
  }

  if (method !== 'GET') {
    return { status: 405, payload: { error: 'Método não permitido.' } }
  }

  const denied = authError(token, env)
  if (denied) {
    return { status: denied.status, payload: { error: denied.error } }
  }

  if (path === '/api/catalog') {
    let clients = []
    try {
      clients = listClients().map(presentClient)
    } catch {
      return { status: 503, payload: { error: 'A base de clientes não está disponível.' } }
    }
    const voiceAgent = await withLiveName(env, voice)
    return { status: 200, payload: { voice: voiceAgent, clients } }
  }

  if (path === '/api/signed-url') {
    const clientId = searchParams.get('client_id') ?? ''
    if (!clientId) {
      return { status: 400, payload: { error: 'Escolha um cliente.' } }
    }
    const client = findClient(clientId)
    if (!client) {
      return { status: 404, payload: { error: 'Cliente não encontrado.' } }
    }
    const remote = await elevenFetch(
      env,
      `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(voice.id)}`,
    )
    if (!remote.ok) {
      return { status: remote.status, payload: { error: remote.error } }
    }
    if (typeof remote.body?.signed_url !== 'string' || !remote.body.signed_url) {
      return { status: 502, payload: { error: 'A ElevenLabs não devolveu a sessão.' } }
    }
    return {
      status: 200,
      payload: {
        signedUrl: remote.body.signed_url,
        dynamicVariables: dynamicVariables(client),
      },
    }
  }

  if (path === '/api/conversation') {
    const conversationId = searchParams.get('conversation_id') ?? ''
    if (!isConversationId(conversationId)) {
      return { status: 400, payload: { error: 'Informe o ID da conversa.' } }
    }
    const remote = await elevenFetch(
      env,
      `/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
    )
    if (!remote.ok) {
      return { status: remote.status, payload: { error: remote.error } }
    }
    const owner = typeof remote.body?.agent_id === 'string' ? remote.body.agent_id : ''
    if (owner && owner !== voice.id) {
      return { status: 404, payload: { error: 'Conversa não encontrada.' } }
    }
    return { status: 200, payload: presentConversation(remote.body, conversationId) }
  }

  return { status: 404, payload: { error: 'Não encontrado.' } }
}

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function labApiPlugin(env) {
  const safe = {
    loginToken: env.loginToken?.trim() ?? '',
    apiKey: env.apiKey?.trim() ?? '',
    voiceAgentId: env.voiceAgentId?.trim() ?? '',
  }

  const attach = (middlewares) => {
    middlewares.use((req, res, next) => {
      const url = requestUrl(req)
      if (!url.pathname.startsWith('/api/')) {
        next()
        return
      }
      void (async () => {
        const payload = req.method === 'POST' ? await readBody(req) : undefined
        return dispatchApi(
          {
            method: req.method ?? 'GET',
            pathname: url.pathname,
            searchParams: url.searchParams,
            token: headerValue(req, 'x-almaviva-token'),
            body: payload,
          },
          safe,
        )
      })()
        .then((result) => {
          if (!result) {
            next()
            return
          }
          json(res, result.status, result.payload)
        })
        .catch((error) => {
          if (!res.headersSent) {
            const invalid = error instanceof Error && (error.message === 'json' || error.message === 'payload')
            json(res, invalid ? 400 : 500, {
              error: invalid ? 'Não consegui ler o pedido.' : 'Falha interna.',
            })
          }
        })
    })
  }

  return {
    name: 'almaviva-lab-api',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}
