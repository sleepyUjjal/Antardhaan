import { GlitchKnobs } from '@/components/admin/GlitchKnobs'
import { Rule } from '@/components/ui/Rule'
import { getGlitchTuning } from '@/lib/event'
import { freezeGlitch, publishTuning, releaseGlitch, resetTuning } from './actions'

/**
 * The controller. C3's /dev/glitch panel, promoted into the admin and made to
 * persist — the knobs are the same objects, but they no longer live and die in
 * React state, and the page is no longer a public route with no auth.
 *
 * A server component wrapping one client component, the same shape as the chamber
 * page and the login page: `getGlitchTuning` reads the row here, and the actions
 * are imported here and passed down, so the client component never needs to know
 * where either lives.
 *
 * `saved` is handed over as the raw partial — not merged with the defaults — so
 * the panel can tell "nobody has overridden this" from "someone set it to what the
 * default happens to be". That distinction is invisible on screen and decides
 * whether Reset writes `{}`.
 *
 * The route is deliberately *not* held by the oscillator; `isStillRoute` carves it
 * out of the admin hold in lib/glitch.js, because a tuning page you cannot see the
 * effect on is a page that lies about whether publishing works.
 */
export const metadata = { title: 'Glitch' }

export default async function GlitchPage() {
  const saved = await getGlitchTuning()

  return (
    <>
      <h1 className="font-display text-2xl uppercase leading-none tracking-tight">Glitch</h1>

      <div className="mt-4">
        <Rule tone="accent" />
      </div>

      <p className="mt-6 max-w-prose text-muted">
        Changes here are live on this device the moment you make them. Press publish to send them to
        every screen in the room.
      </p>

      <div className="mt-8">
        <GlitchKnobs
          saved={saved}
          publish={publishTuning}
          reset={resetTuning}
          freeze={freezeGlitch}
          release={releaseGlitch}
        />
      </div>
    </>
  )
}
