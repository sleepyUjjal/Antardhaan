/**
 * The admin session: one signed cookie, and the two functions that make and read
 * one.
 *
 * A signed token rather than the password itself in the cookie, which is the one
 * shortcut worth not taking in this file — a cookie holding the password is a
 * copy of the credential on a device that will be in a pocket at the venue, and
 * it cannot expire without changing the password.
 *
 * What is in the token is a role and nothing else. It carries no chamber, no
 * code, no slug, and no expiry the server takes on trust: `exp` is verified here,
 * so a stolen cookie is worth twelve hours and not forever.
 *
 * THIS FILE WAS WRITTEN EDGE-SAFE AND NO LONGER HAS TO BE. The first version of
 * C10 ran as `middleware.js`, which Next 16 sends to the edge runtime by default,
 * so nothing in its import graph could touch `node:crypto` — which is why the
 * password comparison is in lib/password.js and why the secret below was read
 * with a literal `process.env.SESSION_SECRET` instead of through lib/env.js,
 * whose dynamic `process.env[name]` lookup depends on a runtime `process.env`
 * that an edge bundle is not guaranteed to have.
 *
 * The migration to `proxy.js` removed that constraint: proxy files go to
 * `onServer()` unconditionally, so this is Node and `env.SESSION_SECRET` works
 * like it does everywhere else in the project. The two files stay split anyway,
 * for a smaller reason — the proxy imports this module on every guarded request,
 * and there is no case for the request-path guard carrying a password comparison
 * it never calls.
 *
 * jose rather than a hand-rolled HMAC, for the same reason as before and not
 * because of the runtime: this is not a place to be clever. The failure mode of a
 * self-written token verifier is one that accepts a token it should not.
 */
import { SignJWT, jwtVerify } from 'jose'
import { env } from './env.js'

/** The cookie name. Prefixed so it cannot collide with anything else on the domain. */
export const SESSION_COOKIE = 'antardhaan_admin'

/** Twelve hours — one event day, so a login at the venue survives the evening. */
export const SESSION_MAX_AGE_S = 12 * 60 * 60

/**
 * Cookie attributes, shared so the proxy and the login action cannot drift.
 *
 * `httpOnly` is what the "cookie is invisible to `document.cookie`" check in the
 * plan's done-when is actually testing: JavaScript on any page of this origin
 * cannot read it, so an XSS on the decoy cannot lift the session.
 *
 * `sameSite: 'lax'` rather than `'strict'` — strict would also be safe here, but
 * it drops the cookie on a top-level navigation from an external link, which is
 * how you arrive at `/admin` from a bookmark or a chat message. Lax still blocks
 * the cross-site POST that CSRF needs.
 *
 * `secure` is conditional, and the condition is not a weakening of it in
 * production. A `Secure` cookie over plain `http://localhost` is silently
 * discarded by Safari: the login would appear to succeed and then bounce back to
 * the form with no error, which is a bad hour to lose. Production is HTTPS and
 * production gets the flag.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_MAX_AGE_S,
}

/**
 * Mints a session token.
 *
 * `exp` is set from `SESSION_MAX_AGE_S` rather than as a duration string like
 * `'12h'` so that the token's expiry and the cookie's `maxAge` are the same
 * number by construction. Two independent twelve-hours is one too many to keep
 * in sync by hand.
 *
 * The secret is encoded once per call rather than cached in a module constant,
 * which is deliberate: caching it would mean reading the environment at import
 * time, and lib/env.js validates where a value is *read* for a reason — an error
 * naming the missing variable, at the line that needed it, rather than an
 * import-time crash in whichever file happened to pull this in first.
 */
export async function createSession() {
  const issuedAt = Math.floor(Date.now() / 1000)
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_MAX_AGE_S)
    .sign(new TextEncoder().encode(env.SESSION_SECRET))
}

/**
 * Verifies a token and returns its payload, or null.
 *
 * Every failure is null — a wrong signature, an expired token, a tampered
 * payload, a missing SESSION_SECRET, a string that is not a JWT at all. The
 * caller's only sane response to any of them is "not logged in", and
 * distinguishing them for the client would be describing why a forged token was
 * forged badly.
 *
 * `algorithms: ['HS256']` is pinned even though the header says HS256. Left
 * unpinned, a verifier that trusts the header can be handed `alg: 'none'` or an
 * asymmetric algorithm with the public key as the HMAC secret. It is one option
 * and it is the whole of that class of bug.
 *
 * @param {unknown} token
 * @returns {Promise<import('jose').JWTPayload | null>}
 */
export async function readSession(token) {
  if (typeof token !== 'string' || token === '') return null
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.SESSION_SECRET), {
      algorithms: ['HS256'],
    })
    return payload
  } catch {
    return null
  }
}
