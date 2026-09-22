import { EventMeta } from '@/components/landing/EventMeta'
import { Footer } from '@/components/landing/Footer'
import { Hero } from '@/components/landing/Hero'
import { HeroGround } from '@/components/landing/HeroGround'

/**
 * The front door: sets the theme and tells you nothing useful.
 *
 * No links, no chamber slugs, no mention that five chambers exist (§4). Hero is
 * flex-1 and absorbs the slack, which is what puts the lockup high and leaves
 * the meta and footer sitting on the bottom edge.
 *
 * The ground is a CHILD of Hero rather than something Hero imports, and that is
 * the whole reason it is a separate component. Hero is `'use client'`; anything
 * a client module imports joins the client bundle, so a HeroGround imported
 * from Hero would ship every decorative layer to the phone in JavaScript — the
 * exact cost splitting it out was meant to avoid. Passed in from here it is
 * rendered on the server and arrives as an already-painted slot, and the client
 * bundle keeps the wordmark and nothing else.
 */
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col">
      <Hero>
        <HeroGround />
      </Hero>
      <EventMeta className="relative z-[1] shrink-0" />
      <Footer className="shrink-0" />
    </main>
  )
}
