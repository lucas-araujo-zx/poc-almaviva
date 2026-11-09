import { useMemo, useState } from 'react'

const LOGO = 'https://www.almavivaexperience.com.br/dcm_files/2024/07/Almaviva_Experience_500x136_colore.png'

function displayName(value) {
  return String(value ?? '')
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s-])(\p{L})/gu, (_, lead, letter) => lead + letter.toLocaleUpperCase('pt-BR'))
}

function byName(left, right) {
  return String(left.nome ?? '').localeCompare(String(right.nome ?? ''), 'pt-BR')
}

const COLUMNS = [
  ['nome', 'Nome'],
  ['contrato', 'Contrato'],
  ['tipoDePessoa', 'Tipo'],
  ['cpf', 'CPF'],
  ['diasDeAtraso', 'Atraso'],
  ['valorDivida', 'Dívida'],
  ['percentualDesc', 'Desconto'],
  ['valorComDesc', 'Com desconto'],
  ['dataMaxima', 'Data máxima'],
  ['valorEntrada', 'Entrada'],
  ['qtdParcelas', 'Parcelas'],
  ['valorParc', 'Valor da parcela'],
  ['valorTotal', 'Total'],
  ['dataVenc', 'Vencimento'],
  ['taxaMensal', 'Taxa mês'],
  ['taxaAnual', 'Taxa ano'],
  ['telefone', 'Telefone'],
]

function cell(value) {
  const text = String(value ?? '').trim()
  return text || '—'
}

function openFromKey(event, client, onOpen) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }
  event.preventDefault()
  onOpen(client)
}

export function Picker({ clients, onOpen, onSignOut }) {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLocaleLowerCase('pt-BR')
  const groups = useMemo(() => {
    const filtered = clients.filter((client) => {
      if (!normalized) {
        return true
      }
      const haystack = `${client.nome} ${client.produto} ${client.contrato}`.toLocaleLowerCase('pt-BR')
      return haystack.includes(normalized)
    })
    const buckets = new Map()
    for (const client of filtered) {
      const product = client.produto?.trim() || 'Sem produto'
      const current = buckets.get(product) ?? []
      current.push(client)
      buckets.set(product, current)
    }
    return [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'pt-BR'))
      .map(([product, people]) => ({ product, people: people.sort(byName) }))
  }, [clients, normalized])

  return (
    <div className="lab-app">
      <header className="lab-header">
        <img src={LOGO} alt="Almaviva Experience" />
        <p>Bancada de cobrança</p>
        <button type="button" className="text-button" onClick={onSignOut}>
          Sair
        </button>
      </header>
      <main className="picker">
        <header className="picker-head">
          <p className="kicker">Almaviva Experience</p>
          <h1>Qual cliente a Alda vai atender?</h1>
          <p>
            Os clientes estão separados por produto, em ordem alfabética. A
            conversa usa os dados da pessoa escolhida.
          </p>
        </header>
        <label className="client-search">
          <span>Buscar</span>
          <input
            value={query}
            placeholder="Nome, produto ou contrato"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {groups.length === 0 ? (
          <p className="picker-empty">Nenhum cliente com esse texto.</p>
        ) : (
          <div className="product-groups">
            {groups.map((group) => (
              <details
                key={normalized ? `${group.product}-busca` : group.product}
                className="product-group"
                open={normalized ? true : undefined}
              >
                <summary>
                  <h2>{group.product}</h2>
                  <span className="product-count">{group.people.length}</span>
                </summary>
                <div className="product-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {COLUMNS.map(([, label]) => (
                          <th key={label} scope="col">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.people.map((client) => (
                        <tr
                          key={client.id}
                          tabIndex={0}
                          onClick={() => onOpen(client)}
                          onKeyDown={(event) => openFromKey(event, client, onOpen)}
                        >
                          {COLUMNS.map(([key, label]) => (
                            <td key={label}>
                              {key === 'nome' ? displayName(client.nome) : cell(client[key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
