import DOMPurify from 'dompurify'
import { marked } from 'marked'

/**
 * O texto dos modelos é HTML, gerado pelo editor visual.
 *
 * Modelos salvos antes do editor eram texto puro ou Markdown. Eles são
 * convertidos na leitura, então o banco não precisa de migração de dados.
 * `breaks` mantém cada quebra de linha dos modelos de texto puro.
 */
export function toHtml(content: string): string {
  if (/^\s*</.test(content)) return content
  return marked.parse(content, { gfm: true, breaks: true, async: false })
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html)
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
