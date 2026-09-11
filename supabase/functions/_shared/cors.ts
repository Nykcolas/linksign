// O supabase-js manda apikey e x-client-info além dos cabeçalhos óbvios; se o
// preflight não liberar todos, o navegador corta a requisição e o erro chega
// na tela como "falha de rede".
const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type'

// APP_ORIGIN aceita lista separada por vírgula — o Vite troca de porta quando
// a 5173 está ocupada, e não vale um redeploy por causa disso.
const ORIGINS = (Deno.env.get('APP_ORIGIN') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allow = !ORIGINS.length || ORIGINS.includes(origin) ? origin || '*' : ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}
