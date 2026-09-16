import React, { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Plus,
  ShoppingBag,
  Users,
  TrendingUp,
  Wallet,
  Store,
  Star,
  Settings,
  Menu,
  X,
  LogOut,
  BadgeCheck,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { SiteLogo } from '@/components/brand/SiteLogo'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end: boolean
}

interface NavSection {
  title: string
  items: NavItem[]
}

// Logical grouping of the existing seller routes. Every entry maps to
// a real route in App.tsx — no placeholder or duplicate destinations.
const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Business',
    items: [
      { to: '/seller', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/seller/shop', label: 'My Shop', icon: Store, end: false },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { to: '/seller/products', label: 'Products', icon: Package, end: true },
      { to: '/seller/products/new', label: 'Add Product', icon: Plus, end: true },
    ],
  },
  {
    title: 'Sales',
    items: [
      { to: '/seller/orders', label: 'Orders', icon: ShoppingBag, end: false },
      { to: '/seller/customers', label: 'Customers', icon: Users, end: false },
      { to: '/seller/reviews', label: 'Reviews', icon: Star, end: false },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/seller/earnings', label: 'Earnings', icon: TrendingUp, end: false },
      { to: '/seller/withdrawals', label: 'Withdrawals', icon: Wallet, end: false },
    ],
  },
  {
    title: 'Account',
    items: [{ to: '/seller/settings', label: 'Settings', icon: Settings, end: false }],
  },
]

export const SellerLayout: React.FC = () => {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut(): Promise<void> {
    await signOut()
    navigate('/', { replace: true })
  }

  const displayName = profile?.name ?? user?.email ?? 'Seller'

  const navList = (
    <nav className="p-3 space-y-4" aria-label="Seller">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            {section.title}
          </p>
          <div className="space-y-1">
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 font-semibold'
                      : 'text-neutral-600 hover:bg-neutral-100 hover:text-navy-900'
                  }`
                }
              >
                <item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )

  return (
    <div className="bg-neutral-50/70 border-y border-neutral-200/70">
      <div className="container-shop py-6 sm:py-8">
        <div className="flex gap-6 items-start">
          {/* Desktop sidebar */}
          <aside className="hidden lg:flex flex-col w-64 shrink-0 card-premium overflow-hidden sticky top-28">
            <div className="p-5 border-b border-neutral-100">
              <SiteLogo height={34} />
              <div className="mt-3 flex items-center gap-2">
                <span className="h-9 w-9 rounded-full bg-primary-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                  {(displayName.charAt(0) || 'S').toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy-900 truncate">{displayName}</p>
                  <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Verified Seller
                  </p>
                </div>
              </div>
            </div>
            <div className="flex-1">{navList}</div>
            <div className="p-3 border-t border-neutral-100 space-y-1">
              <Link
                to="/"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-navy-900 transition-colors"
              >
                <Store className="h-4.5 w-4.5 shrink-0" />
                <span>View Storefront</span>
              </Link>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <LogOut className="h-4.5 w-4.5 shrink-0" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>

          {/* Main column */}
          <div className="flex-1 min-w-0">
            {/* Mobile top bar */}
            <div className="lg:hidden card-premium p-3 mb-4 flex items-center gap-2 sticky top-20 z-30">
              <button
                type="button"
                onClick={() => setMobileOpen((o) => !o)}
                className="p-2 rounded-xl text-navy-800 hover:bg-navy-50 transition-colors cursor-pointer"
                aria-label="Toggle seller navigation"
                aria-expanded={mobileOpen}
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <SiteLogo height={28} />
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                <BadgeCheck className="h-3.5 w-3.5" />
                Verified
              </span>
            </div>
            {mobileOpen && (
              <div className="lg:hidden card-premium mb-4 overflow-hidden">
                {navList}
                <div className="p-3 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <LogOut className="h-4.5 w-4.5 shrink-0" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}

            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}
