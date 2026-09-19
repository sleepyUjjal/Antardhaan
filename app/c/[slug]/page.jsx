import { getChamberData } from '@/lib/chambers'
import { SUITS } from '@/lib/suits'
import { SubmitProbe } from './SubmitProbe'

/**
 * The chamber page — C7's minimal version.
 *
 * It exists to make C7's manual checks possible: a valid code, a wrong code, a
 * duplicate submission, a retired chamber, a closed event. C8 replaces this file
 * wholesale with the real chamber — sigil hero, bottom-anchored submit, the four
 * result treatments. What survives is `getChamberData` and the hidden slug field.
 */

// Never prerendered, and never to be given a `generateStaticParams`. A statically
// rendered chamber would mean every slug baked into the build output, which is
// the §7 failure in its purest form — C9 greps .next/ for exactly that.
export const dynamic = 'force-dynamic'

export default async function ChamberPage({ params }) {
  const { slug } = await params
  const { chamber, event } = await getChamberData(slug)

  const suit = SUITS[chamber.suit]

  return (
    <main className="flex min-h-dvh flex-col justify-center gap-6 px-6 py-10">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">{suit.label}</p>

      {/* The glyph is decorative and the label is the heading. A screen reader
          announcing "black spade suit" as a page title would be worse than the
          word. */}
      <h1 className="font-display text-display" aria-label={suit.label}>
        <span aria-hidden="true">{suit.glyph}</span>
      </h1>

      <SubmitProbe slug={slug} closed={!event.submissionsOpen} />
    </main>
  )
}
