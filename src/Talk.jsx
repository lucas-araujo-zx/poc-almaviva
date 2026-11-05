import { Conversation } from '@elevenlabs/client'
import { useEffect, useRef, useState } from 'react'
import { conversationResult, signedUrl } from './api.js'
import { Orb } from './Orb.jsx'

const LOGO = 'https://www.almavivaexperience.com.br/dcm_files/2024/07/Almaviva_Experience_500x136_colore.png'
const RESULT_ATTEMPTS = 30
const RESULT_WAIT_MS = 4000

const STATUS_LABEL = {
  initiated: 'Iniciada',
  'in-progress': 'Em andamento',
  processing: 'Processando a análise',
  done: 'Concluída',
  completed: 'Concluída',
  failed: 'Falhou',
}

function roleOf(message) {
  return message?.source === 'user' || message?.role === 'user' ? 'user' : 'agent'
}

function readConversationId(conversation) {
  try {
    const id = conversation?.getId?.()
    return typeof id === 'string' ? id.trim() : ''
  } catch {
    return ''
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

function formatLabel(key) {
  const cleaned = String(key ?? '').replace(/[_-]+/g, ' ').trim()
  if (!cleaned) {
    return String(key ?? '')
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function outcomeLabel(value) {
  if (value === 'success' || value === 'successful' || value === true) {
    return { text: 'Sim', tone: 'success' }
  }
  if (value === 'failure' || value === 'failed' || value === false) {
    return { text: 'Não', tone: 'failure' }
  }
  return { text: '—', tone: 'unknown' }
}

function ResultValue({ children, long = false }) {
  return <dd className={`talk-result-value${long ? ' is-long' : ''}`}>{children}</dd>
}

function ConversationResult({ conversationId, result, error, copied, onCopy }) {
  const criteria = result?.criteria ?? []
  const collected = result?.dataCollection ?? []
  const variables = result?.variables ?? []
  const summary = result?.summary ?? ''
  const status = STATUS_LABEL[result?.status] || result?.status || ''
  const call = outcomeLabel(result?.callSuccessful)

  return (
    <section className="talk-result" aria-live="polite">
      <header className="talk-result-pin">
        <p className="talk-result-kicker">Resultado da conversa</p>
        <div className="talk-result-id">
          <span>ID da conversa</span>
          <code title={conversationId}>{conversationId}</code>
          <button type="button" onClick={onCopy}>
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </header>
      <div className="talk-result-scroll">
        <header className="talk-result-head">
          <h2>Dados para feedback</h2>
          {!result?.ready && !error ? (
            <p>A chamada terminou. Estou buscando a análise.</p>
          ) : null}
        </header>

      <dl className="talk-result-list">
        {status ? (
          <div className="talk-result-row">
            <dt>Status</dt>
            <ResultValue>{status}</ResultValue>
          </div>
        ) : null}
        {typeof result?.durationSecs === 'number' ? (
          <div className="talk-result-row">
            <dt>Duração</dt>
            <ResultValue>{formatDuration(result.durationSecs)}</ResultValue>
          </div>
        ) : null}
        {result?.callSuccessful ? (
          <div className="talk-result-row">
            <dt>Chamada bem-sucedida</dt>
            <ResultValue>{call.text}</ResultValue>
          </div>
        ) : null}
        {summary ? (
          <div className="talk-result-row">
            <dt>Resumo</dt>
            <ResultValue long>{summary}</ResultValue>
          </div>
        ) : null}
      </dl>

      {criteria.length ? (
        <section className="talk-result-group">
          <h3>Critérios de sucesso</h3>
          {criteria.map((item) => {
            const outcome = outcomeLabel(item.result)
            return (
              <article key={item.id} className="criterion">
                <div className="criterion-head">
                  <h4>{formatLabel(item.id)}</h4>
                  <span className={`flag ${outcome.tone}`}>{outcome.text}</span>
                </div>
                {item.rationale ? <p className="talk-result-value is-long">{item.rationale}</p> : null}
              </article>
            )
          })}
        </section>
      ) : null}

      {collected.length ? (
        <section className="talk-result-group">
          <h3>Dados coletados</h3>
          <dl className="talk-result-list">
            {collected.map((item) => {
              const value = formatValue(item.value)
              return (
                <div key={item.id} className="talk-result-row">
                  <dt>{formatLabel(item.id)}</dt>
                  <ResultValue long={value.length > 90}>{value}</ResultValue>
                </div>
              )
            })}
          </dl>
        </section>
      ) : null}

      {variables.length ? (
        <section className="talk-result-group">
          <h3>Variáveis</h3>
          <dl className="talk-result-list">
            {variables.map((item) => {
              const value = formatValue(item.value)
              return (
                <div key={item.id} className="talk-result-row">
                  <dt>{formatLabel(item.id)}</dt>
                  <ResultValue long={value.length > 90}>{value}</ResultValue>
                </div>
              )
            })}
          </dl>
        </section>
      ) : null}

      {error ? <p className="talk-result-note">{error}</p> : null}
      </div>
    </section>
  )
}

function displayName(value) {
  return String(value ?? '')
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s-])(\p{L})/gu, (_, lead, letter) => lead + letter.toLocaleUpperCase('pt-BR'))
}

function sheetValue(value) {
  const text = String(value ?? '').trim()
  return text || '—'
}

function lastThreeDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 3 ? digits.slice(-3) : ''
}

