import React from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { ShopPage } from './ShopPage'
import { categories } from '@/data/categories'
import type { CategorySlug } from '@/types'

export const CategoryPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>()

  const category = categories.find((c) => c.slug === slug)

  if (!category) {
    return <Navigate to="/shop" replace />
  }

  return (
    <ShopPage
      forcedCategory={category.slug as CategorySlug}
      pageTitle={category.name}
      pageDescription={category.tagline}
    />
  )
}
