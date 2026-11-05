import assert from 'node:assert/strict'
import test from 'node:test'
import { clientsFromCsv, dynamicVariables, presentClient, readClientRows } from './clientes.js'

const SAMPLE = [
  'ID_CLIENTE;NOME;CONTRATO;TIPO_DE_PESSOA;CPF;PRODUTO;DIAS_DE_ATRASO;VALOR_DIVIDA;PERCENTUAL_DESC;VALOR_COM_DESC;DATA_MAXIMA;VALOR_ENTRADA;QTD_PARCELAS;VALOR_PARC;VALOR_TOTAL;DATA_VENC;TAXA_MENSAL;TAXA_ANUAL;TELEFONE',
  '10ID;ANA;10ID;PF;123;"CARTAO; CHEQUE";9;1,5;2;3;01/01/2026;0;1;0;3;01/01/2026;0;0;',
].join('\n')

test('o csv com aspas preserva produto composto e telefone vazio', () => {
  const [client] = clientsFromCsv(SAMPLE)
  assert.equal(client.produto, 'CARTAO; CHEQUE')
  assert.equal(client.telefone, '')
  assert.equal(presentClient(client).id, '10ID')
  assert.equal(presentClient(client).cpf, '123')
  assert.equal(presentClient(client).valorDivida, '1,5')
  assert.equal(dynamicVariables(client).cpf, '123')
  assert.equal(dynamicVariables(client).produto, 'CARTAO; CHEQUE')
})

test('a planilha mock entra inteira, com o caso de produto composto', () => {
  const rows = readClientRows()
  assert.ok(rows.length >= 40)
  const joaquim = rows.find((row) => row.id_cliente === '3282041ID')
  assert.equal(joaquim.produto, 'CARTAO MASTERCARD GOLD; CHEQUE ESPECIAL')
  assert.equal(joaquim.nome, 'JOAQUIM SILVA')
})
