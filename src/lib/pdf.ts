import { jsPDF } from 'jspdf'
import { toHtml } from './richtext'

const MARGIN = 20 // mm
const FONT_SIZE = 11 // pt
const LINE_HEIGHT = 6 // mm, para FONT_SIZE
const PARAGRAPH_GAP = 3 // mm
const INDENT = 7 // mm, listas e citações
const PT_TO_MM = 0.3528
const HEADING_SIZE: Record<string, number> = { H1: 16, H2: 13.5, H3: 12 }

type Style = { bold: boolean; italic: boolean; underline: boolean; strike: boolean }
type Run = (Style & { text: string }) | { br: true }
type Align = 'left' | 'center' | 'right' | 'justify'
type Word = { text: string; style: Style; width: number; spaceBefore: number }

const PLAIN: Style = { bold: false, italic: false, underline: false, strike: false }
const BLOCKS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'PRE', 'TABLE',
])

/**
 * Renderiza o contrato (HTML do editor) em PDF A4.
 *
 * O texto vai para o PDF como texto de verdade — selecionável e pesquisável —
 * e não como imagem. Por isso a formatação é desenhada aqui: títulos, negrito,
 * itálico, sublinhado, tachado, listas, citação, linha horizontal e alinhamento.
 */
export function renderContractPdf(content: string): jsPDF {
  const body = new DOMParser().parseFromString(toHtml(content), 'text/html').body
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const right = doc.internal.pageSize.getWidth() - MARGIN
  const bottom = doc.internal.pageSize.getHeight() - MARGIN

  // `y` é a linha de base da próxima linha de texto.
  let y = MARGIN

  function ensureSpace(height: number) {
    if (y + height > bottom) {
      doc.addPage()
      y = MARGIN
    }
  }

  /**
   * Largura em mm, sem kerning. O `getTextWidth` do jsPDF desconta o kerning de
   * pares como "TA" e "AT", mas o `text()` escreve sem ele: medindo com kerning,
   * cada trecho desenhado à parte (troca de negrito, palavra no justificado)
   * começa antes da hora e engole o espaço anterior.
   */
  function measure(text: string) {
    const options = { doKerning: false } as Parameters<jsPDF['getStringUnitWidth']>[1]
    return (doc.getStringUnitWidth(text, options) * doc.getFontSize()) / doc.internal.scaleFactor
  }

  function setStyle(style: Style, size: number) {
    const variant =
      style.bold && style.italic ? 'bolditalic' : style.bold ? 'bold' : style.italic ? 'italic' : 'normal'
    doc.setFont('times', variant)
    doc.setFontSize(size)
  }

  /** Quebra os trechos em linhas de palavras que cabem em `width`. */
  function layout(runs: Run[], width: number, size: number): Word[][] {
    const lines: Word[][] = [[]]
    let x = 0
    let pendingSpace = false

    for (const run of runs) {
      if ('br' in run) {
        lines.push([])
        x = 0
        pendingSpace = false
        continue
      }
      setStyle(run, size)
      // Só espaço comum quebra linha; o não separável (U+00A0) segura "R$ 1.500,00" junto.
      for (const part of run.text.split(/([ \t\r\n]+)/)) {
        if (!part) continue
        if (/^[ \t\r\n]+$/.test(part)) {
          pendingSpace = true
          continue
        }
        // O não separável já cumpriu seu papel (não quebrar a linha). O jsPDF mede
        // ele com o dobro da largura de um espaço, então sai como espaço comum.
        const text = part.replace(/ /g, ' ')
        const width_ = measure(text)
        let line = lines[lines.length - 1]
        const space = line.length && pendingSpace ? measure(' ') : 0
        if (line.length && x + space + width_ > width) {
          line = []
          lines.push(line)
          x = 0
        }
        const spaceBefore = line.length ? space : 0
        line.push({ text, style: run, width: width_, spaceBefore })
        x += spaceBefore + width_
        pendingSpace = false
      }
    }
    return lines
  }

  function decorate(style: Style, x: number, width: number, size: number) {
    if (!style.underline && !style.strike) return
    const em = size * PT_TO_MM
    doc.setLineWidth(0.25)
    if (style.underline) doc.line(x, y + em * 0.15, x + width, y + em * 0.15)
    if (style.strike) doc.line(x, y - em * 0.28, x + width, y - em * 0.28)
  }

  function drawLines(lines: Word[][], left: number, size: number, align: Align) {
    const width = right - left
    const lineHeight = LINE_HEIGHT * (size / FONT_SIZE)

    lines.forEach((line, index) => {
      ensureSpace(lineHeight)
      const natural = line.reduce((sum, word) => sum + word.spaceBefore + word.width, 0)
      const slack = Math.max(0, width - natural)
      const gaps = line.filter((word) => word.spaceBefore > 0).length
      // Última linha do parágrafo não é esticada, como em qualquer editor.
      const justify = align === 'justify' && index < lines.length - 1 && gaps > 0
      const extra = justify ? slack / gaps : 0
      let x = left + (align === 'center' ? slack / 2 : align === 'right' ? slack : 0)

      // Palavras vizinhas com o mesmo estilo saem num `text()` só: se cada
      // palavra fosse separada, o leitor de PDF poderia não achar a frase na busca.
      let segment: { text: string; style: Style; x: number; width: number } | null = null
      const flush = () => {
        if (!segment) return
        setStyle(segment.style, size)
        doc.text(segment.text, segment.x, y)
        decorate(segment.style, segment.x, segment.width, size)
        segment = null
      }

      for (const word of line) {
        const gap = word.spaceBefore ? word.spaceBefore + extra : 0
        if (segment && !justify && sameStyle(segment.style, word.style)) {
          segment.text += (word.spaceBefore ? ' ' : '') + word.text
          segment.width += gap + word.width
        } else {
          flush()
          segment = { text: word.text, style: word.style, x: x + gap, width: word.width }
        }
        x += gap + word.width
      }
      flush()
      y += lineHeight
    })
  }

  function writeParagraph(runs: Run[], left: number, size: number, align: Align, gap: number) {
    drawLines(layout(runs, right - left, size), left, size, align)
    y += gap
  }

  function writeBlocks(container: Element, left: number, gap = PARAGRAPH_GAP) {
    const children = Array.from(container.children)

    // Conteúdo só inline (ex.: <li>texto</li> vindo de modelo em Markdown).
    if (!children.some((child) => BLOCKS.has(child.tagName))) {
      writeParagraph(inlineRuns(container), left, FONT_SIZE, alignOf(container), gap)
      return
    }

    for (const child of Array.from(container.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? ''
        if (text.trim()) writeParagraph([{ text, ...PLAIN }], left, FONT_SIZE, 'left', gap)
        continue
      }
      if (!(child instanceof HTMLElement)) continue

      switch (child.tagName) {
        case 'H1':
        case 'H2':
        case 'H3':
        case 'H4':
        case 'H5':
        case 'H6':
          if (y > MARGIN) y += 2
          writeParagraph(
            inlineRuns(child, { ...PLAIN, bold: true }),
            left,
            HEADING_SIZE[child.tagName] ?? FONT_SIZE,
            alignOf(child),
            PARAGRAPH_GAP,
          )
          break

        case 'UL':
        case 'OL': {
          const ordered = child.tagName === 'OL'
          let number = Number(child.getAttribute('start')) || 1
          for (const item of Array.from(child.children)) {
            if (item.tagName !== 'LI') continue
            ensureSpace(LINE_HEIGHT)
            setStyle(PLAIN, FONT_SIZE)
            doc.text(ordered ? `${number++}.` : '•', left + 1, y)
            writeBlocks(item, left + INDENT, 1)
          }
          y += PARAGRAPH_GAP - 1
          break
        }

        case 'BLOCKQUOTE':
          writeBlocks(child, left + INDENT, gap)
          break

        case 'HR':
          ensureSpace(LINE_HEIGHT)
          doc.setLineWidth(0.2)
          doc.line(left, y - 1.5, right, y - 1.5)
          y += LINE_HEIGHT
          break

        case 'PRE':
          writeParagraph(
            (child.textContent ?? '')
              .split('\n')
              .flatMap((line, i): Run[] => [...(i ? [{ br: true } as const] : []), { text: line, ...PLAIN }]),
            left,
            FONT_SIZE,
            'left',
            gap,
          )
          break

        case 'DIV':
          writeBlocks(child, left, gap)
          break

        // P, tabela e inline solto: o texto como parágrafo.
        default:
          writeParagraph(inlineRuns(child), left, FONT_SIZE, alignOf(child), gap)
      }
    }
  }

  writeBlocks(body, MARGIN)
  return doc
}

function inlineRuns(node: Node, style: Style = PLAIN): Run[] {
  const runs: Run[] = []
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      runs.push({ text: child.textContent ?? '', ...style })
      continue
    }
    if (!(child instanceof HTMLElement)) continue
    const tag = child.tagName
    if (tag === 'BR') {
      runs.push({ br: true })
      continue
    }
    runs.push(
      ...inlineRuns(child, {
        bold: style.bold || tag === 'STRONG' || tag === 'B',
        italic: style.italic || tag === 'EM' || tag === 'I',
        underline: style.underline || tag === 'U',
        strike: style.strike || tag === 'S' || tag === 'DEL' || tag === 'STRIKE',
      }),
    )
  }
  return runs
}

function alignOf(element: Element): Align {
  const align = element instanceof HTMLElement ? element.style.textAlign : ''
  return align === 'center' || align === 'right' || align === 'justify' ? align : 'left'
}

function sameStyle(a: Style, b: Style) {
  return (
    a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.strike === b.strike
  )
}

/** Base64 puro, sem o prefixo `data:`, que é o que a Edge Function espera. */
export function pdfToBase64(doc: jsPDF): string {
  return doc.output('datauristring').split(',')[1]
}
