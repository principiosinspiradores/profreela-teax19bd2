import React from 'react'
import { cn } from '@/lib/utils'

interface BrandLogoProps {
  className?: string
  iconOnly?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'default' | 'dark' | 'light'
}

export function BrandLogo({
  className,
  iconOnly = false,
  size = 'md',
  variant = 'default',
}: BrandLogoProps) {
  const sizeClasses = {
    sm: { box: 'w-7 h-7', text: 'text-base', gap: 'gap-2' },
    md: { box: 'w-9 h-9', text: 'text-xl', gap: 'gap-2.5' },
    lg: { box: 'w-12 h-12', text: 'text-2xl', gap: 'gap-3' },
    xl: { box: 'w-16 h-16', text: 'text-3xl', gap: 'gap-3.5' },
  }[size]

  // Pro text color depending on variant
  const proTextColor =
    variant === 'light'
      ? 'text-white'
      : variant === 'dark'
        ? 'text-[#0D4F5C]'
        : 'text-[#0D4F5C] dark:text-white'

  return (
    <div
      className={cn(
        'inline-flex items-center font-bold tracking-tight select-none',
        sizeClasses.gap,
        className,
      )}
    >
      {/* Badge Icon */}
      <div
        className={cn(
          'relative rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform hover:scale-105',
          sizeClasses.box,
          'bg-[#0D4F5C] text-white p-1',
        )}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer circle ring */}
          <circle cx="50" cy="50" r="42" stroke="white" strokeWidth="5" />

          {/* Pin Left (White) */}
          <path d="M50 20 C33 20 20 33 20 50 C20 69 50 90 50 90 Z" fill="white" />

          {/* Pin Right (Gold #D4A017) */}
          <path d="M50 20 C67 20 80 33 80 50 C80 69 50 90 50 90 Z" fill="#D4A017" />

          {/* Checkmark inside pin */}
          <path
            d="M34 49 L46 61 L68 37"
            stroke="white"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Typography: Pro in Petrol Blue (#0D4F5C), Freela in Gold (#D4A017) */}
      {!iconOnly && (
        <span className={cn('font-bold leading-none', sizeClasses.text)}>
          <span className={proTextColor}>Pro</span>
          <span className="text-[#D4A017]">Freela</span>
        </span>
      )}
    </div>
  )
}
