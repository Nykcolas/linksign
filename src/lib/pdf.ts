import { jsPDF } from 'jspdf'

const MARGIN = 20 // mm
const FONT_SIZE = 11
const LINE_HEIGHT = 6 // mm

/**
 * Renderiza o texto do contrato em PDF A4.
 *
 * Como os modelos são texto puro, o texto vai para o PDF como texto de verdade
 * — selecionável e pesquisável — e não como imagem.
 */
export function renderContractPdf(content: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2
  const bottom = doc.internal.pageSize.getHeight() - MARGIN

  doc.setFont('times', 'normal')
  doc.setFontSize(FONT_SIZE)

  let y = MARGIN

  for (const paragraph of content.split('\n')) {
    // Parágrafo vazio vira espaçamento.
    const lines: string[] = paragraph.trim()
      ? doc.splitTextToSize(paragraph, width)
      : ['']

    for (const line of lines) {
      if (y + LINE_HEIGHT > bottom) {
        doc.addPage()
        y = MARGIN
      }
      doc.text(line, MARGIN, y)
      y += LINE_HEIGHT
    }
  }

  return doc
}

/** Base64 puro, sem o prefixo `data:`, que é o que a Edge Function espera. */
export function pdfToBase64(doc: jsPDF): string {
  return doc.output('datauristring').split(',')[1]
}
