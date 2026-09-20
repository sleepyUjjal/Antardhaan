'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'

/**
 * One field, one button, and the error underneath the thumb.
 *
 * Deliberately plain — no scramble, no tear, no maroon fringe on the label. The
 * admin subtree is the one place on the site where the effect is held still (see
 * `isStillRoute` in lib/glitch.js), and this form is the reason: it is read at
 * 1 a.m. on a phone at 30% battery, by the only person who cannot afford to
 * misread it.
 *
 * Class strings are shared with SubmitForm's shape rather than imported from it.
 * Two forms are not a component library, and the one thing they genuinely need to
 * agree on — that inputs must not be given `text-sm`, because the base layer pins
 * them at `max(16px, 1rem)` to stop iOS Safari zooming the page on focus — is
 * worth a comment in both places rather than an abstraction in one.
 */
const FIELD = 'flex flex-col gap-2'
const LABEL = 'font-mono text-xs uppercase tracking-[0.25em] text-muted'
const INPUT = 'border border-rule bg-transparent px-4 py-3 text-fg'

export function LoginForm({ action }) {
  const [state, formAction, pending] = useActionState(action, null)
  const failed = state?.ok === false

  return (
    <form action={formAction} className="mt-10 flex flex-col gap-5">
      <label className={FIELD}>
        <span className={LABEL}>Password</span>
        <input
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          enterKeyHint="go"
          // Rendered as the string 'true' or omitted entirely, so a screen reader
          // hears the field as invalid only once it is.
          aria-invalid={failed || undefined}
          aria-describedby={failed ? 'login-error' : undefined}
          className={INPUT}
        />
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? 'Checking…' : 'Enter'}
      </Button>

      {/* `role="alert"` rather than a live region set up ahead of time: this
          appears once, under the button, and nowhere else on the page changes.
          The message says nothing about what was nearly right. */}
      {failed ? (
        <p id="login-error" role="alert" className="font-mono text-sm text-accent-text">
          Incorrect password.
        </p>
      ) : null}
    </form>
  )
}
