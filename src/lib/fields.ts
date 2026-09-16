import { MASKS, type Mask } from './masks'
import { extractVariables, humanize } from './template'

/**
 * Campos do formulário, cadastrados no modelo. Quem cadastra escolhe o nome
 * (label) e o tipo; a variável usada no texto sai do nome.
 */

export type FieldType =
  | 'texto'
  | 'nome'
  | 'cpf'
  | 'cnpj'
  | 'telefone'
  | 'cep'
  | 'email'
  | 'data'
  | 'hora'
  | 'moeda'
  | 'numero'

export type TemplateField = { key: string; label: string; type: FieldType }

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'texto', label: 'Texto livre' },
  { value: 'nome', label: 'Nome (maiúsculas)' },
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'cep', label: 'CEP' },
  { value: 'email', label: 'E-mail' },
  { value: 'data', label: 'Data' },
  { value: 'hora', label: 'Hora' },
  { value: 'moeda', label: 'Valor em R$' },
  { value: 'numero', label: 'Número' },
]

/** Tipos digitados com máscara. Data usa o seletor nativo; nome, texto e e-mail não têm máscara. */
export const FIELD_MASKS: Partial<Record<FieldType, Mask>> = {
  cpf: MASKS.cpf,
  cnpj: MASKS.cnpj,
  telefone: MASKS.phone,
  cep: MASKS.cep,
  hora: MASKS.time,
  moeda: MASKS.currency,
  numero: MASKS.number,
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Mensagem de erro, ou null. Vazio não é erro aqui: obrigatoriedade é `isFilled`. */
export function validateField(type: FieldType, value: string): string | null {
  if (!value) return null
  const mask = FIELD_MASKS[type]
  if (mask) return mask.validate(value)
  if (type === 'email') return EMAIL.test(value.trim()) ? null : 'E-mail inválido'
  if (type === 'data') return isoFromBr(value) ? null : 'Data inválida'
  return null
}

export function isFilled(type: FieldType, value: string | undefined): boolean {
  return !!value?.trim() && !validateField(type, value)
}

/** "Data de início" → "data_de_inicio". Nunca repete uma variável de `taken`. */
export function variableKey(label: string, taken: string[]): string {
  let base = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!base) return ''
  if (/^\d/.test(base)) base = `campo_${base}`

  let key = base
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`
  return key
}

/** O seletor de data trabalha com aaaa-mm-dd; o contrato mostra dd/mm/aaaa. */
export function brFromIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

export function isoFromBr(br: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br)
  if (!m) return ''
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(year, month - 1, day)
  const real =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  return real ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/**
 * Modelos criados antes do cadastro de campos não têm `fields`: os campos são
 * deduzidos das variáveis do texto, com o tipo adivinhado pelo nome.
 */
export function guessFields(content: string): TemplateField[] {
  return extractVariables(content).map((key) => ({
    key,
    label: humanize(key),
    type: guessType(key),
  }))
}

function guessType(name: string): FieldType {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/_+/)
  const has = (...options: string[]) => options.some((o) => words.includes(o))

  if (has('cpf') && has('cnpj')) return 'texto'
  if (has('cpf')) return 'cpf'
  if (has('cnpj')) return 'cnpj'
  if (has('telefone', 'celular', 'fone', 'tel', 'whatsapp')) return 'telefone'
  if (has('cep')) return 'cep'
  if (has('email')) return 'email'
  if (has('data', 'nascimento')) return 'data'
  if (has('hora', 'horario')) return 'hora'
  if (has('valor', 'preco', 'salario', 'honorarios', 'mensalidade', 'aluguel')) return 'moeda'
  if (has('nome')) return 'nome'
  return 'texto'
}
