import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Compact star rating display (read-only).
 * Shows the average as filled stars + the numeric value and review count.
 */
export function RatingStars({
  avg,
  count,
  size = 'sm',
  showCount = true,
  className,
}: {
  avg: number
  count?: number
  size?: 'sm' | 'md' | 'lg'
  showCount?: boolean
  className?: string
}) {
  const px = size === 'lg' ? 'h-5 w-5' : size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'
  const text = size === 'lg' ? 'text-base' : 'text-sm'

  if (!count || count === 0) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-muted-foreground', text, className)}>
        <Star className={cn(px, 'text-muted-foreground/40')} />
        <span>Sem avaliações</span>
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-1', text, className)}>
      <span className="inline-flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={cn(
              px,
              avg >= n - 0.25
                ? 'fill-amber-400 text-amber-400'
                : avg >= n - 0.75
                  ? 'fill-amber-400/50 text-amber-400'
                  : 'text-muted-foreground/30',
            )}
          />
        ))}
      </span>
      <span className="font-medium">{avg.toFixed(1).replace('.', ',')}</span>
      {showCount && <span className="text-muted-foreground">({count})</span>}
    </span>
  )
}

export default RatingStars
