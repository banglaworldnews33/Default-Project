import React, { useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * Official NextGen Shop brand mark (final artwork supplied by owner).
 *
 * Uses the EXACT uploaded logo file at /images/logo.png — save the
 * provided artwork there (public/images/logo.png) and it is picked up
 * with zero code changes. Rendered as-is: fixed height, auto width
 * (original aspect ratio preserved), no recolor, no crop, no overlay.
 * Nothing is removed — cart mark, NEXTGEN, SHOP and tagline all render.
 *
 * Until the official file is supplied, a neutral text wordmark is
 * shown as a temporary placeholder. It is NOT the logo.
 */
export const LOGO_SRC = '/images/logo.png'

interface SiteLogoProps {
  /** Rendered height of the logo image (width scales automatically). */
  height?: number
  /** Compact icon-only mode for small mobile headers. */
  compact?: boolean
  className?: string
}

export const SiteLogo: React.FC<SiteLogoProps> = ({ height = 40, compact = false, className = '' }) => {
  const [missing, setMissing] = useState(false)

  return (
    <Link
      to="/"
      aria-label="NextGen Shop — home"
      className={`flex items-center gap-2.5 select-none shrink-0 ${className}`}
    >
      {!missing ? (
        <img
          src={LOGO_SRC}
          alt="NextGen Shop"
          height={height}
          style={{ height, width: 'auto', maxWidth: compact ? 44 : 190 }}
          className="object-contain"
          onError={() => setMissing(true)}
        />
      ) : (
        <span className="flex items-center gap-2" title="Official logo file pending: public/images/logo.svg">
          <span
            aria-hidden
            className="flex items-center justify-center rounded-lg bg-primary-600 text-white font-display font-bold"
            style={{ height, width: height, fontSize: height * 0.52 }}
          >
            N
          </span>
          {!compact && (
            <span className="flex flex-col leading-none">
              <span className="font-display font-bold tracking-tight text-navy-900" style={{ fontSize: height * 0.5 }}>
                NEXTGEN <span className="font-normal text-primary-700">SHOP</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-sans">
                Bangladesh
              </span>
            </span>
          )}
        </span>
      )}
    </Link>
  )
}
