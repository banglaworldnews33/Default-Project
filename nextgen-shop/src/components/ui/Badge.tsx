import React from 'react'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'accent' | 'promo' | 'danger' | 'success' | 'muted'
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  className = '',
  ...props
}) => {
  const styles: Record<string, string> = {
    default: 'bg-navy-900 text-white',
    accent: 'bg-primary-600 text-white',
    promo: 'bg-promo-600 text-white',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    muted: 'bg-neutral-100 text-neutral-600',
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-md ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
