import React from 'react'
import { Link } from 'react-router-dom'
import {
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  RefreshCw,
  HeartHandshake,
  Store,
} from 'lucide-react'
import { STORE_CONFIG } from '@/data/storeConfig'
import { SiteLogo } from '@/components/brand/SiteLogo'

export const Footer: React.FC = () => {
  return (
    <footer className="bg-navy-950 text-navy-200">
      {/* Top trust badges */}
      <div className="border-b border-white/10">
        <div className="container-shop py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center sm:text-left">
            {[
              { icon: ShieldCheck, title: '100% Quality Assured', sub: 'Handpicked premium fabrics and materials' },
              { icon: RefreshCw, title: 'Easy Exchanges', sub: '7-day hassle-free replacement policy' },
              { icon: HeartHandshake, title: 'Cash on Delivery', sub: 'Check before you pay across Bangladesh' },
            ].map((b) => (
              <div key={b.title} className="flex items-center gap-4 justify-center sm:justify-start">
                <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center text-primary-300 shrink-0">
                  <b.icon className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-semibold text-white text-sm">{b.title}</h4>
                  <p className="text-xs text-navy-300 mt-0.5">{b.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main footer navigation */}
      <div className="container-shop py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
          {/* Brand */}
          <div className="col-span-2 space-y-4">
            <div className="bg-white rounded-2xl px-4 py-3 inline-flex">
              <SiteLogo height={36} />
            </div>
            <p className="text-sm text-navy-300 leading-relaxed max-w-sm">
              Discover quality fashion, baby & moms products at fair prices. A premium,
              modern shopping experience delivered to your doorstep in Bangladesh.
            </p>
            <div className="space-y-2 text-xs text-navy-300 pt-1">
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary-300 shrink-0" />
                <span>{STORE_CONFIG.address}</span>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary-300 shrink-0" />
                <a href={`tel:${STORE_CONFIG.phone}`} className="hover:text-white transition-colors">
                  {STORE_CONFIG.phone}
                </a>
              </p>
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary-300 shrink-0" />
                <a href={`mailto:${STORE_CONFIG.email}`} className="hover:text-white transition-colors">
                  {STORE_CONFIG.email}
                </a>
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              {['Facebook', 'Instagram', 'YouTube'].map((label) => (
                <a
                  key={label}
                  href="#"
                  aria-label={`NextGen Shop on ${label}`}
                  className="px-3 h-9 rounded-xl bg-white/10 hover:bg-primary-600 flex items-center text-xs font-semibold text-navy-100 hover:text-white transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white mb-4">
              Categories
            </h4>
            <ul className="space-y-2.5 text-sm text-navy-300">
              {[
                { to: '/category/men', label: "Men's Fashion" },
                { to: '/category/women', label: "Women's Collection" },
                { to: '/category/baby-moms', label: 'Baby & Moms' },
                { to: '/category/clothes', label: 'Everyday Clothes' },
                { to: '/shop', label: 'All Products' },
              ].map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Customer service */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white mb-4">
              Customer Service
            </h4>
            <ul className="space-y-2.5 text-sm text-navy-300">
              {[
                { to: '/track-order', label: 'Track Order' },
                { to: '/about', label: 'About Us' },
                { to: '/contact', label: 'Contact Us' },
                { to: '/login', label: 'My Account / Login' },
                { to: '/wishlist', label: 'My Wishlist' },
              ].map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Sell */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white mb-4">
              Sell With Us
            </h4>
            <ul className="space-y-2.5 text-sm text-navy-300">
              <li>
                <Link to="/sell" className="inline-flex items-center gap-1.5 font-semibold text-promo-300 hover:text-promo-200 transition-colors">
                  <Store className="h-4 w-4" />
                  Become a Seller
                </Link>
              </li>
              <li>
                <Link to="/sell" className="hover:text-white transition-colors">
                  Seller Benefits
                </Link>
              </li>
              <li>
                <Link to="/sell" className="hover:text-white transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link to="/admin" className="hover:text-white transition-colors">
                  Admin Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Payments */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white mb-4">
              We Accept
            </h4>
            <p className="text-xs text-navy-300 leading-relaxed mb-4">
              Cash on Delivery everywhere in Bangladesh. Mobile banking (bKash, Nagad) integration
              ready.
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-promo-600 text-white font-semibold">
                Cash on Delivery
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white/10 text-navy-200 border border-white/10">
                bKash
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white/10 text-navy-200 border border-white/10">
                Nagad
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-white/10">
        <div className="container-shop flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left text-xs text-navy-400 py-6">
          <p>© {new Date().getFullYear()} NextGen Shop. All rights reserved.</p>
          <p>Premium marketplace for Bangladesh · ৳ BDT</p>
        </div>
      </div>
    </footer>
  )
}
