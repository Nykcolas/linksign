// Envia um contrato em draft para assinatura.
//
// O app manda o id do contrato e o PDF já renderizado; esta função é a única
// que conhece o token da Autentique. Ele nunca sai do servidor.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SANDBOX, createDocument } from '../_shared/autentique.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const auth = req.headers.get('Authorization')
  if (!auth) return json(req, { error: 'não autenticado' }, 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Confere quem está chamando com o JWT do próprio usuário.
  const { data: user } = await createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  ).auth.getUser()

  if (!user?.user) return json(req, { error: 'não autenticado' }, 401)

  const { contractId, base64Pdf } = await req.json()
  if (!contractId || !base64Pdf) {
    return json(req, { error: 'contractId e base64Pdf são obrigatórios' }, 400)
  }

  const { data: contract, error } = await admin
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .single()

  if (error || !contract) return json(req, { error: 'contrato não encontrado' }, 404)
  if (contract.status !== 'draft') {
    return json(req, { error: `contrato já está em ${contract.status}` }, 409)
  }

  try {
    const doc = await createDocument({
      name: `${contract.client_name} — ${contractId.slice(0, 8)}`,
      base64Pdf,
      signerName: contract.client_name,
    })

    await admin
      .from('contracts')
      .update({
        status: 'pending_signature',
        external_id: doc.externalId,
        sign_url: doc.signUrl,
      })
      .eq('id', contractId)

    return json(req, { signUrl: doc.signUrl, externalId: doc.externalId, sandbox: SANDBOX })
  } catch (e) {
    console.error('falha ao criar documento na Autentique', e)
    return json(req, { error: 'falha ao enviar para assinatura' }, 502)
  }
})
