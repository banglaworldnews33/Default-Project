import React, { useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  Filter,
  X,
  SlidersHorizontal,
  RotateCcw,
  Search,
  Star,
  ChevronDown,
} from 'lucide-react'
import { productService } from '@/services'
import { categories } from '@/data/categories'
import { ProductCard } from '@/components/product/ProductCard'
import { formatBDT } from '@/lib/utils'
import type { CategorySlug } from '@/types'

type SortOption = 'newest' | 'price-asc' | 'price-desc' | 'best-selling' | 'top-rated'

interface ShopPageProps {
  forcedCategory?: CategorySlug
  pageTitle?: string
  pageDescription?: string
}

export const ShopPage: React.FC<ShopPageProps> = ({
  forcedCategory,
  pageTitle,
  pageDescription,
}) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const allProducts = productService.list()

  // Mobile drawer state
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // URL state
  const queryParam = searchParams.get('q') ?? ''
  const categoryParam = forcedCategory ?? (searchParams.get('category') as CategorySlug | null)
  const sortParam = (searchParams.get('sort') as SortOption) || 'newest'
  const inStockOnlyParam = searchParams.get('inStock') === 'true'
  const filterNew = searchParams.get('filter') === 'new'
  const minPriceParam = Number(searchParams.get('minPrice')) || 0
  const maxPriceParam = Number(searchParams.get('maxPrice')) || 3000
  const selectedSizes = useMemo(() => searchParams.getAll('size'), [searchParams])
  const selectedColors = useMemo(() => searchParams.getAll('color'), [searchParams])
  const minRatingParam = Number(searchParams.get('rating')) || 0

  // Derived filter options from dataset
  const availableSizes = useMemo(() => {
    const s = new Set<string>()
    allProducts.forEach((p) => p.sizes.forEach((sz) => s.add(sz)))
    return [...s].sort()
  }, [allProducts])

  const availableColors = useMemo(() => {
    const c = new Set<string>()
    allProducts.forEach((p) => p.colors.forEach((col) => c.add(col)))
    return [...c].sort()
  }, [allProducts])

  // Helpers to update URL params
  const updateParam = (key: string, value: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  }

  const toggleArrayParam = (key: string, value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        const current = next.getAll(key)
        next.delete(key)
        if (current.includes(value)) {
          current.filter((v) => v !== value).forEach((v) => next.append(key, v))
        } else {
          ;[...current, value].forEach((v) => next.append(key, v))
        }
        return next
      },
      { replace: true },
    )
  }

  const clearAllFilters = () => {
    setSearchParams(forcedCategory ? { category: forcedCategory } : {}, { replace: true })
  }

  // Active filter count badge
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (!forcedCategory && categoryParam) count++
    if (queryParam) count++
    if (inStockOnlyParam) count++
    if (filterNew) count++
    if (minPriceParam > 0 || maxPriceParam < 3000) count++
    count += selectedSizes.length
    count += selectedColors.length
    if (minRatingParam > 0) count++
    return count
  }, [
    forcedCategory,
    categoryParam,
    queryParam,
    inStockOnlyParam,
    filterNew,
    minPriceParam,
    maxPriceParam,
    selectedSizes,
    selectedColors,
    minRatingParam,
  ])

  // Filter & sort logic
  const filteredProducts = useMemo(() => {
    return allProducts
      .filter((p) => {
        if (categoryParam && p.category !== categoryParam) return false
        if (queryParam) {
          const q = queryParam.toLowerCase()
          const matches =
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
          if (!matches) return false
        }
        if (inStockOnlyParam && p.stock <= 0) return false
        if (filterNew && !p.isNewArrival) return false
        if (p.price < minPriceParam || p.price > maxPriceParam) return false
        if (selectedSizes.length > 0 && !selectedSizes.some((s) => p.sizes.includes(s))) {
          return false
        }
        if (selectedColors.length > 0 && !selectedColors.some((c) => p.colors.includes(c))) {
          return false
        }
        if (minRatingParam > 0 && p.rating < minRatingParam) return false
        return true
      })
      .sort((a, b) => {
        switch (sortParam) {
          case 'price-asc':
            return a.price - b.price
          case 'price-desc':
            return b.price - a.price
          case 'top-rated':
            return b.rating - a.rating
          case 'best-selling':
            return (b.isBestSeller ? 1 : 0) - (a.isBestSeller ? 1 : 0) || b.reviews - a.reviews
          case 'newest':
          default:
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        }
      })
  }, [
    allProducts,
    categoryParam,
    queryParam,
    inStockOnlyParam,
    filterNew,
    minPriceParam,
    maxPriceParam,
    selectedSizes,
    selectedColors,
    minRatingParam,
    sortParam,
  ])

  // Shared filter controls JSX
  const FilterControls = (
    <div className="space-y-6 text-sm text-neutral-700">
      {/* Category (if not forced by URL) */}
      {!forcedCategory && (
        <div className="border-b border-neutral-200 pb-5">
          <h4 className="font-semibold text-neutral-900 mb-3 text-xs uppercase tracking-wider">
            Category
          </h4>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="category"
                checked={!categoryParam}
                onChange={() => updateParam('category', null)}
                className="accent-neutral-900"
              />
              <span>All Categories</span>
            </label>
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="category"
                  checked={categoryParam === c.slug}
                  onChange={() => updateParam('category', c.slug)}
                  className="accent-neutral-900"
                />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Price Range */}
      <div className="border-b border-neutral-200 pb-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-neutral-900 text-xs uppercase tracking-wider">
            Max Price
          </h4>
          <span className="text-xs font-bold text-neutral-900">
            {formatBDT(maxPriceParam)}
          </span>
        </div>
        <input
          type="range"
          min="500"
          max="3000"
          step="50"
          value={maxPriceParam}
          onChange={(e) => updateParam('maxPrice', e.target.value)}
          className="w-full accent-neutral-900 cursor-pointer"
        />
        <div className="flex justify-between text-[11px] text-neutral-400 mt-1">
          <span>৳500</span>
          <span>৳3,000</span>
        </div>
      </div>

      {/* Availability */}
      <div className="border-b border-neutral-200 pb-5">
        <h4 className="font-semibold text-neutral-900 mb-3 text-xs uppercase tracking-wider">
          Availability
        </h4>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={inStockOnlyParam}
            onChange={(e) => updateParam('inStock', e.target.checked ? 'true' : null)}
            className="rounded accent-neutral-900"
          />
          <span>In Stock Only</span>
        </label>
      </div>

      {/* Sizes */}
      <div className="border-b border-neutral-200 pb-5">
        <h4 className="font-semibold text-neutral-900 mb-3 text-xs uppercase tracking-wider">
          Sizes
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {availableSizes.map((sz) => {
            const active = selectedSizes.includes(sz)
            return (
              <button
                key={sz}
                type="button"
                onClick={() => toggleArrayParam('size', sz)}
                className={`px-3 py-1 text-xs rounded border transition-colors cursor-pointer ${
                  active
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                }`}
              >
                {sz}
              </button>
            )
          })}
        </div>
      </div>

      {/* Colors */}
      <div className="border-b border-neutral-200 pb-5">
        <h4 className="font-semibold text-neutral-900 mb-3 text-xs uppercase tracking-wider">
          Colors
        </h4>
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {availableColors.map((col) => {
            const active = selectedColors.includes(col)
            return (
              <label key={col} className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleArrayParam('color', col)}
                  className="rounded accent-neutral-900"
                />
                <span>{col}</span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Rating */}
      <div className="pb-2">
        <h4 className="font-semibold text-neutral-900 mb-3 text-xs uppercase tracking-wider">
          Minimum Rating
        </h4>
        <div className="space-y-1.5">
          {[4, 3].map((stars) => (
            <label key={stars} className="flex items-center gap-2 cursor-pointer text-xs">
              <input
                type="radio"
                name="rating"
                checked={minRatingParam === stars}
                onChange={() => updateParam('rating', String(stars))}
                className="accent-neutral-900"
              />
              <div className="flex items-center text-amber-500">
                {Array.from({ length: stars }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                ))}
                <span className="ml-1.5 text-neutral-700 font-medium">& Up</span>
              </div>
            </label>
          ))}
          {minRatingParam > 0 && (
            <button
              type="button"
              onClick={() => updateParam('rating', null)}
              className="text-xs text-neutral-500 hover:text-neutral-900 underline mt-1"
            >
              Reset rating filter
            </button>
          )}
        </div>
      </div>

      {/* Reset all */}
      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={clearAllFilters}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-700 hover:bg-neutral-100 cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset All Filters</span>
        </button>
      )}
    </div>
  )

  const title =
    pageTitle ||
    (forcedCategory
      ? categories.find((c) => c.slug === forcedCategory)?.name || 'Category'
      : queryParam
      ? `Search results for "${queryParam}"`
      : 'All Products')

  const description =
    pageDescription ||
    (forcedCategory
      ? categories.find((c) => c.slug === forcedCategory)?.tagline
      : 'Browse our complete catalog of men, women, baby & moms fashion.')

  return (
    <div className="container-shop py-8 sm:py-12">
      {/* Breadcrumb */}
      <div className="text-xs text-neutral-400 mb-4 flex items-center gap-1.5">
        <Link to="/" className="hover:text-neutral-700">
          Home
        </Link>
        <span>/</span>
        <span className="text-neutral-700 font-medium">{title}</span>
      </div>

      {/* Header */}
      <div className="border-b border-neutral-200 pb-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900">
              {title}
            </h1>
            {description && <p className="text-sm text-neutral-500 mt-1">{description}</p>}
          </div>

          {/* Controls: Filter toggle (mobile) + Sort selector */}
          <div className="flex items-center gap-3 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="lg:hidden flex items-center gap-2 px-3.5 py-2 rounded-lg border border-neutral-300 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 cursor-pointer"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="h-4 min-w-4 px-1 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <div className="relative flex items-center">
              <label htmlFor="sort-select" className="sr-only">
                Sort products
              </label>
              <select
                id="sort-select"
                value={sortParam}
                onChange={(e) => updateParam('sort', e.target.value)}
                className="appearance-none bg-white border border-neutral-300 text-xs sm:text-sm font-semibold text-neutral-800 rounded-lg pl-3 pr-8 py-2 hover:border-neutral-400 focus:outline-none cursor-pointer"
              >
                <option value="newest">Sort by: Newest</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="best-selling">Best Selling</option>
                <option value="top-rated">Top Rated</option>
              </select>
              <ChevronDown className="h-4 w-4 text-neutral-500 absolute right-2.5 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Search pill if active */}
        {queryParam && (
          <div className="mt-4 inline-flex items-center gap-2 bg-neutral-100 rounded-full px-3 py-1 text-xs text-neutral-700">
            <Search className="h-3.5 w-3.5 text-neutral-400" />
            <span>Search: &ldquo;{queryParam}&rdquo;</span>
            <button
              onClick={() => updateParam('q', null)}
              className="hover:text-neutral-900 cursor-pointer"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Main content: Filters sidebar + Product grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block lg:col-span-1">
          <div className="sticky top-24 bg-white rounded-xl p-5 border border-neutral-200/80 shadow-xs">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-neutral-200">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span>Filters</span>
              </h3>
              {activeFilterCount > 0 && (
                <span className="text-xs text-neutral-500 font-medium">
                  {activeFilterCount} active
                </span>
              )}
            </div>
            {FilterControls}
          </div>
        </aside>

        {/* Products listing */}
        <div className="lg:col-span-3">
          {/* Results count */}
          <div className="mb-4 text-xs text-neutral-500 flex items-center justify-between">
            <span>
              Showing <strong className="text-neutral-900">{filteredProducts.length}</strong>{' '}
              {filteredProducts.length === 1 ? 'product' : 'products'}
            </span>
          </div>

          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center bg-neutral-50/50">
              <div className="h-12 w-12 rounded-full bg-neutral-200 text-neutral-500 flex items-center justify-center mx-auto mb-3">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">No products found</h3>
              <p className="text-xs sm:text-sm text-neutral-500 mt-1 max-w-sm mx-auto">
                We couldn&rsquo;t find anything matching your filters or search query. Try clearing
                some filters or searching for something else.
              </p>
              <button
                onClick={clearAllFilters}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Clear All Filters</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-neutral-900/50 backdrop-blur-xs"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="relative ml-auto w-full max-w-xs h-full bg-white shadow-2xl p-6 overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-neutral-200">
                <h3 className="font-semibold text-neutral-900 text-base flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>Filters</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="p-1 rounded-md text-neutral-500 hover:text-neutral-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {FilterControls}
            </div>

            <div className="pt-6 border-t border-neutral-200 mt-6">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="w-full py-3 rounded-lg bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 cursor-pointer"
              >
                Show {filteredProducts.length} Results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
