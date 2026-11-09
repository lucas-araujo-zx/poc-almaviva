import assert from 'node:assert/strict'
import test from 'node:test'
import { tokensMatch } from './agents.js'
import { dispatchApi } from './plugin.js'

const env = {
  loginToken: 'token-da-bancada',
  apiKey: 'chave',
  voiceAgentId: '',
}

function call(method, pathname, token, search = '', body) {
  return dispatchApi(
    {
      method,
      pathname,
      searchParams: new URLSearchParams(search),
      token,
      body,
    },
    env,
  )
}

test('tokensMatch aceita o mesmo segredo e rejeita outro', () => {
  assert.equal(tokensMatch('token-da-bancada', 'token-da-bancada'), true)
  assert.equal(tokensMatch('outro', 'token-da-bancada'), false)
  assert.equal(tokensMatch('token-da-bancada', ''), false)
})

test('login recusa token errado e aceita o configurado', async () => {
  const denied = await call('POST', '/api/login', '', '', { token: 'errado' })
  assert.equal(denied.status, 401)

  const ok = await call('POST', '/api/login', '', '', { token: env.loginToken })
  assert.equal(ok.status, 200)
  assert.equal(ok.payload.ok, true)
})

test('catalog lista os dados da base e a sessão só abre para um id dela', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes('/agents/')) {
      return new Response(JSON.stringify({ name: 'Alda' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (href.includes('get-signed-url')) {
      return new Response(JSON.stringify({ signed_url: 'wss://exemplo' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (href.includes('/conversations/conv_4801m64ptqcke33aq74hz968qm1m')) {
      return new Response(
        JSON.stringify({
          conversation_id: 'conv_4801m64ptqcke33aq74hz968qm1m',
          agent_id: 'agent_6701m6kz3bj9enq98608t18jbpf0',
          status: 'done',
          analysis: { transcript_summary: 'Acordo apresentado.' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (href.includes('/conversations/')) {
      return new Response(
        JSON.stringify({
          conversation_id: 'conv_9991m64ptqcke33aq74hz968qm1m',
          agent_id: 'agent_de_outro_lugar_xxxx',
          status: 'done',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response('{}', { status: 404 })
  }

  try {
    const catalog = await call('GET', '/api/catalog', env.loginToken)
    assert.equal(catalog.status, 200)
    assert.equal(catalog.payload.voice.name, 'Alda')
    assert.ok(catalog.payload.clients.length >= 40)
    const joaquim = catalog.payload.clients.find((item) => item.id === '3282041ID')
    assert.equal(joaquim.nome, 'JOAQUIM SILVA')
    assert.equal(typeof joaquim.cpf, 'string')
    assert.ok(joaquim.cpf.length > 0)
    assert.equal(typeof joaquim.valorDivida, 'string')

    const missing = await call('GET', '/api/signed-url', env.loginToken)
    assert.equal(missing.status, 400)

    const unknown = await call('GET', '/api/signed-url', env.loginToken, 'client_id=nao-existe')
    assert.equal(unknown.status, 404)

    const signed = await call('GET', '/api/signed-url', env.loginToken, 'client_id=3282041ID')
    assert.equal(signed.status, 200)
    assert.equal(signed.payload.signedUrl, 'wss://exemplo')
    assert.equal(signed.payload.dynamicVariables.nome, 'JOAQUIM SILVA')
    assert.equal(signed.payload.dynamicVariables.produto, 'CARTAO MASTERCARD GOLD; CHEQUE ESPECIAL')
    assert.equal(typeof signed.payload.dynamicVariables.cpf, 'string')
    assert.ok(signed.payload.dynamicVariables.cpf.length > 0)

    const badId = await call('GET', '/api/conversation', env.loginToken, 'conversation_id=nao-e-id')
    assert.equal(badId.status, 400)

    const result = await call(
      'GET',
      '/api/conversation',
      env.loginToken,
      'conversation_id=conv_4801m64ptqcke33aq74hz968qm1m',
    )
    assert.equal(result.status, 200)
    assert.equal(result.payload.summary, 'Acordo apresentado.')

    const foreign = await call(
      'GET',
      '/api/conversation',
      env.loginToken,
      'conversation_id=conv_9991m64ptqcke33aq74hz968qm1m',
    )
    assert.equal(foreign.status, 404)
  } finally {
    globalThis.fetch = original
  }
})
