import type { PostgrestError } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export type DbError = PostgrestError | Error

export interface DbResult<T> {
  data: T | null
  error: DbError | null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export function notConfigured<T>(): DbResult<T> {
  return { data: null, error: new Error('Supabase is not configured.') }
}

export function requireConfigured<T>(): DbResult<T> | null {
  if (!isSupabaseConfigured) return notConfigured<T>()
  return null
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export function collect<T>(data: unknown, narrow: (row: unknown) => T | null): T[] {
  const rows: T[] = []
  if (Array.isArray(data)) {
    for (const row of data) {
      const item = narrow(row)
      if (item) rows.push(item)
    }
  }
  return rows
}