const CLIENT_GROUPS = [
  ['Identificação', [
    ['cpf', 'CPF'],
    ['telefone', 'Telefone'],
    ['tipoDePessoa', 'Tipo'],
    ['contrato', 'Contrato'],
    ['produto', 'Produto'],
    ['id', 'ID'],
  ]],
  ['À vista', [
    ['diasDeAtraso', 'Atraso'],
    ['valorDivida', 'Dívida'],
    ['percentualDesc', 'Desconto'],
    ['valorComDesc', 'Com desconto'],
    ['dataMaxima', 'Data máxima'],
  ]],
  ['Parcelamento', [
    ['valorEntrada', 'Entrada'],
    ['qtdParcelas', 'Parcelas'],
    ['valorParc', 'Valor da parcela'],
    ['valorTotal', 'Total'],
    ['dataVenc', 'Vencimento'],
    ['taxaMensal', 'Taxa mês'],
    ['taxaAnual', 'Taxa ano'],
  ]],
]

function ClientSheet({ client }) {
  const tail = lastThreeDigits(client.cpf)
  return (
    <aside className="client-sheet" aria-label="Dados do cliente">
      <p className="kicker">Cliente na simulação</p>
      <h2>{displayName(client.nome) || 'Sem nome'}</h2>
      <p className="client-tail">
        <span>Últimos 3 do CPF</span>
        <strong>{tail || '—'}</strong>
      </p>
      {CLIENT_GROUPS.map(([title, fields]) => (
        <section className="client-group" key={title}>
          <h3>{title}</h3>
          <dl>
            {fields.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{sheetValue(client[key])}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </aside>
  )
}

export function Talk({ token, agent, client, onBack, onSignOut }) {
  const [mode, setMode] = useState('voice')
  const [status, setStatus] = useState('idle')
  const [agentMode, setAgentMode] = useState('listening')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [conversationId, setConversationId] = useState('')
  const [result, setResult] = useState(null)
  const [resultError, setResultError] = useState('')
  const [copied, setCopied] = useState(false)
  const sessionRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    const list = listRef.current
    if (list) {
      list.scrollTop = list.scrollHeight
    }
  }, [messages, mode, status])

  useEffect(() => () => {
    sessionRef.current?.endSession?.().catch(() => {})
    sessionRef.current = null
  }, [])

  useEffect(() => {
    if (status !== 'ended' || !conversationId) {
      return undefined
    }
    let cancelled = false
    async function load() {
      for (let attempt = 0; attempt < RESULT_ATTEMPTS; attempt += 1) {
        if (attempt > 0) {
          await wait(RESULT_WAIT_MS)
        }
        if (cancelled) {
          return
        }
        try {
          const next = await conversationResult(token, conversationId)
          if (cancelled) {
            return
          }
          setResult(next)
          setResultError('')
          if (next.ready) {
            return
          }
        } catch (reason) {
          if (cancelled) {
            return
          }
          setResultError(reason instanceof Error ? reason.message : 'Não foi possível ler o resultado.')
          return
        }
      }
      if (!cancelled) {
        setResultError('A análise ainda não ficou pronta. O ID da conversa já pode ser usado no feedback.')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [status, conversationId, token])

  function rememberConversation(conversation) {
    const id = readConversationId(conversation)
    if (id) {
      setConversationId(id)
    }
    return id
  }

  function pushMessage(role, text) {
    const next = text?.trim()
    if (!next) {
      return
    }
    setMessages((current) => {
      const last = current[current.length - 1]
      if (last && last.role === role && last.text === next) {
        return current
      }
      return [...current, { id: crypto.randomUUID(), role, text: next }]
    })
  }

  async function stop() {
    const current = sessionRef.current
    rememberConversation(current)
    sessionRef.current = null
    setStatus('ended')
    setAgentMode('listening')
    try {
      await current?.endSession?.()
    } catch {
      // A sessão já pode ter caído.
    }
  }

  function openMic(conversation) {
    try {
      conversation.setMicMuted(false)
    } catch {
      // A sessão de texto não tem microfone.
    }
  }

  async function start(nextMode, opening) {
    setError('')
    setResult(null)
    setResultError('')
    setConversationId('')
    setCopied(false)
    setStatus('connecting')
    setMessages([])
    try {
      if (nextMode !== 'text') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
      }
      const session = await signedUrl(token, client.id)
      const conversation = await Conversation.startSession({
        signedUrl: session.signedUrl,
        dynamicVariables: session.dynamicVariables,
        userId: client.id,
        connectionType: 'websocket',
        textOnly: nextMode === 'text',
        onConnect: () => setStatus('connected'),
        onDisconnect: () => {
          rememberConversation(sessionRef.current)
          sessionRef.current = null
          setAgentMode('listening')
          setStatus((current) => (current === 'connected' || current === 'connecting' ? 'ended' : current))
        },
        onModeChange: ({ mode: next }) => {
          setAgentMode(next === 'speaking' ? 'speaking' : 'listening')
        },
        onMessage: (message) => pushMessage(roleOf(message), message?.message),
        onError: (message) => {
          const text = typeof message === 'string' ? message : 'Não foi possível manter a conversa.'
          setError(text)
        },
      })
      sessionRef.current = conversation
      rememberConversation(conversation)
      setStatus('connected')
      if (nextMode !== 'text') {
        openMic(conversation)
      }
      if (opening) {
        pushMessage('user', opening)
        conversation.sendUserMessage(opening)
      }
    } catch (reason) {
      setStatus('idle')
      const denied = reason instanceof DOMException && reason.name === 'NotAllowedError'
      setError(
        denied
          ? 'Autorize o microfone para iniciar a conversa por voz.'
          : reason instanceof Error
            ? reason.message
            : 'Não foi possível abrir a conversa.',
      )
    }
  }

  async function switchMode() {
    const next = mode === 'voice' ? 'text' : 'voice'
    if (status === 'connected' || status === 'connecting') {
      await stop()
    }
    setMessages([])
    setDraft('')
    setError('')
    setResult(null)
    setResultError('')
    setConversationId('')
    setStatus('idle')
    setMode(next)
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(conversationId)
      setCopied(true)
      return
    } catch {
      // O navegador pode recusar a área de transferência sem foco.
    }
    try {
      const field = document.createElement('textarea')
      field.value = conversationId
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.focus()
      field.select()
      setCopied(document.execCommand('copy'))
      field.remove()
    } catch {
      setCopied(false)
    }
  }

  async function send(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || status === 'connecting') {
      return
    }
    setDraft('')
    if (!sessionRef.current) {
      await start(mode, text)
      return
    }
    pushMessage('user', text)
    sessionRef.current.sendUserMessage(text)
  }

  const live = status === 'connected' || status === 'connecting'
  const ended = status === 'ended'
  const showVoiceChat = mode === 'voice' && (live || (ended && messages.length > 0))

  function transcript(empty) {
    if (messages.length === 0) {
      return (
        <li className="empty">
          <p>{empty}</p>
        </li>
      )
    }
    return messages.map((item) => (
      <li key={item.id} className={`bubble ${item.role}`}>
        <span>{item.role === 'user' ? 'Você' : 'Sandro'}</span>
        <p>{item.text}</p>
      </li>
    ))
  }

  return (
    <div className={`talk ${mode} ${live ? 'is-live' : ''} ${ended ? 'is-ended' : ''}`}>
      <header className="talk-top">
        <div className="talk-brand">
          <img src={LOGO} alt="Almaviva Experience" />
        </div>
        <div className="talk-actions">
          <button type="button" className="quiet" onClick={onBack}>
            Trocar cliente
          </button>
          <button type="button" className="quiet" onClick={onSignOut}>
            Sair
          </button>
          <button type="button" className="mode-switch" onClick={switchMode}>
            {mode === 'voice' ? 'Conversar por texto' : 'Falar por voz'}
          </button>
        </div>
      </header>

      <div className="talk-body">
      <ClientSheet client={client} />
      <div className="talk-main">
      <main className="talk-stage">
        {mode === 'text' && ended ? null : (
          <div className={`orb-slot ${agentMode}`}>
            <Orb speaking={agentMode === 'speaking'} listening={live} />
            {ended && mode === 'voice' ? (
              <button type="button" className="orb-restart" onClick={() => start('voice')}>
                Nova conversa
              </button>
            ) : null}
          </div>
        )}

        {mode === 'voice' && (live || ended) ? (
          <p className="talk-status">
            {live ? (agentMode === 'speaking' ? 'Falando' : 'Ouvindo') : 'Encerrada'}
          </p>
        ) : null}

        {mode === 'voice' && ended && conversationId ? (
          <div className="talk-split">
            <ConversationResult
              conversationId={conversationId}
              result={result}
              error={resultError}
              copied={copied}
              onCopy={copyId}
            />
            <section className="chat" aria-live="polite">
              <ol className="messages" ref={listRef}>
                {transcript('Pode falar. O microfone está ligado.')}
              </ol>
            </section>
          </div>
        ) : null}

        {showVoiceChat && !(ended && conversationId) ? (
          <section className={`chat${live ? ' has-end' : ''}`} aria-live="polite">
            {live ? (
              <button type="button" className="end-call" aria-label="Encerrar" onClick={stop}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
            <ol className="messages" ref={listRef}>
              {transcript(status === 'connecting' ? 'Conectando...' : 'Pode falar. O microfone está ligado.')}
            </ol>
          </section>
        ) : null}

        {mode === 'voice' && !live && !ended ? (
          <button type="button" className="start-call" onClick={() => start('voice')}>
            Iniciar conversa
          </button>
        ) : null}

        {mode === 'text' ? (
          <section className="chat" aria-live="polite">
            <ol className="messages" ref={listRef}>
              {transcript(status === 'connecting' ? 'Conectando...' : 'Escreva para o Sandro.')}
            </ol>
            <form className="composer" onSubmit={send}>
              <input
                value={draft}
                placeholder="Escreva uma mensagem"
                disabled={status === 'connecting'}
                onChange={(event) => setDraft(event.target.value)}
              />
              {live ? (
                <button type="button" className="end-chat" onClick={stop}>
                  Encerrar
                </button>
              ) : null}
              <button type="submit" className="send" aria-label="Enviar" disabled={status === 'connecting' || !draft.trim()}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </section>
        ) : null}

        {error ? (
          <p className="talk-error" role="alert">
            {error}
          </p>
        ) : null}
      </main>

      {ended && mode === 'text' && conversationId ? (
        <section className="talk-after">
          <ConversationResult
            conversationId={conversationId}
            result={result}
            error={resultError}
            copied={copied}
            onCopy={copyId}
          />
        </section>
      ) : null}
      </div>
      </div>
    </div>
  )
}
