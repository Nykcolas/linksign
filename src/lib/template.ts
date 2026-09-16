import { escapeHtml, toHtml } from './richtext'

/**
 * Modelos são HTML com marcadores {{variavel}}. No editor cada marcador é uma
 * etiqueta (`<span data-variable>`), mas o texto dentro dela continua sendo
 * `{{variavel}}` — achar e preencher é só um regex.
 */

const VARIABLE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export function extractVariables(content: string): string[] {
  return [...new Set([...content.matchAll(VARIABLE)].map((m) => m[1]))]
}

/** Devolve HTML. Campo ainda vazio mantém o marcador, para a prévia mostrar o que falta. */
export function fillTemplate(content: string, values: Record<string, string>): string {
  return toHtml(content).replace(VARIABLE, (marker, name) =>
    values[name]?.trim() ? escapeHtml(values[name]) : marker,
  )
}

/** Para abrir no editor: converte modelo antigo e transforma marcador solto em etiqueta. */
export function toEditorHtml(content: string, labels: Record<string, string>): string {
  const html = toHtml(content)
  if (html.includes('data-variable')) return html
  return html.replace(VARIABLE, (_, key) => {
    const label = escapeHtml(labels[key] ?? humanize(key))
    return `<span data-variable="${key}" data-label="${label}">{{${key}}}</span>`
  })
}

/** `valor_total` → `Valor total` */
export function humanize(name: string): string {
  const words = name.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
