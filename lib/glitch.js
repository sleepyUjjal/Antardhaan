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
