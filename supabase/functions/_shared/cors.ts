const allowed = Deno.env.get('APP_ORIGIN') ?? '*'

export const cors = {
  'Access-Control-Allow-Origin': allowed,
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
