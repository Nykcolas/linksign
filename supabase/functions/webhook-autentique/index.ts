// Recebe os eventos da Autentique.
//
// O webhook é cadastrado no painel da Autentique e vale para a conta toda:
//   https://<projeto>.supabase.co/functions/v1/webhook-autentique
// Roda sem JWT (quem chama é a Autentique, não um usuário), então a origem é
// conferida pela assinatura HMAC-SHA256 do corpo, com AUTENTIQUE_WEBHOOK_SECRET.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { downloadSignedPdf, getDocument, isSigned } from '../_shared/autentique.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const INTERESTING = new Set(['signature.accepted', 'document.finished'])

async function hmacHex(secret: string, body: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)))
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Comparação em tempo constante, para a assinatura não vazar pelo tempo de resposta. */
function sameString(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Cada endpoint cadastrado no painel tem o próprio secret (ex.: um para eventos
// de documento, outro para os de assinatura), então aceita uma lista por vírgula.
const SECRETS = (Deno.env.get('AUTENTIQUE_WEBHOOK_SECRET') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

async function validSignature(body: string, header: string | null) {
  if (!SECRETS.length || !header) return false
  const received = header.trim().toLowerCase().replace(/^sha256=/, '')
  for (const secret of SECRETS) {
    if (sameString(await hmacHex(secret, body), received)) return true
  }
  return false
}

async function archive(documentId: string) {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: contract } = await admin
    .from('contracts')
    .select('id, status')
    .eq('external_id', documentId)
    .maybeSingle()

  // O webhook é da conta inteira: documento criado fora do app também chega aqui.
  if (!contract) return console.log('documento fora do app, ignorado', documentId)
  // Reentrega ou evento repetido: nada a fazer.
  if (contract.status === 'signed') return

  // O evento não diz se ainda falta alguém assinar; quem sabe é o documento na API.
  const doc = await getDocument(documentId)
  if (!isSigned(doc)) return console.log('aguardando outras assinaturas', documentId)

  // Guarda uma cópia nossa do PDF assinado.
  let signedFile: string | null = null
  try {
    const pdf = await downloadSignedPdf(doc)
    const path = `${contract.id}.pdf`
    const { error } = await admin.storage
      .from('contracts')
      .upload(path, pdf, { contentType: 'application/pdf', upsert: true })
    if (error) throw error
    signedFile = path
  } catch (e) {
    // O contrato está assinado de qualquer forma; o arquivo dá para buscar depois.
    console.error('falha ao arquivar PDF assinado', e)
  }

  const signedAt = doc.signatures.find((s) => s.signed)?.signed?.created_at
  await admin
    .from('contracts')
    .update({
      status: 'signed',
      signed_at: signedAt ?? new Date().toISOString(),
      signed_file: signedFile,
    })
    .eq('id', contract.id)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('método não permitido', { status: 405 })

  // A assinatura é calculada sobre o corpo cru, antes de qualquer parse.
  const body = await req.text()
  if (!(await validSignature(body, req.headers.get('x-autentique-signature')))) {
    return new Response('assinatura inválida', { status: 401 })
  }

  const event = JSON.parse(body).event
  const data = event?.data ?? {}
  // Eventos de documento trazem o próprio documento; os de assinatura, o id dele.
  const documentId: string | undefined = data.object === 'document' ? data.id : data.document

  // Demais eventos (criado, visualizado...) respondem 200 para não gerar reenvio.
  if (!INTERESTING.has(event?.type) || !documentId) {
    return new Response('ignorado', { status: 200 })
  }

  // A Autentique pede resposta rápida; baixar e guardar o PDF fica para depois do 200.
  EdgeRuntime.waitUntil(
    archive(documentId).catch((e) => console.error('falha ao processar webhook', event.type, e)),
  )
  return new Response('ok', { status: 200 })
})
