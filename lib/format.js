/**
 * Display formatting for times and durations.
 *
 * Presentation only, and locale-dependent — which is why none of it runs during
 * server rendering. `toLocaleTimeString` resolves against the server's locale
 * and timezone on the server and the device's on the client, so a formatted time
 * rendered on both sides is a hydration mismatch and a visible flicker. Every
 * caller of these is a client component rendering after an action, where only
 * one of those two exist.
 */

/**
 * `1h 04m 12s`, `4m 12s`, `12s`.
 *
 * A negative duration is rendered with its sign rather than clamped. It is a
 * real state, not a bug: submissions are accepted whenever (§1.4), so a solve
 * recorded before the start time is set has a negative elapsed and sorts to the
 * top of the board (§6). Clamping to zero here would hide the mistake instead of
 * showing it, which is the opposite of useful when you are the one who typed the
 * start time wrong.
 */
export function formatElapsed(ms) {
  const total = Math.floor(Math.abs(ms) / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const sign = ms < 0 ? '-' : ''

  if (hours > 0) {
    return `${sign}${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
  }
  if (minutes > 0) {
    return `${sign}${minutes}m ${String(seconds).padStart(2, '0')}s`
  }
  return `${sign}${seconds}s`
}

/** A wall clock time in the device's own timezone, 24-hour: `21:14:03`. */
export function formatClockTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
