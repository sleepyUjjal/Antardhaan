'use client'

import { useEffect, useRef } from 'react'
import { useGlitch } from '@/components/glitch/GlitchProvider'
import { useScramble } from '@/components/glitch/useScramble'
import { cn } from '@/lib/cn'
import { formatClockTime, formatElapsed } from '@/lib/format'

/**
 * The outcome treatments, as data.
 *
 * `tone` is the left rule, `heading` is the headline colour, and together they
 * carry a three-step hierarchy: accent means you solved it, a muted rule means
 * you already did, and a hairline means it was not accepted. The words carry the
 * rest — deliberately, because C7 collapses three different server situations
 * into one `'closed'` reason on the grounds that a slug that stopped resolving,
 * a chamber retired mid-event, and the global kill switch are not distinctions a
 * participant can act on. Giving them three colours here would reintroduce the
 * distinction the server went out of its way not to send.
 */
const OUTCOMES = {
  recorded: { headline: 'Recorded', tone: 'border-accent', heading: 'text-accent-text' },
  duplicate: { headline: 'Already recorded', tone: 'border-muted', heading: 'text-fg' },
  bad_code: { headline: 'Not accepted', tone: 'border-rule', heading: 'text-fg' },
  closed: { headline: 'Closed', tone: 'border-rule', heading: 'text-muted' },
  invalid: { headline: 'Try again', tone: 'border-rule', heading: 'text-fg' },
}

/** Which treatment a result gets. Also used as the panel's React key. */
export function outcomeOf(result) {
  if (result.ok) return result.duplicate ? 'duplicate' : 'recorded'
  return result.reason in OUTCOMES ? result.reason : 'invalid'
}

/**
 * The rejection copy.
 *
 * `bad_code` says nothing about how close the code was, and that is the whole
 * point of it (§7) — a message that distinguishes "wrong length" from "one
 * character off" turns 31⁸ guesses into a few hundred. It is also why this file
 * has no separate case for a code that was the right shape but the wrong
 * chamber: there is one sentence, and it is the same sentence every time.
 */
const SENTENCES = {
  bad_code: 'That code is not right for this chamber.',
  closed: 'This chamber is not taking submissions.',
  invalid: 'Check the name you entered and try again.',
}

/**
 * A stable identity for the "already closed when the page loaded" case.
 *
 * A fresh object literal in SubmitForm's render would change identity every
 * render, and this component keys its focus effect on `result`.
 */
export const CLOSED_RESULT = { ok: false, reason: 'closed' }

/**
 * What happened, announced and legible at arm's length.
 *
 * Three things here are load-bearing and easy to undo by accident:
 *
 * 1. **The scrambled headline is outside the live region and `aria-hidden`.**
 *    A live region announces on *any* subtree mutation, and the scramble mutates
 *    its text every 40 ms for 700 ms. Inside `role="status"` that is eighteen
 *    announcements of glyph soup. The static `sr-only` copy is the one the
 *    screen reader gets, and it never changes.
 * 2. **Focus moves here on submit**, which is the reliable half of the
 *    announcement — a live region that is inserted already populated is a coin
 *    flip across screen readers, whereas a focus move is not. It costs a little
 *    redundancy with the live region; hearing the outcome twice is a much better
 *    failure than hearing it never.
 * 3. **No `focus:outline-none`.** Programmatic focus on a `tabindex="-1"`
 *    container matches `:focus-visible` only when the last input was a keyboard,
 *    which is exactly right: a thumb on the submit button gets no stray ring, a
 *    keyboard user gets the ring from globals.css.
 */
export function ResultPanel({ result }) {
  const { reducedMotion } = useGlitch()
  const panel = useRef(null)

  const kind = outcomeOf(result)
  const outcome = OUTCOMES[kind]
  const scrambled = useScramble(outcome.headline, { enabled: !reducedMotion })

  useEffect(() => {
    panel.current?.focus()
  }, [result])

  const solved = kind === 'recorded' || kind === 'duplicate'

  return (
    <section
      ref={panel}
      tabIndex={-1}
      className={cn('relative border-l-4 pl-5', outcome.tone)}
    >
      <h2
        aria-hidden="true"
        className={cn(
          'font-display text-3xl uppercase leading-none tracking-tight',
          outcome.heading,
        )}
      >
        {scrambled}
      </h2>

      <div role="status" className="mt-4">
        <span className="sr-only">{outcome.headline}. </span>

        {solved ? (
          // `formatClockTime` and `formatElapsed` resolve against the device's
          // locale and timezone, so they must never run during server rendering
          // (see lib/format.js). They do not: this panel only ever mounts on the
          // client, after the action returns.
          <div className="flex flex-col gap-1 font-mono text-sm">
            <p>
              {kind === 'duplicate' ? 'First recorded at ' : 'Recorded at '}
              <span className="tabular-nums text-fg">{formatClockTime(result.submittedAt)}</span>
            </p>
            <p className="text-muted">
              Elapsed <span className="tabular-nums">{formatElapsed(result.elapsedMs)}</span>
            </p>
          </div>
        ) : (
          <p className="font-mono text-sm text-muted">{SENTENCES[kind]}</p>
        )}
      </div>
    </section>
  )
}
