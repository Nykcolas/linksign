/**
 * Modelos são texto puro com marcadores {{variavel}}.
 * O formulário de geração é montado a partir do que aparece no texto —
 * ninguém cadastra campo em lugar nenhum.
 */

const VARIABLE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export function extractVariables(content: string): string[] {
  return [...new Set([...content.matchAll(VARIABLE)].map((m) => m[1]))]
}

export function fillTemplate(content: string, values: Record<string, string>): string {
  return content.replace(VARIABLE, (_, name) => values[name] ?? `{{${name}}}`)
}

/** `valor_total` → `Valor total` */
export function humanize(name: string): string {
  const words = name.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
