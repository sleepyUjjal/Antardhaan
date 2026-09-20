'use client'

import { useSyncExternalStore } from 'react'
import { formatClockTime } from '@/lib/format'

/**
 * A wall-clock time, rendered on the client or not at all.
 *
 * WHY THIS IS A CLIENT COMPONENT AND NOT A LINE OF JSX. `formatClockTime` is
 * `toLocaleTimeString`, which resolves against the *server's* locale and
 * timezone when it runs on the server and the *device's* when it runs in the
 * browser. A server-rendered board would therefore show times in UTC — Vercel's
 * timezone — to an organiser standing in a venue in IST, and React would flag the
 * mismatch on hydration. lib/format.js says all of this at the top and it is the
 * reason no formatter in it is called during server rendering.
 *
 * `useSyncExternalStore` is the sanctioned shape for "the server cannot know
 * this": React calls `getServerSnapshot` for the hydration render and only then
 * re-renders with the real one, so the HTML and the first client render agree and
 * there is no mismatch to suppress. A mount effect calling setState would be the
 * obvious version and is rejected by `react-hooks/set-state-in-effect`, which is
 * the same reason StartTimeForm and GlitchProvider subscribe this way. The cost
 * is a placeholder for one frame, which matters far less than showing the wrong
 * hour to the person timing the event.
 *
 * `subscribeNoop` is module-scoped because its identity has to be stable — an
 * inline arrow would make the hook resubscribe on every render. Nothing here ever
 * changes, so the unsubscribe is a no-op; the hook is being used for its
 * server/client snapshot split, not for its subscription.
 *
 * Rendered one per row rather than once per list with a shared "is hydrated"
 * flag. That flag would be cheaper and is the shape that breaks: it makes
 * whether a time is real a property of the list, so a row rendered anywhere else
 * — a future export panel, a detail view — gets a blank cell with nothing to
 * explain it.
 */
const subscribeNoop = () => () => {}

/**
 * @param {{ iso: string | Date, className?: string }} props
 *   `iso` is the instant. A Date is accepted because it survives the RSC
 *   boundary intact and the caller usually already holds one.
 */
export function ClockTime({ iso, className }) {
  const text = useSyncExternalStore(
    subscribeNoop,
    () => formatClockTime(iso),
    // The server snapshot. An em dash rather than an empty string so the cell
    // has the right width and the placeholder reads as "not known yet" rather
    // than as a layout gap — and `aria-hidden` is not needed because the time
    // that replaces it is in the same node.
    () => '——:——:——',
  )

  return <span className={className}>{text}</span>
}
