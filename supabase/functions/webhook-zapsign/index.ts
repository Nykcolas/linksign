// Recebe da ZapSign o aviso de que o cliente assinou.
//
// Precisa rodar sem JWT (quem chama é a ZapSign, não um usuário), então faça o
// deploy com --no-verify-jwt e proteja pelo segredo na query string:
//   https://<projeto>.supabase.co/functions/v1/webhook-zapsign?secret=...

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getDocument } from '../_shared/zapsign.ts'

Deno.serve(async (req) => {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }

  const payload = await req.json()
  const event = payload.event_type ?? payload.status
  const externalId = payload.token ?? payload.doc?.token

  if (!externalId) return new Response('sem token', { status: 400 })

  // Só o evento de assinatura concluída interessa; os demais são ignorados
  // com 200 para a ZapSign não ficar reenviando.
  if (event !== 'doc_signed' && event !== 'signed') {
    return new Response('ignorado', { status: 200 })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: contract } = await admin
    .from('contracts')
    .select('id, status')
    .eq('external_id', externalId)
    .single()

  if (!contract) return new Response('contrato desconhecido', { status: 404 })
  // Reentrega do mesmo evento: nada a fazer.
  if (contract.status === 'signed') return new Response('ok', { status: 200 })

  // Busca o PDF final na ZapSign e guarda uma cópia nossa — o link deles expira.
  let signedFile: string | null = null
  try {
    const doc = await getDocument(externalId)
    const url = doc.signed_file ?? doc.original_file
    if (url) {
      const pdf = await fetch(url).then((r) => r.arrayBuffer())
      const path = `${contract.id}.pdf`
      const { error } = await admin.storage
        .from('contracts')
        .upload(path, pdf, { contentType: 'application/pdf', upsert: true })
      if (!error) signedFile = path
    }
  } catch (e) {
    // O contrato está assinado de qualquer forma; o arquivo dá para buscar depois.
    console.error('falha ao arquivar PDF assinado', e)
  }

  await admin
    .from('contracts')
    .update({ status: 'signed', signed_at: new Date().toISOString(), signed_file: signedFile })
    .eq('id', contract.id)

  return new Response('ok', { status: 200 })
})
