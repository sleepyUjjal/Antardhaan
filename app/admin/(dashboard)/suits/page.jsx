import { SuitCard } from '@/components/admin/SuitCard'
import { Rule } from '@/components/ui/Rule'
import { env } from '@/lib/env'
import { getSuitConfig } from '@/lib/suit-admin'
import { SUIT_LIST } from '@/lib/suits'
import { saveSlug, saveCode, setActive, suggestSlug, suggestCode } from './actions'

/**
 * The five chambers, and the four things you can do to each.
 *
 * This is the page you open while the event is running, which is why everything
 * on it is one tap from a phone: a team asks for a code, a URL leaks, a chamber
 * needs to move. It is also the one page in the project that shows a code — §7
 * keeps the column out of every participant surface by never selecting it, and
 * this file is the deliberate exception. See lib/suit-admin.js for why the read
 * lives in its own module rather than beside the participant one.
 *
 * ORDER COMES FROM `SUIT_LIST`, not from the query. The table has no order column
 * and should not gain one: the display order is presentation, it already exists
 * in lib/suits.js next to the labels and glyphs, and a second copy of it in the
 * database is a second copy to keep in sync. `getSuitConfig` guarantees all five
 * rows, so the lookup below cannot miss.
 *
 * `NEXT_PUBLIC_SITE_URL` is read here rather than in the card, because lib/env.js
 * is a server module — it also reads DATABASE_URL and the session secret, and
 * importing it from a client component would put those getters in the browser
 * bundle. The card takes the resolved string as a prop.
 */
export const metadata = { title: 'Suits' }

export default async function SuitsPage() {
  const rows = await getSuitConfig()
  const bySuit = new Map(rows.map((row) => [row.suit, row]))
  const siteUrl = env.NEXT_PUBLIC_SITE_URL

  return (
    <>
      <h1 className="font-display text-2xl uppercase leading-none tracking-tight">Suits</h1>

      <div className="mt-4">
        <Rule tone="accent" />
      </div>

      <p className="mt-6 max-w-prose text-muted">
        One card per chamber. The URL and the code on each are what a team needs — copy either
        straight onto a message. Changes take effect on the next request, not on the next deploy.
      </p>

      <div className="mt-8 flex flex-col gap-5">
        {SUIT_LIST.map(({ key, label, glyph }) => {
          const row = bySuit.get(key)

          return (
            <SuitCard
              key={key}
              suit={key}
              label={label}
              glyph={glyph}
              slug={row.slug}
              code={row.code}
              isActive={row.isActive}
              siteUrl={siteUrl}
              suggestCode={suggestCode}
              suggest={suggestSlug}
              save={saveSlug}
              saveCode={saveCode}
              setActive={setActive}
            />
          )
        })}
      </div>
    </>
  )
}
