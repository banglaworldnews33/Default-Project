import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { CartItem, Product } from '@/types'

const CART_KEY = 'ngs.cart.v1'

interface CartContextValue {
  items: CartItem[]
  itemCount: number
  subtotal: number
  addItem: (product: Product, options?: { quantity?: number; size?: string; color?: string; variantId?: string | null }) => {
    ok: boolean
    message: string
  }
  updateQuantity: (productId: string, quantity: number, size?: string, color?: string, variantId?: string | null) => void
  removeItem: (productId: string, size?: string, color?: string, variantId?: string | null) => void
  clearCart: () => void
  /**
   * Add a REAL marketplace (database) product to the cart. Separate
   * from demo addItem so display snapshots (price/stock) stay
   * clearly non-authoritative; create_order() re-derives everything.
   */
  addRealItem: (input: RealCartInput) => {
    ok: boolean
    message: string
  }
}

const CartContext = createContext<CartContextValue | undefined>(undefined)

interface RealCartInput {
  productId: string
  slug: string
  name: string
  image: string
  /** Display snapshot only — create_order() reprices server-side. */
  price: number
  quantity: number
  size?: string
  color?: string
  variantId?: string | null
  maxStock: number
}

function itemKey(i: { productId: string; size?: string; color?: string; variantId?: string | null }): string {
  return `${i.productId}|${i.size ?? ''}|${i.color ?? ''}|${i.variantId ?? ''}`
}

function itemMatches(
  a: { productId: string; size?: string; color?: string; variantId?: string | null },
  b: { productId: string; size?: string; color?: string; variantId?: string | null },
) {
  return itemKey(a) === itemKey(b)
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(CART_KEY)
      return raw ? (JSON.parse(raw) as CartItem[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items))
    } catch {
      // Ignore storage errors.
    }
  }, [items])

  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items])
  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items])

  const addItem: CartContextValue['addItem'] = (product, options) => {
    const qty = options?.quantity ?? 1
    const size = options?.size ?? product.sizes[0]
    const color = options?.color ?? product.colors[0]

    if (product.stock <= 0) {
      return { ok: false, message: 'Sorry, this product is out of stock.' }
    }

    let result = { ok: true, message: `Added ${product.name} to cart.` }

    setItems((prev) => {
      const existing = prev.find((i) => itemMatches(i, { productId: product.id, size, color }))
      const currentQty = existing ? existing.quantity : 0
      const desiredQty = currentQty + qty

      if (desiredQty > product.stock) {
        result = {
          ok: false,
          message: `Only ${product.stock} items available in stock.`,
        }
        return prev
      }

      if (existing) {
        return prev.map((i) =>
          itemMatches(i, { productId: product.id, size, color })
            ? { ...i, quantity: desiredQty, maxStock: product.stock }
            : i,
        )
      }

      const newItem: CartItem = {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.image,
        price: product.price,
        quantity: qty,
        size,
        color,
        maxStock: product.stock,
      }
      return [...prev, newItem]
    })

    return result
  }

  const updateQuantity: CartContextValue['updateQuantity'] = (productId, quantity, size, color, variantId) => {
    if (quantity <= 0) {
      removeItem(productId, size, color, variantId)
      return
    }
    setItems((prev) =>
      prev.map((i) => {
        if (itemMatches(i, { productId, size, color, variantId })) {
          const clamped = Math.min(quantity, i.maxStock)
          return { ...i, quantity: clamped }
        }
        return i
      }),
    )
  }

  const removeItem: CartContextValue['removeItem'] = (productId, size, color, variantId) => {
    setItems((prev) => prev.filter((i) => !itemMatches(i, { productId, size, color, variantId })))
  }

  const addRealItem: CartContextValue['addRealItem'] = (input) => {
    if (input.maxStock <= 0) {
      return { ok: false, message: 'Sorry, this product is out of stock.' }
    }
    const qty = Math.max(1, Math.floor(input.quantity))
    let result = { ok: true, message: `Added ${input.name} to cart.` }
    setItems((prev) => {
      const existing = prev.find((i) =>
        itemMatches(i, { productId: input.productId, size: input.size, color: input.color, variantId: input.variantId }),
      )
      const currentQty = existing ? existing.quantity : 0
      const desiredQty = currentQty + qty
      if (desiredQty > input.maxStock) {
        result = { ok: false, message: `Only ${input.maxStock} available in stock.` }
        return prev
      }
      if (existing) {
        return prev.map((i) =>
          itemMatches(i, { productId: input.productId, size: input.size, color: input.color, variantId: input.variantId })
            ? { ...i, quantity: desiredQty, maxStock: input.maxStock }
            : i,
        )
      }
      const newItem: CartItem = {
        productId: input.productId,
        slug: input.slug,
        name: input.name,
        image: input.image,
        price: input.price,
        quantity: qty,
        size: input.size,
        color: input.color,
        maxStock: input.maxStock,
        variantId: input.variantId ?? null,
      }
      return [...prev, newItem]
    })
    return result
  }

  const clearCart = () => setItems([])

  return (
    <CartContext.Provider
      value={{
        items,
        itemCount,
        subtotal,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        addRealItem,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
