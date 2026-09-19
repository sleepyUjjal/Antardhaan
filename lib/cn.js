/**
 * Joins class names, dropping anything falsy. Deliberately tiny — no clsx, no
 * tailwind-merge. If two classes ever conflict, fix the call site.
 */
export function cn(...parts) {
  return parts.flat(Infinity).filter(Boolean).join(' ')
}
