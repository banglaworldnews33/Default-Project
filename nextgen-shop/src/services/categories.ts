import { supabase } from '@/lib/supabase'
import type { MarketplaceCategory } from '@/types'
import {
  collect,
  requireConfigured,
  type DbResult,
} from './db'
import { toMarketplaceCategory } from './catalog'

export interface CategoryInput {
  name: string
  slug: string
  description: string | null
  imageUrl: string | null
  parentId: string | null
  sortOrder: number
  isActive: boolean
}

function categoryPayload(input: CategoryInput): Record<string, string | number | boolean | null> {
  return {
    name: input.name,
    slug: input.slug,
    description: input.description,
    image_url: input.imageUrl,
    parent_id: input.parentId,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  }
}

/** Category reads (public) + admin management (is_admin policies). */
export const categoriesService = {
  async listActive(): Promise<DbResult<MarketplaceCategory[]>> {
    const missing = requireConfigured<MarketplaceCategory[]>()
    if (missing) return missing
    const { data, error } = await supabase
      .from('categories')
      .select('id,name,slug,description,image_url,parent_id,is_active,sort_order,created_at,updated_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) return { data: null, error }
    return { data: collect(data, toMarketplaceCategory), error: null }
  },

  /** All categories including inactive (admin policy gates). */
  async listAll(): Promise<DbResult<MarketplaceCategory[]>> {
    const missing = requireConfigured<MarketplaceCategory[]>()
    if (missing) return missing
    const { data, error } = await supabase
      .from('categories')
      .select('id,name,slug,description,image_url,parent_id,is_active,sort_order,created_at,updated_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) return { data: null, error }
    return { data: collect(data, toMarketplaceCategory), error: null }
  },

  async create(input: CategoryInput): Promise<DbResult<MarketplaceCategory>> {
    const missing = requireConfigured<MarketplaceCategory>()
    if (missing) return missing
    if (input.imageUrl && !input.imageUrl.startsWith('https://')) {
      return { data: null, error: new Error('Image URL must start with https://') }
    }
    const { data, error } = await supabase
      .from('categories')
      .insert(categoryPayload(input))
      .select('id,name,slug,description,image_url,parent_id,is_active,sort_order,created_at,updated_at')
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toMarketplaceCategory(data), error: null }
  },

  async update(id: string, input: CategoryInput): Promise<DbResult<MarketplaceCategory>> {
    const missing = requireConfigured<MarketplaceCategory>()
    if (missing) return missing
    if (input.imageUrl && !input.imageUrl.startsWith('https://')) {
      return { data: null, error: new Error('Image URL must start with https://') }
    }
    const { data, error } = await supabase
      .from('categories')
      .update(categoryPayload(input))
      .eq('id', id)
      .select('id,name,slug,description,image_url,parent_id,is_active,sort_order,created_at,updated_at')
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toMarketplaceCategory(data), error: null }
  },

  /** Prefer deactivation (products reference categories with RESTRICT). */
  async setActive(id: string, isActive: boolean): Promise<DbResult<MarketplaceCategory>> {
    const missing = requireConfigured<MarketplaceCategory>()
    if (missing) return missing
    const { data, error } = await supabase
      .from('categories')
      .update({ is_active: isActive })
      .eq('id', id)
      .select('id,name,slug,description,image_url,parent_id,is_active,sort_order,created_at,updated_at')
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: toMarketplaceCategory(data), error: null }
  },
}
