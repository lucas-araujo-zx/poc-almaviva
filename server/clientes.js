import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const VARIABLE_FIELDS = [
  'id_cliente',
  'nome',
  'contrato',
  'tipo_de_pessoa',
  'cpf',
  'produto',
  'dias_de_atraso',
  'valor_divida',
  'percentual_desc',
  'valor_com_desc',
  'data_maxima',
  'valor_entrada',
  'qtd_parcelas',
  'valor_parc',
  'valor_total',
  'data_venc',
  'taxa_mensal',
  'taxa_anual',
  'telefone',
]

export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const source = String(text ?? '').replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ';') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((item) => item.some((value) => value.trim()))
}

export function clientsFromCsv(text) {
  const rows = parseCsv(text)
  if (!rows.length) {
    return []
  }
  const header = rows[0].map((name) => name.trim().toLowerCase())
  return rows.slice(1).map((columns) => {
    const record = {}
    header.forEach((name, index) => {
      if (name) {
        record[name] = (columns[index] ?? '').trim()
      }
    })
    return record
  }).filter((record) => record.id_cliente)
}

export function presentClient(record) {
  return {
    id: record.id_cliente,
    nome: record.nome ?? '',
    produto: record.produto ?? '',
    contrato: record.contrato ?? '',
    tipoDePessoa: record.tipo_de_pessoa ?? '',
    cpf: record.cpf ?? '',
    diasDeAtraso: record.dias_de_atraso ?? '',
    valorDivida: record.valor_divida ?? '',
    percentualDesc: record.percentual_desc ?? '',
    valorComDesc: record.valor_com_desc ?? '',
    dataMaxima: record.data_maxima ?? '',
    valorEntrada: record.valor_entrada ?? '',
    qtdParcelas: record.qtd_parcelas ?? '',
    valorParc: record.valor_parc ?? '',
    valorTotal: record.valor_total ?? '',
    dataVenc: record.data_venc ?? '',
    taxaMensal: record.taxa_mensal ?? '',
    taxaAnual: record.taxa_anual ?? '',
    telefone: record.telefone ?? '',
  }
}

export function dynamicVariables(record) {
  const variables = {}
  for (const field of VARIABLE_FIELDS) {
    variables[field] = record[field] ?? ''
  }
  return variables
}

function csvPath() {
  const deployed = join(here, 'clientes.csv')
  const source = join(here, '../../DADOS_MOCK_PREENCHIDO.csv')
  return { deployed, source }
}

export function readClientRows() {
  const paths = csvPath()
  let text = ''
  try {
    text = readFileSync(paths.deployed, 'utf8')
  } catch {
    text = readFileSync(paths.source, 'utf8')
  }
  return clientsFromCsv(text)
}

let cache = null

export function listClients() {
  if (!cache) {
    cache = readClientRows()
  }
  return cache
}

export function findClient(id) {
  const key = String(id ?? '').trim()
  if (!key) {
    return null
  }
  return listClients().find((record) => record.id_cliente === key) ?? null
}
