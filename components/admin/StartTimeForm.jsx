'use client'

import { useActionState, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/Button'
import { formatElapsed, inputValueToIso, toLocalInputValue } from '@/lib/format'

/**
 * The event's zero-point, and a preview of what moving it would do.
 *
 * The preview is the point of this component. Every elapsed time on every board
 * is `submitted_at - start_time` computed at read time, so this one field
 * silently re-ranks five chambers — and "silently" is the problem. Typing a
 * start time and pressing save with no idea what it does to the board is how you
 * discover at 2 a.m. that the leader's time now reads 42 minutes. So the leader's
 * elapsed under the *unsaved* value is rendered live beside the input, and the
 * decision to save is made against the number it produces rather than against
 * the clock time you typed.
 *
 * TWO CLOCKS, ONE INSTANT. The input holds a wall-clock string with no timezone
 * in it; what gets stored is an absolute instant. The conversion is done in the
 * browser (`inputValueToIso`) because the browser is the only one of the two that
 * knows which offset applies — see the note in app/admin/actions.js for what
 * happens when the server guesses.
 */
const FIELD = 'flex flex-col gap-2'
const LABEL = 'font-mono text-xs uppercase tracking-[0.25em] text-muted'
const INPUT = 'border border-rule bg-transparent px-4 py-3 text-fg'

// Module-scoped so its identity is stable — an inline arrow would make
// useSyncExternalStore resubscribe on every render. Nothing here ever changes,
// so the unsubscribe is a no-op; the hook is being used for its server/client
// snapshot split, not for its subscription.
const subscribeNoop = () => () => {}

/**
 * The stored instant as this device would write it, or '' during server render.
 *
 * The server cannot fill this input: `toLocalInputValue` is device-local, so a
 * server-rendered value would be computed in the *server's* timezone and the
 * client would then render a different one — a hydration mismatch on the input's
 * value attribute, which React does not repair for an uncontrolled field, so the
 * page would show UTC to someone who is not in UTC.
 *
 * `useSyncExternalStore` is the sanctioned shape for "the server cannot know
 * this": it returns the server snapshot for the hydration render and then
 * re-renders once with the real one. The alternative — a mount effect calling
 * setState — is rejected by `react-hooks/set-state-in-effect`, which is the same
 * reason GlitchProvider subscribes to reduced motion this way. The cost is one
 * frame with an empty field, which is invisible in practice and much better than
 * the alternatives: a visible flash of the wrong time, or the wrong time saved.
 */
function useDeviceLocalValue(iso) {
  return useSyncExternalStore(
    subscribeNoop,
    () => toLocalInputValue(iso),
    () => '',
  )
}

/**
 * @param {{
 *   action: (prevState: unknown, formData: FormData) => Promise<{ ok: boolean }>,
 *   initialIso: string,
 *   leaderIso: string | null,
 * }} props
 */
export function StartTimeForm({ action, initialIso, leaderIso }) {
  const [state, formAction, pending] = useActionState(action, null)
  const deviceValue = useDeviceLocalValue(initialIso)

  // `null` means "untouched, follow the stored value". Once you type, the draft
  // wins for the rest of the component's life — including across a save, which is
  // what lets the confirmation below stay on screen after the page revalidates
  // underneath it. A `key` on this component would remount it and throw the
  // message away the instant it was earned.
  const [draft, setDraft] = useState(null)
  const value = draft ?? deviceValue

  const startMs = value ? new Date(value).getTime() : Number.NaN
  const leaderMs = leaderIso ? new Date(leaderIso).getTime() : Number.NaN
  const hasLeader = Number.isFinite(leaderMs)
  const preview = Number.isFinite(startMs) && hasLeader ? leaderMs - startMs : null

  const iso = inputValueToIso(value)

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <label className={FIELD}>
        <span className={LABEL}>Event start</span>
        <input
          type="datetime-local"
          value={value}
          onChange={(event) => setDraft(event.target.value)}
          required
          className={INPUT}
        />
      </label>

      {/* The real payload, and the reason this form is a client component at all.
          A datetime-local value is a local wall-clock string; this is the same
          moment as an absolute instant, which is the only form the server can
          store without guessing at a timezone. */}
      <input type="hidden" name="startTime" value={iso ?? ''} />

      {/* Above the button, not below it: on a phone the preview has to be visible
          at the same moment as the control that changes it. */}
      <div className="border-l-4 border-rule pl-4">
        {preview === null ? (
          <p className="font-mono text-sm text-muted">
            {hasLeader ? 'Pick a time.' : 'No submissions yet, so there is nothing to re-time.'}
          </p>
        ) : (
          <>
            <p className="font-mono text-sm text-muted">
              Fastest solve would read{' '}
              <span className="tabular-nums text-fg">{formatElapsed(preview)}</span>
            </p>
            {preview < 0 ? (
              <p className="mt-1 font-mono text-sm text-accent-text">
                That is before the solve. Set the start earlier or the board opens with a negative
                time at the top.
              </p>
            ) : null}
          </>
        )}
      </div>

      <Button type="submit" disabled={pending || iso === null}>
        {pending ? 'Saving…' : 'Save start time'}
      </Button>

      {/* Nothing here modifies a submission. That is worth saying out loud on the
          one screen where it is not obvious: elapsed times are computed from this
          value, so fixing it re-ranks the board and leaves every recorded solve
          exactly as it was. */}
      {state?.ok === true ? (
        <p role="status" className="font-mono text-sm text-muted">
          Saved. Every elapsed time on the board moved with it — no submission was touched.
        </p>
      ) : null}

      {state?.ok === false ? (
        <p role="alert" className="font-mono text-sm text-accent-text">
          That is not a time. Nothing was saved.
        </p>
      ) : null}
    </form>
  )
}
