import { cn } from '@/lib/cn'

/**
 * Page gutter and max width. Side padding is never removed at any width, so
 * content can't touch the edge on a phone.
 */
export function Container({ as: Tag = 'div', className, ...props }) {
  return <Tag className={cn('mx-auto w-full max-w-[68rem] px-5 sm:px-8', className)} {...props} />
}
