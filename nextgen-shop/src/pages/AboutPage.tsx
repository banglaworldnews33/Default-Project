import React from 'react'
import { Link } from 'react-router-dom'
import { Truck, ShieldCheck, Tag, Clock, Globe, Heart } from 'lucide-react'
import { STORE_CONFIG } from '@/data/storeConfig'

export const AboutPage: React.FC = () => {
  return (
    <div className="container-shop py-12 sm:py-16">
      <h1 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900 mb-8">
        About Nextgen Shop
      </h1>

      {/* Hero */}
      <div className="relative rounded-2xl bg-gradient-to-r from-neutral-900 to-neutral-950 text-white p-8 sm:p-12 overflow-hidden mb-12">
        <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-20 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent-400 via-transparent to-transparent" />
        <div className="relative max-w-xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-600 text-white text-xs font-bold uppercase tracking-wider mb-4">
            Our Story
          </span>
          <h2 className="text-3xl font-display font-bold mb-3">Style for Everyone</h2>
          <p className="text-sm text-neutral-300 leading-relaxed">
            Nextgen Shop was founded with a simple mission: to bring quality,
            affordable fashion and lifestyle products to every household in Bangladesh.
            From everyday essentials to festive collections, we curate every product
            with care.
          </p>
        </div>
      </div>

      {/* Mission & Vision */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        <div className="bg-white rounded-xl border border-neutral-200/80 p-6">
          <div className="h-12 w-12 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center mb-4">
            <Heart className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-neutral-900 text-lg mb-2">Our Mission</h3>
          <p className="text-sm text-neutral-600 leading-relaxed">
            To make quality fashion and lifestyle products accessible to every
            person in Bangladesh — without the premium markups. Every product
            in our catalogue is selected for quality, durability, and value.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200/80 p-6">
          <div className="h-12 w-12 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center mb-4">
            <Globe className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-neutral-900 text-lg mb-2">Our Vision</h3>
          <p className="text-sm text-neutral-600 leading-relaxed">
            To become Bangladesh&rsquo;s most trusted online shopping destination,
            known for reliability, fast delivery, and an exceptional customer
            experience — delivered to every district, every day.
          </p>
        </div>
      </div>

      {/* Why trust us */}
      <h2 className="text-2xl font-display font-bold text-neutral-900 mb-6">
        Why Customers Trust Us
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <div className="bg-white rounded-xl border border-neutral-200/80 p-6 text-center">
          <ShieldCheck className="h-8 w-8 text-accent-600 mx-auto mb-3" />
          <h4 className="font-semibold text-neutral-900">Quality Guaranteed</h4>
          <p className="text-xs text-neutral-500 mt-1">Every product is hand-inspected</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200/80 p-6 text-center">
          <Tag className="h-8 w-8 text-accent-600 mx-auto mb-3" />
          <h4 className="font-semibold text-neutral-900">Best Prices</h4>
          <p className="text-xs text-neutral-500 mt-1">Factory-direct pricing</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200/80 p-6 text-center">
          <Clock className="h-8 w-8 text-accent-600 mx-auto mb-3" />
          <h4 className="font-semibold text-neutral-900">Fast Delivery</h4>
          <p className="text-xs text-neutral-500 mt-1">24-48 hours in Dhaka</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200/80 p-6 text-center">
          <Truck className="h-8 w-8 text-accent-600 mx-auto mb-3" />
          <h4 className="font-semibold text-neutral-900">Cash on Delivery</h4>
          <p className="text-xs text-neutral-500 mt-1">Pay after checking</p>
        </div>
      </div>

      {/* Store info */}
      <div className="bg-white rounded-xl border border-neutral-200/80 p-6 mb-8">
        <h2 className="font-semibold text-neutral-900 text-lg mb-4">Store Information</h2>
        <div className="space-y-3 text-sm">
          <p className="flex items-start gap-2">
            <span className="font-medium text-neutral-500">Store Name:</span>
            <span className="font-semibold text-neutral-900">{STORE_CONFIG.name}</span>
          </p>
          <p className="flex items-start gap-2">
            <span className="font-medium text-neutral-500">Tagline:</span>
            <span className="text-neutral-900">{STORE_CONFIG.tagline}</span>
          </p>
          <p className="flex items-start gap-2">
            <span className="font-medium text-neutral-500">Address:</span>
            <span className="text-neutral-900">{STORE_CONFIG.address}</span>
          </p>
          <p className="flex items-start gap-2">
            <span className="font-medium text-neutral-500">Phone:</span>
            <a href={`tel:${STORE_CONFIG.phone}`} className="text-accent-700 hover:underline">
              {STORE_CONFIG.phone}
            </a>
          </p>
          <p className="flex items-start gap-2">
            <span className="font-medium text-neutral-500">Email:</span>
            <a href={`mailto:${STORE_CONFIG.email}`} className="text-accent-700 hover:underline">
              {STORE_CONFIG.email}
            </a>
          </p>
          <p className="flex items-start gap-2">
            <span className="font-medium text-neutral-500">Currency:</span>
            <span className="text-neutral-900">{STORE_CONFIG.currency.symbol} {STORE_CONFIG.currency.code}</span>
          </p>
          <p className="flex items-start gap-2">
            <span className="font-medium text-neutral-500">Delivery:</span>
            <span className="text-neutral-900">Inside Dhaka: ৳80 · Outside Dhaka: ৳130</span>
          </p>
        </div>
      </div>

      <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-accent-700">
        <Truck className="h-4 w-4" />
        <span>Back to Home</span>
      </Link>
    </div>
  )
}
