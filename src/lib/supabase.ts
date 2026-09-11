import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Sem projeto Supabase configurado o app mostra a tela de setup em vez de quebrar. */
export const isConfigured = Boolean(url && key)

export const supabase = createClient<Database>(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder',
)

/** Chama uma Edge Function com o JWT do usuário logado. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (error) throw error
  return data as T
}
