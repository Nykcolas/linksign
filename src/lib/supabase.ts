import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types'

const url = import.meta.env.VITE_SUPABASE_URL
// Projetos novos usam a publishable key (`sb_publishable_…`); a anon key fica
// como alternativa para projetos criados antes da troca de formato.
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY

/** Sem projeto Supabase configurado o app mostra a tela de setup em vez de quebrar. */
export const isConfigured = Boolean(url && key)

const REMEMBER_KEY = 'linksign:manter-conectado'

/** "Manter-me conectado" vem marcado por padrão. */
export function getRememberMe(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setRememberMe(value: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, String(value))
  } catch {
    // Sem storage (aba anônima bloqueada): a sessão só vale enquanto a página estiver aberta.
  }
}

/**
 * Onde a sessão fica: localStorage sobrevive a fechar o navegador,
 * sessionStorage acaba com a aba. A escolha é lida a cada gravação, então
 * precisa ser definida antes do login.
 *
 * O code-verifier do fluxo PKCE sempre vai para o localStorage: o link de
 * recuperação costuma abrir numa aba nova, que não enxerga o sessionStorage.
 */
const authStorage = {
  getItem: (k: string) => localStorage.getItem(k) ?? sessionStorage.getItem(k),
  setItem: (k: string, v: string) => {
    const persist = k.endsWith('-code-verifier') || getRememberMe()
    ;(persist ? localStorage : sessionStorage).setItem(k, v)
    ;(persist ? sessionStorage : localStorage).removeItem(k)
  },
  removeItem: (k: string) => {
    localStorage.removeItem(k)
    sessionStorage.removeItem(k)
  },
}

/**
 * O link do e-mail de recuperação volta com `#access_token=…&type=recovery`.
 * O supabase-js limpa a URL e só avisa (PASSWORD_RECOVERY) depois que o router
 * já escolheu a rota, então a marca é lida aqui, antes de o cliente ser criado.
 */
const RECOVERY_KEY = 'linksign:recuperando-senha'

if (new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery') {
  sessionStorage.setItem(RECOVERY_KEY, '1')
}

export function isRecoveringPassword(): boolean {
  return sessionStorage.getItem(RECOVERY_KEY) === '1'
}

export function finishPasswordRecovery() {
  sessionStorage.removeItem(RECOVERY_KEY)
}

export const supabase = createClient<Database>(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder',
  { auth: { storage: authStorage } },
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
