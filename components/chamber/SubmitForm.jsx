'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { CLOSED_RESULT, ResultPanel, outcomeOf } from './ResultPanel'

/**
 * The participant's whole job: two fields and a button.
 *
 * The form is bottom-anchored and the panel takes its place on success, so the
 * confirmation lands exactly where the thumb already is rather than below the
 * fold on a phone in a corridor.
 *
 * No `text-sm` on either input. The base layer pins inputs at `max(16px, 1rem)`,
 * which is the threshold below which iOS Safari zooms the page on focus — a
 * `text-sm` here would undo that silently and wreck the layout mid-submission.
 */
const FIELD = 'flex flex-col gap-2'
const LABEL = 'font-mono text-xs uppercase tracking-[0.25em] text-muted'
const INPUT = 'border border-rule bg-transparent px-4 py-3 text-fg'

export function SubmitForm({ action, slug, closed }) {
  const [result, formAction, pending] = useActionState(action, null)

  // Three states, in order of precedence: the event is shut, the submission
  // succeeded, or the form is showing. A form that has already been accepted is
  // not disabled and left on screen — it is gone, because a greyed-out form
  // above the confirmation pushes the confirmation down the page.
  const accepted = result?.ok === true
  const showForm = !closed && !accepted

  return (
    <div className="border-t border-rule px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        {showForm ? (
          <form action={formAction} className="flex flex-col gap-5">
            {/* The slug rides in the form rather than being bound onto the
                action. It is not a secret — it is already in the URL this page
                was served at — and it authorises nothing: the action re-resolves
                it and checks the code against whichever suit comes back, so a
                tampered slug only picks a different chamber to be rejected by. */}
            <input type="hidden" name="slug" value={slug} />

            <label className={FIELD}>
              <span className={LABEL}>Team name</span>
              <input
                name="teamName"
                required
                maxLength={40}
                autoFocus
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="next"
                spellCheck={false}
                className={INPUT}
              />
            </label>

            <label className={FIELD}>
              <span className={LABEL}>Code</span>
              <input
                name="code"
                required
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                className={`${INPUT} font-mono uppercase tracking-[0.3em]`}
              />
            </label>

            <Button type="submit" disabled={pending}>
              {pending ? 'Recording…' : 'Submit'}
            </Button>
          </form>
        ) : null}

        {/* Keyed by outcome so that a change of *kind* remounts the panel, which
            is what replays the scramble. Two wrong codes in a row keep the same
            key and so do not re-scramble — the headline has already settled and
            re-animating identical text reads as a glitch rather than a result. */}
        {closed ? (
          <ResultPanel result={CLOSED_RESULT} />
        ) : result ? (
          <ResultPanel key={outcomeOf(result)} result={result} />
        ) : null}
      </div>
    </div>
  )
}
