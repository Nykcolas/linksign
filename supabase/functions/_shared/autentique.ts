// Camada fina sobre a API GraphQL da Autentique. Trocar de provedor significa
// escrever outro arquivo com estas mesmas funções — nada além disto conhece a Autentique.

const ENDPOINT = 'https://api.autentique.com.br/v2/graphql'
const TOKEN = Deno.env.get('AUTENTIQUE_TOKEN')!

/**
 * Documento de teste: não é cobrado, some depois de alguns dias e não tem
 * validade jurídica. Ligado por segredo, para testar sem mexer no código.
 */
export const SANDBOX = Deno.env.get('AUTENTIQUE_SANDBOX') === 'true'

export interface CreatedDocument {
  externalId: string
  signUrl: string
}

export interface AutentiqueDocument {
  id: string
  files: { original: string | null; signed: string | null }
  signatures: {
    public_id: string
    action: { name: string } | null
    signed: { created_at: string } | null
    rejected: { created_at: string } | null
  }[]
}

async function call<T>(body: BodyInit, contentType?: string): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    body,
  })

  const payload = await res.json().catch(() => null)
  if (!res.ok || payload?.errors?.length) {
    throw new Error(`Autentique ${res.status}: ${JSON.stringify(payload?.errors ?? payload)}`)
  }
  return payload.data as T
}

/**
 * Cria o documento com um signatário por link: a Autentique não envia e-mail,
 * só devolve o link, que o app mostra para ser repassado ao cliente.
 */
export async function createDocument(input: {
  name: string
  base64Pdf: string
  signerName: string
}): Promise<CreatedDocument> {
  const query = `
    mutation CreateDocument($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!, $sandbox: Boolean) {
      createDocument(sandbox: $sandbox, document: $document, signers: $signers, file: $file) {
        id
        signatures { public_id link { short_link } }
      }
    }`

  const operations = {
    query,
    variables: {
      sandbox: SANDBOX,
      document: { name: input.name },
      signers: [{ name: input.signerName, action: 'SIGN', delivery_method: 'DELIVERY_METHOD_LINK' }],
      file: null,
    },
  }

  // O arquivo vai pelo padrão de upload multipart do GraphQL, não em base64.
  const pdf = Uint8Array.from(atob(input.base64Pdf), (c) => c.charCodeAt(0))
  const form = new FormData()
  form.append('operations', JSON.stringify(operations))
  form.append('map', JSON.stringify({ file: ['variables.file'] }))
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'contrato.pdf')

  const data = await call<{
    createDocument: { id: string; signatures: { link: { short_link: string } | null }[] }
  }>(form)

  // A lista também traz a conta dona do documento, sem link; o signatário é quem tem.
  const signUrl = data.createDocument.signatures.find((s) => s.link)?.link?.short_link
  if (!signUrl) throw new Error('Autentique não devolveu link de assinatura')

  return { externalId: data.createDocument.id, signUrl }
}

export async function getDocument(id: string): Promise<AutentiqueDocument> {
  const query = `
    query Document($id: UUID!) {
      document(id: $id) {
        id
        files { original signed }
        signatures {
          public_id
          action { name }
          signed { created_at }
          rejected { created_at }
        }
      }
    }`

  const data = await call<{ document: AutentiqueDocument }>(
    JSON.stringify({ query, variables: { id } }),
    'application/json',
  )
  return data.document
}

/** Assinado quando todos que têm uma ação (assinar, testemunhar...) já assinaram. */
export function isSigned(doc: AutentiqueDocument): boolean {
  const signers = doc.signatures.filter((s) => s.action)
  return signers.length > 0 && signers.every((s) => s.signed)
}

/**
 * Baixa o PDF assinado. Logo depois da última assinatura a Autentique ainda
 * pode estar gerando o arquivo e responde 425 (cedo demais) — então tenta de novo.
 */
export async function downloadSignedPdf(doc: AutentiqueDocument): Promise<ArrayBuffer> {
  if (!doc.files.signed) throw new Error('documento sem arquivo assinado')

  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(doc.files.signed, { headers: { Authorization: `Bearer ${TOKEN}` } })
    if (res.ok) return await res.arrayBuffer()
    if (res.status !== 425) throw new Error(`PDF assinado respondeu ${res.status}`)
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  throw new Error('PDF assinado ainda não ficou pronto')
}
