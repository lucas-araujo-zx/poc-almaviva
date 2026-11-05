const CONVERSATION_ID = /^conv_[a-zA-Z0-9]{8,}$/

export function isConversationId(value) {
  return CONVERSATION_ID.test(String(value ?? '').trim())
}

function asRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value
}

function text(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

function skipVariable(key) {
  const name = key.trim().toLowerCase()
  return !name || name.startsWith('system__')
}

function outcome(value) {
  if (value === true || value === 'success' || value === 'successful') {
    return 'success'
  }
  if (value === false || value === 'failure' || value === 'failed') {
    return 'failure'
  }
  return 'unknown'
}

function criteriaFrom(analysis) {
  const items = []
  const seen = new Set()
  const mapped = asRecord(analysis.evaluation_criteria_results) ?? {}
  const list = Array.isArray(analysis.evaluation_criteria_results_list)
    ? analysis.evaluation_criteria_results_list
    : []

  function add(id, value) {
    const record = asRecord(value)
    const name = text(record?.criteria_id) || text(id)
    if (!name || seen.has(name.toLowerCase())) {
      return
    }
    seen.add(name.toLowerCase())
    items.push({
      id: name,
      result: outcome(record?.result ?? record?.successful ?? value),
      rationale: text(record?.rationale),
    })
  }

  for (const item of list) {
    add('', item)
  }
  for (const [key, value] of Object.entries(mapped)) {
    add(key, value)
  }
  return items
}

function collectionFrom(analysis) {
  const items = []
  const seen = new Set()
  const mapped = asRecord(analysis.data_collection_results) ?? {}
  const list = Array.isArray(analysis.data_collection_results_list)
    ? analysis.data_collection_results_list
    : []

  function add(id, value) {
    const record = asRecord(value)
    if (record?.is_omitted === true) {
      return
    }
    const name = text(record?.data_collection_id) || text(id)
    if (!name || seen.has(name.toLowerCase())) {
      return
    }
    seen.add(name.toLowerCase())
    const extracted = record && 'value' in record ? record.value : value
    items.push({ id: name, value: extracted ?? null })
  }

  for (const item of list) {
    add('', item)
  }
  for (const [key, value] of Object.entries(mapped)) {
    add(key, value)
  }
  return items
}

function variablesFrom(conversation) {
  const sources = [
    asRecord(asRecord(conversation.conversation_initiation_client_data)?.dynamic_variables),
    asRecord(asRecord(conversation.metadata)?.dynamic_variables),
  ]
  const items = []
  const seen = new Set()
  for (const source of sources) {
    if (!source) {
      continue
    }
    for (const [key, value] of Object.entries(source)) {
      if (skipVariable(key) || seen.has(key.toLowerCase())) {
        continue
      }
      seen.add(key.toLowerCase())
      items.push({ id: key, value })
    }
  }
  return items
}

export function presentConversation(conversation, fallbackId = '') {
  const body = asRecord(conversation) ?? {}
  const analysis = asRecord(body.analysis) ?? {}
  const status = text(body.status).toLowerCase()
  const duration = asRecord(body.metadata)?.call_duration_secs
  return {
    conversationId: text(body.conversation_id) || text(fallbackId),
    status,
    ready: status === 'done' || status === 'failed' || status === 'completed',
    summary: text(analysis.transcript_summary),
    callSuccessful: text(analysis.call_successful),
    durationSecs: typeof duration === 'number' && Number.isFinite(duration) ? duration : null,
    criteria: criteriaFrom(analysis),
    dataCollection: collectionFrom(analysis),
    variables: variablesFrom(body),
  }
}
