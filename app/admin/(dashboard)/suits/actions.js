'use server'

/**
 * The suits page's Server Actions.
 *
 * These arrive as POSTs to `/admin/suits` and sit behind the same proxy guard as
 * the page itself, so there is no auth check here — the reason app/admin/actions.js
 * gives: repeating the check in each action is one more chance to forget it.
 *
 * All four are called **directly** from the card, as ordinary async functions
 * from an event handler, rather than as `<form action={…}>`. That is not a
 * preference: two of them return a value the card has to display (the new code,
 * and the problem with a slug), and a form action's return value goes to
 * `useActionState`, which is a lot of machinery for two buttons. The one
 * consequence is that this page needs JavaScript — worth naming, since the
 * dashboard's kill switch deliberately does not.
 *
 * `generateCode` and `generateSlug` live in lib/code.js, which imports
 * `node:crypto`. That module is server-only, which is why the Random button is a
 * round trip rather than a client-side call — and why a random slug is generated
 * but *not* saved: you get to see it before it becomes a live URL.
 */
import { revalidatePath } from 'next/cache'
import { generateCode, generateSlug } from '@/lib/code'
import { normalizeSlug, slugProblem } from '@/lib/slug'
import { setSuitActive, setSuitCode, setSuitSlug } from '@/lib/suit-admin'
import { SUIT_KEYS } from '@/lib/suits'

/**
 * The suits page is the only cached surface that shows any of this. The chamber
 * route is `force-dynamic` (app/[slug]/page.jsx), so a slug change is live on the
 * next request with nothing to invalidate — which is worth knowing, because it
 * means rotating a leaked slug takes effect immediately and needs no deploy.
 */
function revalidateSuits() {
  revalidatePath('/admin/suits')
}

/**
 * Whether the suit is one of the five. A Server Action is a public endpoint, so
 * every parameter is attacker-controlled until checked — and this one is bound
 * straight into a `where` clause.
 */
function isSuit(value) {
  return SUIT_KEYS.includes(value)
}

/**
 * Rotates a chamber's code and hands the new one back.
 *
 * Returning it is the point of the whole page: you press this while looking at a
 * team's message asking for the code, and the number you have to type back is on
 * screen immediately. It is also why the code is plain text in the row rather
 * than a hash — a digest would make this button the only way to see a code ever
 * again, and the reason you are here is that someone lost the last one.
 *
 * @param {string} suit
 * @returns {Promise<{ ok: true, code: string } | { ok: false }>}
 */
export async function rotateCode(suit) {
  if (!isSuit(suit)) return { ok: false }

  const code = generateCode()
  await setSuitCode(suit, code)
  revalidateSuits()

  return { ok: true, code }
}

/**
 * A fresh slug, generated but not saved.
 *
 * Deliberately not a write. "Generate a random one" is an offer, not a decision,
 * and a button that silently re-pointed a live chamber's URL would be the most
 * dangerous control on the page — every team holding the old link would be
 * holding a 404, and nothing would have said so. The slug lands in the field and
 * the Save button is what commits it.
 */
export async function suggestSlug() {
  return { ok: true, slug: generateSlug() }
}

/**
 * Points a chamber at a new slug.
 *
 * Normalised and validated here rather than only in the browser. The card does
 * both as you type, which is what makes the field feel immediate — but the card
 * is a caller, not the boundary, and a `'use server'` module is a public
 * endpoint. The check that counts is the one the request cannot skip.
 *
 * @param {string} suit
 * @param {unknown} rawSlug
 * @returns {Promise<
 *   | { ok: true, slug: string }
 *   | { ok: false, reason: 'empty' | 'shape' | 'reserved' | 'taken' }
 *   | { ok: false }
 * >}
 */
export async function saveSlug(suit, rawSlug) {
  // No reason on this branch, unlike the ones below. An unknown suit is not
  // something the card can produce — it maps over the five keys — so this is the
  // endpoint being called by something that is not the card, and there is no
  // sentence for a person here because a person did not do this.
  if (!isSuit(suit)) return { ok: false }

  const slug = normalizeSlug(rawSlug)
  const problem = slugProblem(slug)
  if (problem) return { ok: false, reason: problem }

  const written = await setSuitSlug(suit, slug)
  if (!written.ok) return written

  revalidateSuits()

  // The normalised value goes back, not the raw one, so the field settles on
  // exactly what was stored — trailing space, capital letters and all removed.
  return { ok: true, slug }
}

/**
 * Retires a chamber or puts it back in service.
 *
 * Takes the state to move *to* rather than the state we are in, the same as the
 * dashboard's kill switch: a double submit from a stale page is then a no-op
 * instead of a flip back.
 *
 * @param {string} suit
 * @param {boolean} isActive
 * @returns {Promise<{ ok: true } | { ok: false }>}
 */
export async function setActive(suit, isActive) {
  if (!isSuit(suit)) return { ok: false }

  await setSuitActive(suit, isActive === true)
  revalidateSuits()

  return { ok: true }
}
