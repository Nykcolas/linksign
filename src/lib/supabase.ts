import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types'

const url = import.meta.env.VITE_SUPABASE_URL
// Projetos novos usam a publishable key (`sb_publishable_…`); a anon key fica
// como alternativa para projetos criados antes da troca de formato.
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY

/** Sem projeto Supabase configurado o app mostra a tela de setup em vez de quebrar. */
export const isConfigured = Boolean(url && key)

export const supabase = createClient<Database>(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder',
)

/**
 * Chama uma Edge Function com o JWT do usuário logado.
 *
 * O erro cru do supabase-js não diz nada de útil: uma função que não existe
 * derruba o preflight de CORS e chega aqui como "falha de rede". Então a
 * mensagem real é remontada a partir da resposta.
 */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (!error) return data as T

  const response = (error as { context?: unknown }).context
  if (response instanceof Response) {
    const detail = await response.json().catch(() => null)
    if (detail?.error) throw new Error(detail.error)
    if (response.status === 404) {
      throw new Error(`A função "${name}" não está publicada. Rode: npm run deploy:functions`)
    }
    throw new Error(`A função "${name}" respondeu ${response.status}.`)
  }

  if (error.name === 'FunctionsFetchError') {
    throw new Error(
      `Não foi possível falar com a função "${name}". ` +
        'Ela pode não estar publicada (npm run deploy:functions) ou este domínio ' +
        'não está em APP_ORIGIN.',
    )
  }

  throw error
}
