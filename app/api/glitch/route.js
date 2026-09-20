import { NextResponse } from 'next/server'
import { getGlitchTuning } from '@/lib/event'

/**
 * The published glitch override, for every device on the site.
 *
 * THE ONE PUBLIC ENDPOINT, and it is public on purpose: the tuning is applied to
 * every visitor's screen, so it is not a secret and hiding it behind the session
 * cookie would defeat the point. What it must never carry is anything that *is*
 * secret — a suit code, a chamber slug, any config row — and it does not, because
 * it reads one jsonb column that only ever holds numbers and a hold value.
 *
 * `max-age` as well as `s-maxage`. `s-maxage` alone would have Vercel's edge
 * absorb the fan-out — five hundred phones asking for the same blob and one query
 * reaching Neon — but every one of those phones would still make a request. With
 * `max-age` too, a repeat navigation is served from the browser's own cache and
 * costs nothing at all, not even to the edge. The 60 seconds is the whole
 * contract: publishing moves the room within a minute, and the plan's done-when
 * says exactly that.
 *
 * Never prerendered. A statically rendered route handler would bake the tuning
 * into the build, so publishing would change a row and nothing else.
 */
export const dynamic = 'force-dynamic'

const CACHE = 'public, max-age=60, s-maxage=60, stale-while-revalidate=300'

export async function GET() {
  try {
    const tuning = await getGlitchTuning()

    // The partial, not a merged object. A device that receives `{}` paints with
    // its own TUNING_DEFAULTS, which is what makes a knob added in a later commit
    // work with no backfill — and what makes Reset mean "the build", not "a copy
    // of the build as it was in September".
    return NextResponse.json(tuning, { headers: { 'Cache-Control': CACHE } })
  } catch (error) {
    // Unreachable in normal operation, and the response is the important part:
    // an empty object is the build defaults, which is exactly right when the
    // tuning cannot be read — the site keeps working and looks like it did before
    // anyone published anything.
    //
    // `no-store` on this path, so a transient failure is not cached for a minute
    // in front of a room. A publish that appears not to have worked is worth one
    // extra query to avoid. Logged because this is the only place the failure is
    // visible at all: the client's fetch cannot tell an empty tuning from a
    // working one.
    console.error('GET /api/glitch could not read the tuning', error)
    return NextResponse.json({}, { headers: { 'Cache-Control': 'no-store' } })
  }
}
