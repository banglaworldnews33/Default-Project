import React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ShieldCheck,
  Tag,
  Truck,
  Lock,
  Headphones,
  Sparkles,
  Flame,
  Percent,
  Zap,
  Store,
  BadgeCheck,
  Star,
  PackagePlus,
  FolderPlus,
} from 'lucide-react'
import { categories } from '@/data/categories'
import { productService } from '@/services'
import { ProductCard } from '@/components/product/ProductCard'
import { Button } from '@/components/ui/Button'
import { formatBDT } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'

function SectionHeading({
  eyebrow,
  eyebrowClassName = '',
  title,
  linkTo,
  linkLabel,
}: {
  eyebrow: React.ReactNode
  eyebrowClassName?: string
  title: string
  linkTo: string
  linkLabel: string
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 sm:mb-10 gap-4">
      <div>
        <span className={`eyebrow ${eyebrowClassName}`}>{eyebrow}</span>
        <h2 className="text-2xl sm:text-3xl font-display font-bold text-navy-900 mt-1.5">
          {title}
        </h2>
      </div>
      <Link
        to={linkTo}
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800 transition-colors"
      >
        <span>{linkLabel}</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

export const HomePage: React.FC = () => {
  const { user, profile, isLoading, profileLoading, isConfigured } = useAuth()
  const allProducts = productService.list()

  const isVerifiedSeller =
    isConfigured &&
    !isLoading &&
    !profileLoading &&
    !!user &&
    !!profile &&
    profile.role === 'seller' &&
    profile.verification_status === 'verified'

  // Role + verification status come from the authenticated profile
  // (Supabase session/database state). localStorage is never consulted.
  // Pending/rejected/held/banned sellers, customers and visitors get
  // no management buttons — exactly like the seller check above, only
  // the admin role (any verification state) unlocks admin actions.
  const isAdmin =
    isConfigured &&
    !isLoading &&
    !profileLoading &&
    !!user &&
    !!profile &&
    profile.role === 'admin'

  // Discriminant for the dedicated management-action row below. While a
  // signed-in user's profile is still resolving, a same-size skeleton
  // reserves the space so buttons never reflow the hero when they appear.
  let roleAction: 'admin' | 'seller' | null = null
  if (isAdmin) {
    roleAction = 'admin'
  } else if (isVerifiedSeller) {
    roleAction = 'seller'
  }
  const authResolving = isConfigured && !!user && (isLoading || profileLoading)

  const featured = allProducts.filter((p) => p.isFeatured)
  const newArrivals = allProducts.filter((p) => p.isNewArrival)
  const bestSellers = allProducts.filter((p) => p.isBestSeller)
  const flashSale = allProducts.filter((p) => p.discount > 0).slice(0, 4)
  const recommended = [...allProducts].sort((a, b) => b.rating - a.rating).slice(0, 4)
  const lowestDiscounted = flashSale[0]

  return (
    <div>
      {/* 1. HERO */}
      <section className="relative bg-navy-950 text-white overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-32 left-1/4 w-[500px] h-[500px] rounded-full bg-primary-600/25 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-promo-600/15 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />
        </div>

        <div className="container-shop relative py-14 sm:py-20 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-xs border border-white/15 text-primary-200 text-xs font-semibold tracking-wider uppercase">
                <Sparkles className="h-3.5 w-3.5 text-promo-400" />
                <span>New Season 2026 Collection</span>
              </div>

              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.08]">
                Style for Everyone,
                <span className="block text-primary-300">Delivered to Your Door</span>
              </h1>

              <p className="text-base sm:text-lg text-navy-200 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Discover quality fashion and lifestyle products at honest prices. Handpicked
                collections for Men, Women, Baby &amp; Moms — with Cash on Delivery across Bangladesh.
              </p>

              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-1">
                <Button to="/shop" variant="secondary" size="lg">
                  <span>Shop Now</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  to="/category/women"
                  variant="outline"
                  size="lg"
                  className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:border-white/50"
                >
                  Explore Collection
                </Button>
              </div>

              {/* Role-based management actions: dedicated stable row, separate
                  from the primary CTAs so late profile resolution never
                  reflows them. Same alignment on mobile/desktop; reserved
                  min-height + skeleton while resolving prevents any jump. */}
              {(roleAction !== null || authResolving) && (
                <div
                  aria-live="polite"
                  className="flex flex-wrap items-center justify-center lg:justify-start gap-3 min-h-[3.25rem]"
                >
                  {roleAction === 'seller' && (
                    <>
                      <Button
                        to="/seller/shop"
                        variant="outline"
                        size="lg"
                        className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:border-white/50"
                      >
                        <Store className="h-4 w-4" />
                        <span>Seller Shop</span>
                      </Button>
                      <Button
                        to="/seller/products/new"
                        variant="outline"
                        size="lg"
                        className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:border-white/50"
                      >
                        <PackagePlus className="h-4 w-4" />
                        <span>Add Product</span>
                      </Button>
                    </>
                  )}
                  {roleAction === 'admin' && (
                    <>
                      <Button
                        to="/admin/products?action=new"
                        variant="outline"
                        size="lg"
                        className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:border-white/50"
                      >
                        <PackagePlus className="h-4 w-4" />
                        <span>Add Product</span>
                      </Button>
                      <Button
                        to="/admin/categories?action=new"
                        variant="outline"
                        size="lg"
                        className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:border-white/50"
                      >
                        <FolderPlus className="h-4 w-4" />
                        <span>Add Category</span>
                      </Button>
                    </>
                  )}
                  {roleAction === null && authResolving && (
                    <span
                      aria-hidden="true"
                      className="inline-block h-[3rem] w-56 rounded-xl bg-white/10 border border-white/10"
                    />
                  )}
                </div>
              )}

              <dl className="pt-6 grid grid-cols-3 gap-4 border-t border-white/10 max-w-md mx-auto lg:mx-0 text-left">
                {[
                  { value: '10,000+', label: 'Happy Shoppers' },
                  { value: '64', label: 'Districts Covered' },
                  { value: '৳80', label: 'Dhaka Delivery', accent: true },
                ].map((s) => (
                  <div key={s.label}>
                    <dt className="sr-only">{s.label}</dt>
                    <dd className={`text-xl sm:text-2xl font-bold font-display ${s.accent ? 'text-promo-400' : 'text-white'}`}>
                      {s.value}
                    </dd>
                    <dd className="text-xs text-navy-300">{s.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="lg:col-span-5 flex justify-center">
              <div className="relative w-full max-w-md">
                <div className="aspect-[4/5] rounded-3xl overflow-hidden bg-navy-800 border border-white/10 shadow-pop relative">
                  <img
                    src="/images/categories/clothes.svg"
                    alt="NextGen Shop fashion collection"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-transparent to-transparent flex flex-col justify-end p-6">
                    <span className="text-xs uppercase tracking-widest text-promo-300 font-semibold">
                      Featured Pick
                    </span>
                    <p className="text-2xl font-display font-bold text-white mt-1">
                      Autumn Elegance
                    </p>
                    <p className="text-xs text-navy-200 mt-1">
                      From everyday essentials to festive kurtis and baby comfort sets.
                    </p>
                  </div>
                </div>

                <div className="absolute -bottom-4 -left-2 sm:-left-4 bg-white text-navy-900 rounded-2xl p-3 shadow-pop border border-neutral-100 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary-600 text-white flex items-center justify-center font-bold text-lg">
                    ৳
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 font-medium">Best Price Guarantee</p>
                    <p className="text-sm font-bold text-navy-900">Starting from ৳650</p>
                  </div>
                </div>

                {lowestDiscounted && (
                  <div className="absolute -top-3 -right-1 sm:-right-3 bg-promo-600 text-white rounded-2xl px-3.5 py-2 shadow-pop flex items-center gap-1.5">
                    <Zap className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wide">
                      Up to {lowestDiscounted.discount}% off
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. POPULAR CATEGORIES */}
      <section className="py-14 sm:py-20 bg-neutral-50 border-b border-neutral-200/70">
        <div className="container-shop">
          <div className="text-center max-w-xl mx-auto mb-10 sm:mb-12">
            <span className="eyebrow">Browse by Department</span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-navy-900 mt-1.5">
              Popular Categories
            </h2>
            <p className="text-sm text-neutral-600 mt-2">
              Curated lines for every member of the family.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                to={`/category/${cat.slug}`}
                className="group card-premium overflow-hidden flex flex-col hover:shadow-card-hover hover:-translate-y-1 hover:border-primary-200 transition-all duration-200"
              >
                <div className="aspect-[4/3] bg-primary-50/60 overflow-hidden">
                  <img
                    src={cat.image}
                    alt={cat.name}
                    loading="lazy"
                    className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg sm:text-xl font-bold text-navy-900 group-hover:text-primary-700 transition-colors">
                      {cat.name}
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{cat.tagline}</p>
                  </div>
                  <span className="flex items-center text-xs font-semibold text-primary-700">
                    Shop Now
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 3. FLASH SALE */}
      {flashSale.length > 0 && (
        <section className="py-14 sm:py-20 bg-gradient-to-b from-promo-50/70 to-white border-b border-promo-100">
          <div className="container-shop">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 sm:mb-10 gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-promo-600 text-white text-xs font-bold uppercase tracking-wider">
                  <Zap className="h-3.5 w-3.5" />
                  Limited Time
                </span>
                <h2 className="text-2xl sm:text-3xl font-display font-bold text-navy-900 mt-2">
                  Flash Sale
                </h2>
                <p className="text-sm text-neutral-600 mt-1">
                  Discounts applied automatically — limited stock at these prices.
                </p>
              </div>
              <Link
                to="/shop"
                className="inline-flex items-center gap-1 text-sm font-semibold text-promo-700 hover:text-promo-800 transition-colors"
              >
                <span>Grab the deals</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {flashSale.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 4. TRENDING NOW */}
      <section className="py-14 sm:py-20">
        <div className="container-shop">
          <SectionHeading
            eyebrow="Editor's Choice"
            title="Trending Products"
            linkTo="/shop"
            linkLabel="View all products"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featured.slice(0, 4).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* 5. SPECIAL OFFER BANNER */}
      <section className="pb-4">
        <div className="container-shop">
          <div className="relative rounded-3xl bg-navy-950 text-white p-8 sm:p-12 lg:p-14 overflow-hidden shadow-pop">
            <div className="absolute inset-0 pointer-events-none" aria-hidden>
              <div className="absolute -right-20 -top-24 w-[420px] h-[420px] rounded-full bg-primary-600/30 blur-3xl" />
              <div className="absolute right-32 bottom-0 w-[280px] h-[280px] rounded-full bg-promo-600/25 blur-3xl" />
            </div>
            <div className="relative max-w-xl space-y-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-promo-600 text-white text-xs font-bold uppercase tracking-wider">
                <Percent className="h-3.5 w-3.5" />
                Special Offer
              </span>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-white tracking-tight">
                Up to 30% Off Festive Picks
              </h2>
              <p className="text-sm sm:text-base text-navy-200 leading-relaxed">
                Save big on premium men&apos;s shirts, women&apos;s three-piece suits, and gentle
                baby cotton sets. Limited stock available at these promotional rates.
              </p>
              <div className="pt-1 flex flex-wrap gap-3">
                <Button to="/shop" variant="secondary" size="lg">
                  <span>Shop the Offer</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  to="/category/baby-moms"
                  variant="outline"
                  size="lg"
                  className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:border-white/50"
                >
                  Baby &amp; Moms
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. NEW ARRIVALS */}
      <section className="py-14 sm:py-20 bg-neutral-50/70 border-y border-neutral-200/70">
        <div className="container-shop">
          <SectionHeading
            eyebrow={<span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Just Landed</span>}
            title="New Arrivals"
            linkTo="/shop"
            linkLabel="See what's new"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {newArrivals.slice(0, 4).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* 7. BEST SELLERS */}
      <section className="py-14 sm:py-20">
        <div className="container-shop">
          <SectionHeading
            eyebrow={<span className="inline-flex items-center gap-1 text-promo-700"><Flame className="h-3.5 w-3.5" /> Customer Favorites</span>}
            title="Best Sellers"
            linkTo="/shop?sort=best-selling"
            linkLabel="View all best sellers"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {bestSellers.slice(0, 4).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* 8. SELL ON NEXTGEN (replaces invented shop listings — no seller data exists yet) */}
      <section className="pb-14 sm:pb-20">
        <div className="container-shop">
          <div className="relative rounded-3xl overflow-hidden bg-primary-700 text-white p-8 sm:p-12">
            <div className="absolute inset-0 pointer-events-none" aria-hidden>
              <div className="absolute -left-24 -bottom-28 w-[380px] h-[380px] rounded-full bg-navy-950/30 blur-3xl" />
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)',
                  backgroundSize: '24px 24px',
                }}
              />
            </div>
            <div className="relative flex flex-col lg:flex-row lg:items-center gap-8">
              <div className="flex-1 space-y-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary-100">
                  <Store className="h-4 w-4" />
                  Grow With Us
                </span>
                <h2 className="text-2xl sm:text-3xl font-display font-bold text-white">
                  Sell on NextGen Shop
                </h2>
                <p className="text-sm sm:text-base text-primary-100 leading-relaxed max-w-lg">
                  Reach thousands of shoppers across all 64 districts. Simple onboarding,
                  fair terms, and payouts you can rely on.
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1 text-sm text-primary-50">
                  {['Verified seller badge', 'Fast payouts', 'Dedicated support'].map((t) => (
                    <span key={t} className="inline-flex items-center gap-1.5">
                      <BadgeCheck className="h-4 w-4 text-promo-300" />
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
                <Button to="/sell" variant="secondary" size="lg">
                  <span>Become a Seller</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  to="/contact"
                  variant="outline"
                  size="lg"
                  className="bg-transparent text-white border-white/40 hover:bg-white/10 hover:border-white/60"
                >
                  Talk to Us
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. RECOMMENDED FOR YOU */}
      <section className="pb-14 sm:pb-20">
        <div className="container-shop">
          <SectionHeading
            eyebrow={<span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" /> Top Rated</span>}
            title="Recommended For You"
            linkTo="/shop?sort=rating"
            linkLabel="Browse top rated"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recommended.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* 10. TRUST / SERVICE */}
      <section className="py-14 sm:py-20 bg-navy-950">
        <div className="container-shop">
          <div className="text-center max-w-xl mx-auto mb-10 sm:mb-12">
            <span className="eyebrow text-primary-300">Our Promise</span>
            <h2 className="text-3xl font-display font-bold text-white mt-1.5">
              Why Shop With Us
            </h2>
            <p className="text-sm text-navy-300 mt-2">
              Every detail is designed to give you peace of mind while shopping online.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
            {[
              { icon: ShieldCheck, title: 'Quality Products', sub: 'Hand-inspected fabrics and skin-safe cotton.' },
              { icon: Tag, title: 'Fair Prices', sub: 'Factory-direct pricing, starting from ৳650.' },
              { icon: Truck, title: 'Fast Delivery', sub: `Inside Dhaka ${formatBDT(80)}, nationwide ${formatBDT(130)}.` },
              { icon: Lock, title: 'Secure Ordering', sub: 'Cash on Delivery after checking your parcel.' },
              { icon: Headphones, title: '7-Day Support', sub: 'Phone and WhatsApp support, 10am–10pm.' },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl p-6 bg-white/[0.06] border border-white/10 text-center flex flex-col items-center hover:bg-white/[0.09] transition-colors sm:last:col-span-2 lg:last:col-span-1"
              >
                <div className="h-12 w-12 rounded-2xl bg-primary-600 text-white flex items-center justify-center mb-4 shadow-sm">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-white text-base">{f.title}</h3>
                <p className="text-xs text-navy-300 mt-2 leading-relaxed">{f.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
