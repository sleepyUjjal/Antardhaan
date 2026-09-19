import { SubmitForm } from '@/components/chamber/SubmitForm'
import { SuitSigil } from '@/components/chamber/SuitSigil'
import { getChamberData } from '@/lib/chambers'
import { SUITS } from '@/lib/suits'
import { submitEntry } from './actions'

/**
 * The chamber — the one screen that matters.
 *
 * It lives at the root (`/k3m9xq2p7w`), not under a prefix, so this is the
 * catch-all route for every URL on the domain that no other route claims. Two
 * things follow from that and both are handled outside this file: the slug's
 * shape is checked before the query in lib/chambers.js, and the words that are
 * already routes (`admin`, `standings`) are reserved there too.
 *
 * Never prerendered, and never to be given a `generateStaticParams`. A statically
 * rendered chamber would bake every slug into the build output, which is the §7
 * failure in its purest form — C9 greps `.next/` for exactly that.
 */
export const dynamic = 'force-dynamic'

export default async function ChamberPage({ params }) {
  // `params` is a Promise in Next 15+.
  const { slug } = await params
  const { chamber, event } = await getChamberData(slug)

  // The suit key is an enum value, so this lookup cannot miss. If it ever does,
  // the schema and lib/suits.js have drifted and a render-time throw is the
  // right answer — a chamber page with no name is not a page.
  const suit = SUITS[chamber.suit]

  return (
    // No `glitch-content` wrapper: app/layout.jsx already wraps every page in
    // one, and nesting a second would apply the tear transform twice.
    <main className="flex min-h-dvh flex-col">
      {/* flex-1 on the hero is what keeps the form on the bottom edge at every
          viewport height, including a short landscape phone. */}
      <header className="flex flex-1 flex-col items-center justify-center gap-6 px-5 pt-14 pb-10">
        <SuitSigil suit={chamber.suit} className="h-32 w-32 text-fg sm:h-44 sm:w-44" />
        <h1 className="font-display text-3xl uppercase leading-none tracking-tight">
          {suit.label}
        </h1>
      </header>

      {/* `action` is passed down rather than imported inside SubmitForm: the
          client component would otherwise need the bracketed `@/app/[slug]/
          actions` path, and threading it here keeps that module's only import
          site the page that owns it. */}
      <SubmitForm action={submitEntry} slug={slug} closed={!event.submissionsOpen} />
    </main>
  )
}
