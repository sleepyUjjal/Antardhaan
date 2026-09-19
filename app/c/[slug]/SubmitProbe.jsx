'use client'

import { useActionState } from 'react'
import { submitEntry } from './actions'

/**
 * C7's manual-testing form. C8 replaces this file entirely with the real
 * chamber — sigil hero, proper result treatments, focus management. It exists
 * because C7's done-when asks for checks that cannot be made without some way to
 * submit and see the answer.
 */

// Never hints at how close a code was. A wrong code and a nearly-right one are
// the same sentence on purpose (§7).
const MESSAGES = {
  bad_code: 'That code is not right for this chamber.',
  closed: 'This chamber is not taking submissions.',
  invalid: 'Check the name you entered and try again.',
}

const FIELD_LABEL = 'flex flex-col gap-1 font-mono text-xs uppercase tracking-widest text-muted'
const FIELD_INPUT = 'border border-rule px-3 py-3 text-fg'

export function SubmitProbe({ slug, closed }) {
  const [result, formAction, pending] = useActionState(submitEntry, null)

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      {/* The slug rides in the form rather than being bound onto the action. It
          is not a secret — it is already in the URL this page was served at —
          and it is not what authorises anything: the action re-resolves it, and
          the code is then checked against whichever suit comes back. A tampered
          slug only chooses a different chamber to be rejected by. */}
      <input type="hidden" name="slug" value={slug} />

      <label className={FIELD_LABEL}>
        Team name
        <input
          name="teamName"
          required
          maxLength={40}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          className={FIELD_INPUT}
        />
      </label>

      <label className={FIELD_LABEL}>
        Code
        {/* No font-size utility on either input, deliberately. The base layer
            pins inputs at `max(16px, 1rem)`, which is the threshold under which
            iOS Safari zooms the page on focus and wrecks the layout mid-
            submission. A `text-sm` here would undo that with no warning. */}
        <input
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className={`${FIELD_INPUT} font-mono uppercase tracking-[0.3em]`}
        />
      </label>

      <button
        type="submit"
        disabled={pending || closed}
        className="min-h-[52px] border border-accent bg-accent font-mono text-sm uppercase tracking-widest text-paper active:bg-maroon-hot disabled:opacity-40"
      >
        {pending ? 'Recording…' : 'Submit'}
      </button>

      <div aria-live="polite" className="min-h-16 font-mono text-sm">
        {result === null ? null : result.ok ? (
          <p className="text-fg">
            {result.duplicate ? 'Already recorded at ' : 'Recorded at '}
            {/* Wrapped in `new Date(...)` rather than trusted to already be one:
                this is a probe page, and it should show the real outcome whether
                the action boundary hands back a Date or an ISO string. */}
            {new Date(result.submittedAt).toLocaleTimeString()}
          </p>
        ) : (
          <p className="text-muted">{MESSAGES[result.reason]}</p>
        )}
      </div>
    </form>
  )
}
