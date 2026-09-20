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
  // The gap between the rare full inversion and the next one. These two are the
  // build defaults for a knob (see TUNING_DEFAULTS) rather than fixed values —
  // signalLossFlashMs below is not, and is how long the flash itself lasts.
  signalLossMinMs: 30000,
  signalLossMaxMs: 60000,
  signalLossFlashMs: 120,
}

/**
 * Knobs the tuning panel can move at runtime. The provider holds these in
 * state and writes the CSS-side ones out as custom properties, so a tweak on
 * the venue projector needs no redeploy.
 *
 * These are the *build* defaults — what a device paints with before it has heard
 * from the server, and what `{}` in `event.glitch` means. Changing one here is
 * how a good preset becomes permanent (see PRESETS).
 */
export const TUNING_DEFAULTS = {
  minFlipMs: TIMING.minFlipMs,
  maxFlipMs: TIMING.maxFlipMs,
  tearMs: TIMING.tearMs,
  grainOpacity: 0.16,
  scanlineOpacity: 0.5,
  // How often the screen appears to lose signal — the rare full inversion, as
  // opposed to the flip, which is continuous. A random gap between these two, so
  // it stays a surprise; see nextSignalLossDelay.
  signalLossMinMs: TIMING.signalLossMinMs,
  signalLossMaxMs: TIMING.signalLossMaxMs,
}

/**
 * The allowlist and the clamps, in one place. This table *is* the boundary.
 *
 * `event.glitch` is a jsonb column and a jsonb column accepts anything — a hand-
 * crafted request, a half-finished edit, a value pasted from somewhere else. Every
 * key in it ends up as a CSS custom property on every phone in the room, so the
 * only safe shape for that road is: known keys only, each one a finite number,
 * each one inside a range this file decides (§3).
 *
 * Ranges are the ones C3's /dev/glitch panel already used, moved here so the
 * panel's sliders and the sanitiser cannot drift apart — a slider whose maximum
 * is above the clamp is a slider that silently stops doing anything at the top of
 * its travel, which reads as a broken knob rather than a rejected value.
 *
 * Every key here needs a matching key in TUNING_DEFAULTS, and the test asserts it:
 * a range with no default is a knob that is undefined until someone moves it, and
 * `undefined > maxFlipMs` is false, so the pairing below would silently skip it.
 */
export const TUNING_RANGES = {
  minFlipMs: { min: 800, max: 20000 },
  maxFlipMs: { min: 800, max: 30000 },
  tearMs: { min: 60, max: 900 },
  grainOpacity: { min: 0, max: 0.6 },
  scanlineOpacity: { min: 0, max: 1 },
  // The floor is deliberately low enough to be a test setting — five seconds is
  // how you check the flash works without standing there for a minute — and the
  // ceiling is high enough that a hold is not the only way to stop it.
  signalLossMinMs: { min: 5000, max: 300000 },
  signalLossMaxMs: { min: 5000, max: 600000 },
}

/**
 * The values the `hold` key is allowed to take. Absent means released — a
 * released freeze is a *missing* key rather than `null`, so `glitch - 'hold'`
 * (the jsonb operator in lib/event.js) and `{}` mean the same thing.
 */
export const HOLDS = ['good', 'bad']

/**
 * The knob pairs that mean "a random value between these two" and must stay
 * ordered. Written out as a list rather than as two special cases because there
 * are now two of them — the flip interval and the signal-loss gap — and the
 * failure of getting the second one wrong is the same silent one as the first: an
 * inverted interval still returns numbers, so nothing throws and nothing looks
 * obviously broken.
 *
 * Exported because the tuning panel needs the same list. Dragging a slider moves
 * the *other* half of its pair so the control never shows an impossible pair, and
 * the panel doing that from a second hand-written copy of these two rows is how
 * the third pair — whenever it arrives — gets a slider whose half does not follow
 * it. Same reasoning as TUNING_RANGES being shared between the sliders' limits and
 * the sanitiser's clamps.
 */
export const RANGE_PAIRS = [
  ['minFlipMs', 'maxFlipMs'],
  ['signalLossMinMs', 'signalLossMaxMs'],
]

/**
 * Raises a pair's upper bound to meet a lower one that has crossed it. Both ends
 * are already clamped by the time this runs, so the result is always in range.
 *
 * A min above its max is reachable two ways: both knobs published at once, which
 * is what the panel does, or one knob published alone above the *default* other
 * half, which no single value can be checked against. So this runs twice — once
 * inside the sanitiser on whichever pairs arrived complete, and again after the
 * merge, where both halves of every pair always exist.
 *
 * Skips a pair that is only half present, which is what makes it safe to call
 * from the sanitiser.
 */
function pairRanges(tuning) {
  for (const [low, high] of RANGE_PAIRS) {
    if (tuning[low] === undefined || tuning[high] === undefined) continue
    if (tuning[low] > tuning[high]) tuning[high] = tuning[low]
  }
  return tuning
}

