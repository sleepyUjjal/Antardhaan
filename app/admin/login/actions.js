'use server'

/**
 * The login Server Action — the boundary, and nothing else.
 *
 * A `'use server'` module makes *every* export a publicly callable endpoint, so
 * the only thing exported here is the one function the form is allowed to call.
 * That rule is why `verifyPassword` is in lib/password.js rather than beside it:
 * an exported password check would be an endpoint telling any caller whether a
 * string is the admin password, which is a worse thing to have built than the
 * thing it was meant to protect.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { env } from '@/lib/env'
import { verifyPassword } from '@/lib/password'
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, createSession } from '@/lib/session'

/**
 * `prevState` is unused and is not a mistake — it is the first half of the
 * contract `useActionState` calls this with, `(prevState, formData)`. Dropping
 * the parameter would shift `formData` into its place and hand this function a
 * state object instead of the form. Same shape as app/[slug]/actions.js.
 *
 * There is no rate limit and no lockout. That is a deliberate trade for one
 * password and one user: the control is that ADMIN_PASSWORD is generated at 24+
 * characters, which is not reachable by guessing at any rate this endpoint can
 * serve. If that stops being true the answer is a Vercel WAF rule rather than a
 * counter in this file — a counter needs shared state, and a per-instance one in
 * a serverless function counts nothing.
 *
 * @param {unknown} prevState
 * @param {FormData} formData
 */
export async function login(prevState, formData) {
  const password = formData.get('password')

  // `env.ADMIN_PASSWORD` rather than `process.env.ADMIN_PASSWORD ?? ''`. The
  // getter throws on a missing or empty value, which is a loud failure on the
  // first login attempt; the fallback would be a variable that is empty on a
  // deploy where nobody set it, and an empty password is a login.
  if (!verifyPassword(password, env.ADMIN_PASSWORD)) {
    return { ok: false, error: 'invalid' }
  }

  // The cookie is set on the response to this action's own POST. HttpOnly comes
  // from SESSION_COOKIE_OPTIONS, which is shared with the middleware so the two
  // cannot disagree about the name or the attributes.
  const store = await cookies()
  store.set(SESSION_COOKIE, await createSession(), SESSION_COOKIE_OPTIONS)

  // Throws its own NEXT_REDIRECT, which Next turns into a client navigation —
  // so this must stay outside any try/catch. Nothing returns from here, and the
  // form needs no success state: it is replaced by the dashboard.
  redirect('/admin')
}
