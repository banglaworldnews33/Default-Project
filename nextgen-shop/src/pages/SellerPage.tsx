import React from 'react'
import { Link } from 'react-router-dom'
import {
  Store,
  BadgeCheck,
  Banknote,
  Headphones,
  ClipboardCheck,
  Rocket,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

const STEPS = [
  {
    icon: ClipboardCheck,
    title: '1. Apply Online',
    text: 'Tell us about your business. Our team reviews every application for quality and authenticity.',
  },
  {
    icon: ShieldCheck,
    title: '2. Get Verified',
    text: 'Approved sellers receive a verified badge that builds instant trust with shoppers.',
  },
  {
    icon: Rocket,
    title: '3. Start Selling',
    text: 'List your products and reach customers across all 64 districts of Bangladesh.',
  },
]

const PERKS = [
  {
    icon: BadgeCheck,
    title: 'Verified Seller Badge',
    text: 'Stand out with a trust badge shown on your shop and products.',
  },
  {
    icon: Banknote,
    title: 'Fast, Fair Payouts',
    text: 'Transparent terms with reliable payout schedules you can plan around.',
  },
  {
    icon: TrendingUp,
    title: 'Nationwide Reach',
    text: 'From Dhaka to the most remote upazilas — our delivery network covers it.',
  },
  {
    icon: Headphones,
    title: 'Dedicated Support',
    text: 'A seller success team on phone and WhatsApp, 7 days a week.',
  },
]

export const SellerPage: React.FC = () => {
  return (
    <div>
      {/* Hero */}
      <section className="relative bg-navy-950 text-white overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-24 right-1/4 w-[440px] h-[440px] rounded-full bg-primary-600/25 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-promo-600/15 blur-3xl" />
        </div>
        <div className="container-shop relative py-14 sm:py-20 text-center max-w-2xl mx-auto space-y-5">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-primary-200 text-xs font-semibold tracking-wider uppercase">
            <Store className="h-3.5 w-3.5 text-promo-400" />
            Sell on NextGen Shop
          </span>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
            Grow Your Business With Bangladesh&apos;s Premium Marketplace
          </h1>
          <p className="text-sm sm:text-base text-navy-200 leading-relaxed">
            Join a curated marketplace where quality sellers meet ready buyers.
            Online applications are opening soon — talk to our team today to reserve your spot.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-1">
            <Button to="/seller/register" variant="secondary" size="lg">
              <span>Apply to Sell</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              to="/shop"
              variant="outline"
              size="lg"
              className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:border-white/50"
            >
              Browse the Marketplace
            </Button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-14 sm:py-20">
        <div className="container-shop">
          <div className="text-center max-w-xl mx-auto mb-10 sm:mb-12">
            <span className="eyebrow">Simple Process</span>
            <h2 className="text-3xl font-display font-bold text-navy-900 mt-1.5">
              How It Works
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <div key={s.title} className="card-premium p-6 sm:p-8 text-center hover:shadow-card-hover transition-shadow">
                <div className="h-12 w-12 rounded-2xl bg-primary-600 text-white flex items-center justify-center mx-auto mb-4">
                  <s.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-navy-900 text-lg">{s.title}</h3>
                <p className="text-sm text-neutral-600 mt-2 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Perks */}
      <section className="py-14 sm:py-20 bg-neutral-50 border-y border-neutral-200/70">
        <div className="container-shop">
          <div className="text-center max-w-xl mx-auto mb-10 sm:mb-12">
            <span className="eyebrow">Why Sell With Us</span>
            <h2 className="text-3xl font-display font-bold text-navy-900 mt-1.5">
              Seller Benefits
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PERKS.map((p) => (
              <div key={p.title} className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-card">
                <div className="h-11 w-11 rounded-xl bg-promo-50 text-promo-700 border border-promo-100 flex items-center justify-center mb-4">
                  <p.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-navy-900">{p.title}</h3>
                <p className="text-xs text-neutral-500 mt-2 leading-relaxed">{p.text}</p>
              </div>
            ))}
          </div>
          <p className="text-center mt-10">
            <Link to="/contact" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800">
              Questions? Talk to our seller team
              <ArrowRight className="h-4 w-4" />
            </Link>
          </p>
        </div>
      </section>
    </div>
  )
}
