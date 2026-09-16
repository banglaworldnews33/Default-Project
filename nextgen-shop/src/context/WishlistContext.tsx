import React, { createContext, useContext, useEffect, useState } from 'react'

const WISHLIST_KEY = 'ngs.wishlist.v1'

interface WishlistContextValue {
  ids: string[]
  isWishlisted: (id: string) => boolean
  toggleWishlist: (id: string) => boolean
  count: number
}

const WishlistContext = createContext<WishlistContextValue | undefined>(undefined)

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ids, setIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(WISHLIST_KEY)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(ids))
    } catch {
      // Ignore
    }
  }, [ids])

  const isWishlisted = (id: string) => ids.includes(id)

  const toggleWishlist = (id: string): boolean => {
    let next = false
    setIds((prev) => {
      if (prev.includes(id)) {
        next = false
        return prev.filter((x) => x !== id)
      }
      next = true
      return [...prev, id]
    })
    return next
  }

  return (
    <WishlistContext.Provider
      value={{
        ids,
        isWishlisted,
        toggleWishlist,
        count: ids.length,
      }}
    >
      {children}
    </WishlistContext.Provider>
  )
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider')
  return ctx
}
