import type { Category } from '@/types'

export const categories: Category[] = [
  {
    id: 'cat-men',
    slug: 'men',
    name: 'Men',
    tagline: 'Shirts, tees & essentials',
    image: '/images/categories/men.svg',
  },
  {
    id: 'cat-women',
    slug: 'women',
    name: 'Women',
    tagline: 'Kurti, three piece & more',
    image: '/images/categories/women.svg',
  },
  {
    id: 'cat-baby-moms',
    slug: 'baby-moms',
    name: 'Baby & Moms',
    tagline: 'Care for mom & little ones',
    image: '/images/categories/baby-moms.svg',
  },
  {
    id: 'cat-clothes',
    slug: 'clothes',
    name: 'Clothes',
    tagline: 'Everyday fashion for all',
    image: '/images/categories/clothes.svg',
  },
]

export const categoryBySlug = (slug: string): Category | undefined =>
  categories.find((c) => c.slug === slug)
