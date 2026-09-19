import { cn } from '@/lib/cn'

const TONES = {
  rule: 'bg-rule',
  accent: 'bg-accent',
  deep: 'bg-accent-deep',
}

/** The hairline that does most of the composition work. One pixel, full bleed. */
export function Rule({ tone = 'rule', className, ...props }) {
  return <hr className={cn('h-px w-full border-0', TONES[tone] ?? TONES.rule, className)} {...props} />
}
