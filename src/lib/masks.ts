/**
 * Máscaras de digitação. Qual campo usa qual máscara é decidido pelo tipo
 * cadastrado no modelo (`src/lib/fields.ts`).
 */

export type Mask = {
  format: (value: string) => string
  inputmode: 'numeric' | 'text'
  placeholder: string
  /** Mensagem de erro, ou null se o valor serve. */
  validate: (value: string) => string | null
  /** Moeda cresce da direita para a esquerda: o cursor fica sempre no fim. */
  caretAtEnd?: boolean
}

const digits = (value: string) => value.replace(/\D/g, '')
const alnum = (value: string) => value.toUpperCase().replace(/[^0-9A-Z]/g, '')

/** `0` aceita dígito, `A` aceita letra ou dígito; o resto é literal. */
function pattern(shape: string) {
  const digitsOnly = !shape.includes('A')
  return (value: string) => {
    // Máscara só de dígitos descarta letra logo de cara: no CPF ela nem aparece.
    const chars = digitsOnly ? digits(value) : alnum(value)
    let out = ''
    let i = 0
    for (const slot of shape) {
      if (slot === '0' || slot === 'A') {
        if (slot === '0') while (i < chars.length && !/\d/.test(chars[i])) i++
        if (i >= chars.length) break
        out += chars[i++]
      } else {
        if (i >= chars.length) break
        out += slot
      }
    }
    // Um literal pode sobrar no fim se o que vinha depois foi descartado.
    return out.replace(/[^0-9A-Z]+$/, '')
  }
}

function validCpf(value: string) {
  const d = digits(value)
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const dv = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    return ((sum * 10) % 11) % 10
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

/** Aceita o CNPJ alfanumérico (em vigor desde julho de 2026): letra vale código ASCII − 48. */
function validCnpj(value: string) {
  const c = alnum(value)
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1+$/.test(c)) return false
  const dv = (len: number) => {
    const weights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2].slice(13 - len)
    const sum = weights.reduce((s, w, i) => s + (c.charCodeAt(i) - 48) * w, 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13])
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const MASKS = {
  cpf: {
    format: pattern('000.000.000-00'),
    inputmode: 'numeric',
    placeholder: '000.000.000-00',
    validate: (v) =>
      digits(v).length < 11 ? 'CPF incompleto' : validCpf(v) ? null : 'CPF inválido',
  },
  cnpj: {
    format: pattern('AA.AAA.AAA/AAAA-00'),
    inputmode: 'text',
    placeholder: '00.000.000/0000-00',
    validate: (v) =>
      alnum(v).length < 14 ? 'CNPJ incompleto' : validCnpj(v) ? null : 'CNPJ inválido',
  },
  phone: {
    format: (v) =>
      digits(v).length <= 10 ? pattern('(00) 0000-0000')(v) : pattern('(00) 00000-0000')(v),
    inputmode: 'numeric',
    placeholder: '(00) 00000-0000',
    validate: (v) => (digits(v).length >= 10 ? null : 'Telefone incompleto'),
  },
  cep: {
    format: pattern('00000-000'),
    inputmode: 'numeric',
    placeholder: '00000-000',
    validate: (v) => (digits(v).length === 8 ? null : 'CEP incompleto'),
  },
  time: {
    format: pattern('00:00'),
    inputmode: 'numeric',
    placeholder: 'hh:mm',
    validate: (v) => {
      const m = /^(\d{2}):(\d{2})$/.exec(v)
      if (!m) return 'Horário incompleto'
      return Number(m[1]) < 24 && Number(m[2]) < 60 ? null : 'Horário inválido'
    },
  },
  currency: {
    // Os dígitos são centavos: digitar 1, 5, 0, 0, 0, 0 dá R$ 1.500,00.
    format: (v) => {
      const cents = digits(v).replace(/^0+/, '').slice(0, 13)
      // O Intl separa "R$" do número com espaço não separável. Fica assim de
      // propósito: o PDF não quebra a linha entre "R$" e o valor.
      return cents ? brl.format(Number(cents) / 100) : ''
    },
    inputmode: 'numeric',
    placeholder: 'R$ 0,00',
    validate: () => null,
    caretAtEnd: true,
  },
  number: {
    format: (v) => digits(v).slice(0, 15),
    inputmode: 'numeric',
    placeholder: '',
    validate: () => null,
  },
} satisfies Record<string, Mask>