/**
 * Takes whatever is in the jsonb column and returns only what is safe to apply.
 *
 * Applied on write *and* on read, and the read half is the one that matters: the
 * write path is one Server Action behind a session cookie, but the value it wrote
 * lives in a row that every device on the site will be handed. Sanitising on the
 * way out is what stops a bad row — from a future bug, a manual edit at the SQL
 * console, a restored backup — from reaching five hundred phones at once.
 *
 * Only *own* properties are read. `JSON.parse` always produces own properties, so
 * for the database's own values this changes nothing; it is here so that a
 * hand-built object with a polluted prototype cannot supply a knob. Nothing is
 * ever written back to the input, so the pollution could not spread either way —
 * but a function whose contract is "own, known, finite, in range" is easier to
 * be sure about than one with an exception.
 *
 * Deliberately strict about types. `"5000"` is rejected rather than coerced: the
 * only writer is `JSON.stringify` on a number, so a string means something
 * upstream is wrong, and coercing it would hide that. `NaN` and `Infinity` are
 * rejected by the same check — neither can survive JSON, so they can only arrive
 * from a direct call, and they are the two values that would actually break the
 * flip loop.
 *
 * Returns a partial: only the keys that survived. Merging is `mergeTuning`'s job,
 * because the caller is the one that knows what the unset keys should fall back
 * to.
 *
 * @param {unknown} input
 * @returns {Partial<typeof TUNING_DEFAULTS> & { hold?: 'good' | 'bad' }}
 */
export function sanitizeTuning(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}

  const out = {}

  for (const [key, range] of Object.entries(TUNING_RANGES)) {
    if (!Object.hasOwn(input, key)) continue
    const value = input[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    out[key] = Math.min(range.max, Math.max(range.min, value))
  }

  pairRanges(out)

  // The freeze rides in the same blob rather than in a column of its own, so it
  // goes through the same boundary — two sanitisers for one row is how one of
  // them ends up forgotten. Released is a *missing* key rather than a null one,
  // so the stored blob has exactly one representation of "nothing is frozen".
  //
  // `hasOwn` here too, for the same reason as the loop above — and it has to be
  // spelled out rather than folded into `HOLDS.includes`, because `includes` on an
  // inherited value would succeed.
  if (Object.hasOwn(input, 'hold') && HOLDS.includes(input.hold)) out.hold = input.hold

  return out
}

/**
 * A complete, safe tuning object: the build defaults with the stored overrides on
 * top. What the provider holds in state, and what the panel's sliders read, so
 * both always see every key.
 *
 * The pairing runs again here rather than only in the sanitiser, and that is not
 * redundant: a stored override of `{ minFlipMs: 15000 }` is legal on its own —
 * nothing in it is out of range — and only becomes an inverted interval once it
 * meets the default max of 10000. This is the first point where both numbers
 * exist at the same time. Same for the signal-loss pair.
 *
 * Not used on the write path — that one stores the partial, which is the whole
 * point of the column being a partial override.
 *
 * @param {unknown} override the raw `event.glitch` value
 */
export function mergeTuning(override) {
  return pairRanges({ ...TUNING_DEFAULTS, ...sanitizeTuning(override) })
}

/**
 * Starting points, in the order they are offered. Picking one moves the knobs on
 * this device; it does not touch the freeze, and it does not reach anyone else
 * until you publish.
 *
 * Complete, every one of them, and the test asserts it. A preset that omitted the
 * signal-loss pair would leave the flash rate wherever it happened to be — so
 * "Calm" pressed on a device that had just run Showtime would be calm in every
 * respect except the one that hits hardest. It is the same reason a preset is a
 * spread of all the keys rather than a patch.
 *
 * The plan's rule is that copying a preset's numbers into `TUNING_DEFAULTS` above
 * is what makes it permanent — which is why `rehearsal` is written as a spread of
 * the defaults rather than as a second copy of the same numbers. A duplicate
 * would be wrong the moment someone edited one of them.
 */
export const PRESETS = [
  { key: 'rehearsal', label: 'Rehearsal', values: { ...TUNING_DEFAULTS } },
  {
    key: 'showtime',
    label: 'Showtime',
    values: {
      minFlipMs: 2500,
      maxFlipMs: 7000,
      tearMs: 280,
      grainOpacity: 0.22,
      scanlineOpacity: 0.65,
      // Roughly twice as often as the default, which is the loud preset's whole
      // character. Still rare enough to be a shock rather than a rhythm.
      signalLossMinMs: 15000,
      signalLossMaxMs: 30000,
    },
  },
  {
    key: 'calm',
    label: 'Calm',
    values: {
      minFlipMs: 9000,
      maxFlipMs: 20000,
      tearMs: 120,
      grainOpacity: 0.08,
      scanlineOpacity: 0.25,
      // Three to five minutes. Long enough that a reader who looks up mid-solve
      // is unlikely to catch one, which is what "calm" has to mean when the flash
      // is a full-screen inversion.
      signalLossMinMs: 180000,
      signalLossMaxMs: 300000,
    },
  },
]

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

/**
 * How long until the next signal-loss flash, from the tuning rather than from
 * TIMING.
 *
 * It read `TIMING.signalLossMinMs` / `signalLossMaxMs` directly until C12's
 * follow-up, which is why it took one argument while `nextFlipDelay` took two.
 * That asymmetry was the honest description of the situation — the flash rate was
 * the one rate nobody could move — and the moment it became a knob the argument
 * list had to match, or the slider would write to the row and the provider would
 * keep reading the constant. Which is the worst version of this bug: a control
 * that saves successfully and changes nothing, indistinguishable at a glance from
 * a cache that has not expired yet.
 *
 * `TIMING` still holds the *build* values, and `TUNING_DEFAULTS` still reads them
 * from there, so there is one number and not two.
 */
export function nextSignalLossDelay(tuning, random = Math.random) {
  return randomBetween(tuning.signalLossMinMs, tuning.signalLossMaxMs, random)
}
