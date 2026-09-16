import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Phone, Mail, Send, Check } from 'lucide-react'
import { STORE_CONFIG } from '@/data/storeConfig'
import { Button } from '@/components/ui/Button'

export const ContactPage: React.FC = () => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Name is required'
    if (!email.trim() || !email.includes('@')) next.email = 'Valid email is required'
    if (!subject.trim()) next.subject = 'Subject is required'
    if (!message.trim() || message.trim().length < 10) next.message = 'Message must be at least 10 characters'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitted(true)
    setTimeout(() => {
      setName('')
      setEmail('')
      setSubject('')
      setMessage('')
      setSubmitted(false)
    }, 5000)
  }

  if (submitted) {
    return (
      <div className="container-shop py-16 sm:py-24 text-center">
        <div className="h-20 w-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <Check className="h-10 w-10" />
        </div>
        <h1 className="text-3xl font-display font-bold text-neutral-900">
          Message Sent!
        </h1>
        <p className="mt-3 text-neutral-500 max-w-md mx-auto">
          Thank you for contacting us. We&rsquo;ll get back to you within 24 hours.
        </p>
        <Link to="/contact" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-accent-700">
          <Phone className="h-4 w-4" />
          <span>Send Another Message</span>
        </Link>
      </div>
    )
  }

  return (
    <div className="container-shop py-12 sm:py-16">
      <h1 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900 mb-8">
        Contact Us
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Contact info */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-neutral-200/80 p-6 space-y-4">
            <h2 className="font-semibold text-neutral-900 text-lg">Get in Touch</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent-100 text-accent-700 flex items-center justify-center shrink-0">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">Address</p>
                  <p className="text-sm text-neutral-600">{STORE_CONFIG.address}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent-100 text-accent-700 flex items-center justify-center shrink-0">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">Phone</p>
                  <a href={`tel:${STORE_CONFIG.phone}`} className="text-sm text-accent-700 hover:underline">
                    {STORE_CONFIG.phone}
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent-100 text-accent-700 flex items-center justify-center shrink-0">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">Email</p>
                  <a href={`mailto:${STORE_CONFIG.email}`} className="text-sm text-accent-700 hover:underline">
                    {STORE_CONFIG.email}
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200/80 p-6">
            <h3 className="font-semibold text-neutral-900 mb-3">Quick Links</h3>
            <div className="space-y-2 text-sm">
              <Link to="/" className="block text-accent-700 hover:underline">Home</Link>
              <Link to="/shop" className="block text-accent-700 hover:underline">Shop</Link>
              <Link to="/track-order" className="block text-accent-700 hover:underline">Track Order</Link>
              <Link to="/admin" className="block text-accent-700 hover:underline">Admin Dashboard</Link>
            </div>
          </div>
        </div>

        {/* Contact form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-neutral-200/80 p-6 space-y-4">
          <h2 className="font-semibold text-neutral-900 text-lg">Send us a Message</h2>

          <div>
            <label htmlFor="contact-name" className="block text-sm font-medium text-neutral-700 mb-1">
              Name <span className="text-rose-600">*</span>
            </label>
            <input
              id="contact-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white transition-colors ${errors.name ? 'border-rose-500' : 'border-neutral-300'}`}
              placeholder="Your name"
            />
            {errors.name && <p className="text-xs text-rose-600 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="contact-email" className="block text-sm font-medium text-neutral-700 mb-1">
              Email <span className="text-rose-600">*</span>
            </label>
            <input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white transition-colors ${errors.email ? 'border-rose-500' : 'border-neutral-300'}`}
              placeholder="you@example.com"
            />
            {errors.email && <p className="text-xs text-rose-600 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="contact-subject" className="block text-sm font-medium text-neutral-700 mb-1">
              Subject <span className="text-rose-600">*</span>
            </label>
            <input
              id="contact-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white transition-colors ${errors.subject ? 'border-rose-500' : 'border-neutral-300'}`}
              placeholder="e.g. Order inquiry"
            />
            {errors.subject && <p className="text-xs text-rose-600 mt-1">{errors.subject}</p>}
          </div>

          <div>
            <label htmlFor="contact-message" className="block text-sm font-medium text-neutral-700 mb-1">
              Message <span className="text-rose-600">*</span>
            </label>
            <textarea
              id="contact-message"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent-600 bg-white transition-colors resize-y ${errors.message ? 'border-rose-500' : 'border-neutral-300'}`}
              placeholder="Your message..."
            />
            {errors.message && <p className="text-xs text-rose-600 mt-1">{errors.message}</p>}
          </div>

          <Button type="submit" variant="secondary" size="lg" className="w-full">
            <Send className="h-5 w-5" />
            <span>Send Message</span>
          </Button>
        </form>
      </div>
    </div>
  )
}
