// Camada fina sobre a API da ZapSign. Trocar de provedor significa escrever
// outro arquivo com estas mesmas três funções — nada além disto conhece a ZapSign.

const BASE = Deno.env.get('ZAPSIGN_BASE_URL') ?? 'https://sandbox.api.zapsign.com.br/api/v1'
const TOKEN = Deno.env.get('ZAPSIGN_API_TOKEN')!

export interface CreatedDocument {
  externalId: string
  signUrl: string
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`ZapSign ${res.status}: ${JSON.stringify(body)}`)
  }
  return body
}

export async function createDocument(input: {
  name: string
  base64Pdf: string
  signerName: string
  signerEmail: string
}): Promise<CreatedDocument> {
  const doc = await call('/docs/', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      base64_pdf: input.base64Pdf,
      lang: 'pt-br',
      signers: [
        {
          name: input.signerName,
          email: input.signerEmail,
          send_automatic_email: true,
          auth_mode: 'assinaturaTela',
        },
      ],
    }),
  })

  return {
    externalId: doc.token,
    signUrl: doc.signers?.[0]?.sign_url ?? '',
  }
}

export async function getDocument(externalId: string) {
  return await call(`/docs/${externalId}/`)
}
