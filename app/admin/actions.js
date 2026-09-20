'use server'

/**
 * Admin Server Actions — the boundary, and nothing else.
 *
 * A `'use server'` module makes *every* export a publicly callable endpoint, so
 * each function here is one the browser can invoke by reference. The logic lives
 * in lib/event.js. The guard is proxy.js, which is why nothing here repeats an
 * auth check: a request that reaches this module has already been verified, and
 * a second check spelled out in each of four actions is a second chance to
 * forget one.
 */
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { setStartTime, setSubmissionsOpen } from '@/lib/event'
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/session'

/**
 * Moves the event's zero-point.
 *
 * TWO PARAMETERS, because this one is wrapped in `useActionState` and that hook
 * calls its action as `(prevState, formData)`. Note the difference from the two
 * below, which are plain `<form action={…}>` submissions and take `formData`
 * alone — the same function shape in the same file means different things
 * depending on how the form calls it, and getting it wrong hands `formData` a
 * state object with no error until the first save.
 *
 * @param {unknown} prevState
 * @param {FormData} formData
 */
export async function updateStartTime(prevState, formData) {
  const raw = formData.get('startTime')

  // The submitted value is a full ISO instant, not the `YYYY-MM-DDTHH:mm` the
  // datetime-local input holds — see StartTimeForm.jsx for why the conversion
  // happens in the browser. A `datetime-local` string has no offset, so parsing
  // it here would resolve it against the *server's* timezone, which on Vercel is
  // UTC: a start time of 18:30 at the venue would be stored as 00:00. The
  // browser knows the offset; the server must be handed the answer.
  if (typeof raw !== 'string' || raw === '') return { ok: false, error: 'invalid' }
  const startTime = new Date(raw)
  if (Number.isNaN(startTime.getTime())) return { ok: false, error: 'invalid' }

  await setStartTime(startTime)

  // The dashboard is `force-dynamic`, so this changes nothing today — it is here
  // so the action does not silently depend on that, and so C15's boards (which
  // will cache) get the invalidation for free when they arrive.
  revalidatePath('/admin')

  return { ok: true }
}

/**
 * The kill switch.
 *
 * ONE PARAMETER — a plain form action, unlike `updateStartTime` above. Wrapping
 * this in `useActionState` later means changing the signature, not just the call
 * site.
 *
 * @param {FormData} formData
 */
export async function updateSubmissionsOpen(formData) {
  // Strictly `=== 'true'`: the hidden field carries "true" or "false" as text,
  // and a coercion here would treat a missing field as false and quietly close
  // every chamber in the game.
  await setSubmissionsOpen(formData.get('open') === 'true')

  revalidatePath('/admin')
}

/**
 * Ends the session.
 *
 * Cleared with `maxAge: 0` and the shared option set rather than
 * `store.delete(SESSION_COOKIE)`. A cookie is deleted by setting an expired
 * cookie with *matching* attributes, and a delete that guessed a different path
 * would leave the real cookie in place — a logged-out browser that is still
 * logged in, which is the worst version of this bug because the screen agrees
 * with you.
 *
 * No `prevState` parameter: this is a plain form action and takes no state. It is
 * also the only export here with nothing to validate, which is the point — there
 * is no input that can fail.
 */
export async function logout() {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 })

  // Throws its own NEXT_REDIRECT, so it stays outside any try/catch.
  redirect('/admin/login')
}
