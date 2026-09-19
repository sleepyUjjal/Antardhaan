import { cn } from '@/lib/cn'

const VARIANTS = {
  primary: 'bg-accent text-paper active:bg-accent-hot',
  ghost: 'border border-rule text-fg active:border-accent active:text-accent',
}

/**
 * Square, full-width, and at least 52px tall: built for a thumb, not a cursor.
 * Press states are `:active` rather than `:hover` — on a phone, hover either
 * never fires or fires on tap and sticks.
 */
export function Button({ variant = 'primary', type = 'button', className, ...props }) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-[52px] w-full touch-manipulation items-center justify-center gap-2',
        'font-mono text-sm tracking-[0.15em] uppercase',
        'select-none transition-colors duration-150 active:translate-y-px',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant] ?? VARIANTS.primary,
        className,
      )}
      {...props}
    />
  )
}
