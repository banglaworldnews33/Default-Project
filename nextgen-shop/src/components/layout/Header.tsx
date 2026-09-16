import React, { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  Search,
  ShoppingBag,
  Menu,
  X,
  User,
  Heart,
  Truck,
  Package,
  Phone,
  LayoutDashboard,
  Store,
  ChevronDown,
} from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { useWishlist } from '@/context/WishlistContext'
import { STORE_CONFIG } from '@/data/storeConfig'
import { SiteLogo } from '@/components/brand/SiteLogo'

export const Header: React.FC = () => {
  const { itemCount } = useCart()
  const { count: wishlistCount } = useWishlist()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Shop All', path: '/shop' },
    { name: 'Men', path: '/category/men' },
    { name: 'Women', path: '/category/women' },
    { name: 'Baby & Moms', path: '/category/baby-moms' },
    { name: 'Clothes', path: '/category/clothes' },
  ]

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    navigate(`/shop?q=${encodeURIComponent(searchQuery.trim())}`)
    setSearchQuery('')
    setMobileMenuOpen(false)
    setMobileSearchOpen(false)
  }

  const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors py-2 border-b-2 -mb-px ${
      isActive
        ? 'text-primary-700 border-primary-600 font-semibold'
        : 'text-neutral-600 border-transparent hover:text-navy-900 hover:border-navy-200'
    }`

  const searchField = (id: string, placeholder: string, auto?: boolean) => (
    <form onSubmit={handleSearch} className="relative w-full" role="search">
      <input
        id={id}
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={placeholder}
        autoFocus={auto}
        aria-label="Search products"
        className="w-full rounded-xl border border-neutral-300 bg-neutral-50 pl-10 pr-24 py-2.5 text-sm text-navy-900 placeholder:text-neutral-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 transition-all"
      />
      <Search className="h-4 w-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <button
        type="submit"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-4 py-1.5 transition-colors cursor-pointer"
      >
        Search
      </button>
    </form>
  )

  return (
    <>
      {/* Top utility strip */}
      <div className="bg-navy-950 text-navy-100 text-xs">
        <div className="container-shop flex items-center justify-between py-2">
          <p className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-promo-400" />
            <span className="hidden sm:inline">Cash on Delivery available all over Bangladesh</span>
            <span className="sm:hidden">Cash on Delivery nationwide</span>
          </p>
          <div className="hidden sm:flex items-center gap-4">
            <a href={`tel:${STORE_CONFIG.phone}`} className="hover:text-white flex items-center gap-1 transition-colors">
              <Phone className="h-3 w-3" />
              <span>{STORE_CONFIG.phone}</span>
            </a>
            <Link to="/track-order" className="hover:text-white transition-colors">
              Track Order
            </Link>
            <Link to="/orders" className="hover:text-white transition-colors">
              My Orders
            </Link>
            <Link to="/sell" className="hover:text-white flex items-center gap-1 transition-colors">
              <Store className="h-3 w-3" />
              <span>Become a Seller</span>
            </Link>
            <Link to="/admin" className="hover:text-white flex items-center gap-1 font-semibold text-primary-300 transition-colors">
              <LayoutDashboard className="h-3 w-3" />
              <span>Admin</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main sticky header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-neutral-200 shadow-[0_1px_12px_-6px_rgb(15_30_51/0.15)]">
        <div className="container-shop">
          {/* Desktop main row */}
          <div className="hidden lg:flex items-center gap-6 h-20">
            <SiteLogo height={52} />

            <div className="flex-1 max-w-2xl">
              {searchField('search-desktop', 'Search for shirts, kurtis, baby sets and more…')}
            </div>

            <div className="flex items-center gap-1 ml-auto">
              <Link
                to="/sell"
                className="hidden xl:flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-navy-800 hover:bg-navy-50 transition-colors"
              >
                <Store className="h-4 w-4 text-primary-600" />
                <span>Become a Seller</span>
              </Link>
              <Link
                to="/market"
                className="hidden xl:flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-navy-800 hover:bg-navy-50 transition-colors"
              >
                <Store className="h-4 w-4 text-primary-600" />
                <span>Live Market</span>
              </Link>
              <Link
                to="/login"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-navy-800 hover:bg-navy-50 transition-colors"
                title="Account / Login"
              >
                <User className="h-5 w-5" />
                <span className="hidden xl:inline">Account</span>
              </Link>
              <Link
                to="/wishlist"
                className="relative p-2.5 rounded-xl text-navy-800 hover:bg-navy-50 transition-colors"
                title="Wishlist"
                aria-label={`Wishlist, ${wishlistCount} items`}
              >
                <Heart className="h-5 w-5" />
                {wishlistCount > 0 && (
                  <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-promo-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {wishlistCount}
                  </span>
                )}
              </Link>
              <Link
                to="/cart"
                className="flex items-center gap-2 ml-1 pl-3 pr-2 py-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition-colors shadow-sm"
                aria-label={`Cart, ${itemCount} items`}
              >
                <ShoppingBag className="h-4 w-4" />
                <span className="text-sm font-semibold hidden xl:inline">Cart</span>
                <span className="h-5 min-w-5 px-1.5 rounded-lg bg-white/25 text-white text-xs font-bold flex items-center justify-center leading-none">
                  {itemCount}
                </span>
              </Link>
            </div>
          </div>

          {/* Desktop category nav row */}
          <nav className="hidden lg:flex items-center gap-7 border-t border-neutral-100" aria-label="Categories">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-navy-900 py-2.5 pr-2 border-r border-neutral-200 mr-1">
              <Menu className="h-4 w-4" />
              Categories
              <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
            </span>
            {navLinks.map((item) => (
              <NavLink key={item.path} to={item.path} className={desktopLinkClass}>
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* Mobile / tablet main row */}
          <div className="lg:hidden">
            <div className="flex items-center justify-between gap-2 h-16">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((o) => !o)}
                className="p-2 -ml-2 rounded-xl text-navy-800 hover:bg-navy-50 transition-colors cursor-pointer"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>

              <SiteLogo height={32} />

              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen((o) => !o)}
                  className="p-2 rounded-xl text-navy-800 hover:bg-navy-50 transition-colors cursor-pointer"
                  aria-label="Toggle search"
                  aria-expanded={mobileSearchOpen}
                >
                  <Search className="h-5 w-5" />
                </button>
                <Link
                  to="/login"
                  className="p-2 rounded-xl text-navy-800 hover:bg-navy-50 transition-colors"
                  aria-label="Account"
                >
                  <User className="h-5 w-5" />
                </Link>
                <Link
                  to="/cart"
                  className="relative flex items-center gap-1.5 p-2 pl-2.5 pr-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                  aria-label={`Cart, ${itemCount} items`}
                >
                  <ShoppingBag className="h-4 w-4" />
                  <span className="h-5 min-w-5 px-1 rounded-md bg-white/25 text-xs font-bold flex items-center justify-center leading-none">
                    {itemCount}
                  </span>
                </Link>
              </div>
            </div>

            {mobileSearchOpen && (
              <div className="pb-3">{searchField('search-mobile', 'Search products…', true)}</div>
            )}
          </div>
        </div>

        {/* Mobile slide-down menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-neutral-200 bg-white px-4 py-4 space-y-1 shadow-pop">
            <nav className="flex flex-col" aria-label="Mobile">
              {navLinks.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-neutral-700 hover:bg-neutral-100'
                    }`
                  }
                >
                  {item.name}
                </NavLink>
              ))}
            </nav>
            <div className="pt-3 mt-2 border-t border-neutral-100 grid grid-cols-2 gap-2 text-sm">
              <Link
                to="/sell"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-promo-50 text-promo-800 font-semibold"
              >
                <Store className="h-4 w-4" />
                <span>Become a Seller</span>
              </Link>
              <Link
                to="/wishlist"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-neutral-100 text-neutral-700 font-medium"
              >
                <Heart className="h-4 w-4" />
                <span>Wishlist ({wishlistCount})</span>
              </Link>
              <Link
                to="/track-order"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-neutral-100 text-neutral-700 font-medium"
              >
                <Truck className="h-4 w-4" />
                <span>Track Order</span>
              </Link>
              <Link
                to="/orders"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-neutral-100 text-neutral-700 font-medium"
              >
                <Package className="h-4 w-4" />
                <span>My Orders</span>
              </Link>
              <Link
                to="/market"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-neutral-100 text-neutral-700 font-medium"
              >
                <Store className="h-4 w-4" />
                <span>Live Market</span>
              </Link>
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-neutral-100 text-primary-700 font-semibold"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Admin</span>
              </Link>
            </div>
          </div>
        )}
      </header>
    </>
  )
}
