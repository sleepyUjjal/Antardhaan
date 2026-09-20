/** Pure glitch configuration and helpers. No DOM access — safe to import anywhere. */

export const MODES = ['good', 'bad']

export const TIMING = {
  minFlipMs: 4000,
  maxFlipMs: 10000,
  // A burst of quick flips at each transition, then it settles.
  microStutterMin: 2,
  microStutterMax: 4,
  microStutterStepMs: 45,
  tearMs: 200,
  signalLossMinMs: 30000,
  signalLossMaxMs: 60000,
  signalLossFlashMs: 120,
}

/**
 * Knobs the /dev/glitch panel can move at runtime. The provider holds these in
 * state and writes the CSS-side ones out as custom properties, so a tweak on
 * the venue projector needs no redeploy.
 */
export const TUNING_DEFAULTS = {
  minFlipMs: TIMING.minFlipMs,
  maxFlipMs: TIMING.maxFlipMs,
  tearMs: TIMING.tearMs,
  grainOpacity: 0.16,
  scanlineOpacity: 0.5,
}

/** Characters the scramble resolves through. Suit glyphs included on purpose. */
export const GLYPH_POOL = [
  '▚', '▞', '░', '▒', '▓', '█', '/', '\\', '|', '<', '>',
  '≠', '≡', '§', 'Ø', '∆', '¤', '×', '÷',
  '♠', '♣', '♦', '♥',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
]

export function otherMode(mode) {
  return mode === 'good' ? 'bad' : 'good'
}

/**
 * Route prefixes that render with the oscillator held — no flip loop, no signal
 * loss, and locked to bad mode.
 *
 * The admin is read at 1 a.m. on a phone at 30% battery by the person running
 * the event, and a page that inverts colour every few seconds underneath a
 * form you are trying to type into is a page that fights its only user. It is
 * also the one screen where a sudden inversion can hide a number you are
 * reading — a leaderboard that flips mid-glance is worse than one that does not.
 *
 * Held, not reduced: `prefers-reduced-motion` is still checked separately and
 * still wins, and this says nothing about how the *participant* side behaves.
 *
 * Bad mode rather than whatever mode you happened to arrive in, following the
 * two precedents already in the project: reduced motion locks to bad, and
 * opengraph-image.jsx renders permanently in bad because "a mode that flips
 * every few seconds has no single frame to freeze". A held oscillator is the
 * same situation, and ink is the frame that reads at 1 a.m.
 */
const STILL_PREFIXES = ['/admin']

/**
 * The exception, and it exists because the alternative is a page that lies.
 *
 * C12 puts the knobs that tune this effect at `/admin/glitch`. If that page were
 * held too, dragging a knob would change a number and nothing else — you would
 * be tuning an effect you cannot see, and the natural conclusion would be that
 * the publish path is broken. Reserved now rather than discovered then, the same
 * way RESERVED_SLUGS reserves words for routes that do not exist yet.
 */
const LIVE_PREFIXES = ['/admin/glitch']

function under(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/**
 * Whether a route is held. Takes the pathname rather than reading it, so this
 * stays a pure function in a file with no DOM access.
 */
export function isStillRoute(pathname) {
  if (typeof pathname !== 'string') return false
  if (LIVE_PREFIXES.some((prefix) => under(pathname, prefix))) return false
  return STILL_PREFIXES.some((prefix) => under(pathname, prefix))
}

// `random` is injectable so these stay testable without stubbing Math.random.
export function randomBetween(min, max, random = Math.random) {
  return min + random() * (max - min)
}

export function randomInt(min, max, random = Math.random) {
  return Math.floor(randomBetween(min, max + 1, random))
}

export function nextFlipDelay(tuning, random = Math.random) {
  return randomBetween(tuning.minFlipMs, tuning.maxFlipMs, random)
}

export function nextSignalLossDelay(random = Math.random) {
  return randomBetween(TIMING.signalLossMinMs, TIMING.signalLossMaxMs, random)
}
