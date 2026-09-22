import mark from '@/app/image.webp'
import { cn } from '@/lib/cn'

/**
 * The event mark. Placement is chosen by the caller: top-centre of the hero on
 * phone and tablet, right-aligned beside the tagline on desktop.
 *
 * Same import-from-app/ pattern as HeroFigure: hashed, cache-busted, and
 * width/height from the file for layout stability before the bytes land.
 */
export function HeroMark({ className }) {
  return (
    <img
      src={mark.src}
      width={mark.width}
      height={mark.height}
      alt=""
      draggable={false}
      className={cn('hero-mark', className)}
    />
  )
}
