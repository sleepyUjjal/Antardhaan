import { cn } from '@/lib/cn'

const GAPS = {
  none: 'gap-0',
  sm: 'gap-2',
  base: 'gap-4',
  lg: 'gap-8',
  xl: 'gap-14',
}

export function Stack({ as: Tag = 'div', gap = 'base', className, ...props }) {
  return <Tag className={cn('flex flex-col', GAPS[gap] ?? GAPS.base, className)} {...props} />
}
