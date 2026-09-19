import { EventMeta } from '@/components/landing/EventMeta'
import { Footer } from '@/components/landing/Footer'
import { Hero } from '@/components/landing/Hero'

/**
 * The front door: sets the theme and tells you nothing useful.
 *
 * No links, no chamber slugs, no mention that five chambers exist (§4). Hero is
 * flex-1 and absorbs the slack, which is what puts the lockup high and leaves
 * the meta and footer sitting on the bottom edge.
 */
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col">
      <Hero />
      <EventMeta />
      <Footer />
    </main>
  )
}
