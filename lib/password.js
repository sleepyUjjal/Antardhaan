/**
 * The admin password check.
 *
 * Its own file for two reasons, and it is worth being precise about which one
 * still applies, because the first one expired mid-commit.
 *
 * The original reason was the runtime: this was written while the route guard was
 * `middleware.js`, which Next 16 sends to the edge, where `node:crypto` does not
 * resolve — so the password comparison could not live in lib/session.js, which
 * the guard imports. The guard is `proxy.js` now and runs on Node, so that
 * constraint is gone and this could be folded back in.
 *
 * The reason it stays separate is the one that did not depend on the runtime: it
 * must not live in the action file. A `'use server'` module turns every export
 * into a publicly callable endpoint, and a callable
 * `verifyPassword(candidate, expected)` would be an endpoint that tells any
 * caller whether an arbitrary string is the admin password — a worse thing to
 * have built than the thing it was meant to protect. The proxy also imports
 * lib/session.js on every guarded request, and there is no case for the
 * request-path guard carrying a comparison it never calls.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Compares a submitted password against the real one, in constant time.
 *
 * Both sides are hashed to 32 bytes before the compare rather than passed to
 * `timingSafeEqual` directly. That function throws on a length mismatch, so the
 * obvious version of this — check the lengths, then compare — is worse than it
 * looks: it returns on the first byte for almost every wrong guess, which is
 * both a shorter path than any correct guess and an oracle for how long the
 * password is. Hashing first makes the two inputs the same length by
 * construction, so there is no length branch to leak through.
 *
 * This is the opposite call from `codesMatch` in lib/submissions.js, which checks
 * lengths and says why: a suit code is 8 characters from a published alphabet, so
 * its length is public. A password's is not.
 *
 * A nanosecond-scale difference is not measurable across a network, and the real
 * defence here is that ADMIN_PASSWORD is generated at 24+ characters — 10²⁸ or
 * better against an endpoint with no rate limit. This is three lines to keep the
 * comparison from being the cheapest way in.
 *
 * @param {unknown} candidate the submitted value
 * @param {string} expected the real password, from env.ADMIN_PASSWORD
 */
export function verifyPassword(candidate, expected) {
  // An empty candidate is rejected outright. Not for the comparison's sake —
  // `verifyPassword('', '')` would be a login for anyone, and although
  // lib/env.js refuses to return an empty ADMIN_PASSWORD, this function should
  // not be the place where that guarantee is assumed.
  if (typeof candidate !== 'string' || candidate === '') return false
  if (typeof expected !== 'string' || expected === '') return false

  const a = createHash('sha256').update(candidate, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}
