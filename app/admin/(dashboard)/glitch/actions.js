'use server'

/**
 * The glitch controller's Server Actions.
 *
 * These arrive over the wire as POSTs to `/admin/glitch` — and to `/admin`, for
 * `releaseGlitch`, which the console's hold banner also uses — so they sit behind
 * the same proxy guard as the pages themselves. There is no auth check here for
 * the reason app/admin/actions.js gives: repeating the check in each action is a
 * fourth chance to forget one.
 *
 * Called two different ways, and the difference is visible in the signatures.
 * The panel calls the first three **directly**, as ordinary async functions from
 * an event handler, because the value it publishes is the object it is holding in
 * React state — threading that through a hidden form field as JSON would be a
 * serialisation step with no purpose but ceremony. `releaseGlitch` is also used as
 * a `<form action={…}>` from the dashboard banner, so it takes no arguments and
 * ignores the FormData Next hands it.
 */
import { revalidatePath } from 'next/cache'
import { setGlitchHold, setGlitchTuning } from '@/lib/event'
import { HOLDS } from '@/lib/glitch'

/**
 * Both surfaces that show glitch state: the panel itself, and the console
 * dashboard, whose hold banner has to appear and disappear with the freeze.
 */
function revalidateGlitch() {
  revalidatePath('/admin/glitch')
  revalidatePath('/admin')
}

/**
 * Publishes a tuning override to every device.
 *
 * Not validated here. `setGlitchTuning` sanitises inside lib/event.js, at the last
 * gate before the row is written, which is the only place a check cannot be
 * bypassed — this module is a public endpoint by construction, so a validation
 * that lives here is a validation that lives in one caller out of however many
 * there turn out to be.
 *
 * @param {unknown} value the panel's tuning object
 * @returns {Promise<{ ok: true }>}
 */
export async function publishTuning(value) {
  await setGlitchTuning(value)
  revalidateGlitch()
  return { ok: true }
}

/**
 * Back to the build defaults — and `{}` rather than a copy of them, which is the
 * entire reason `event.glitch` is a partial override instead of a snapshot. A
 * copied snapshot would pin the site to September's numbers, so a knob added in a
 * later commit would be missing from every device until someone pressed Reset
 * again, and a change to `TUNING_DEFAULTS` would reach nobody.
 */
export async function resetTuning() {
  await setGlitchTuning({})
  revalidateGlitch()
  return { ok: true }
}

/**
 * Freezes the flip on one frame, for the whole room.
 *
 * Validated here rather than in lib/event.js, unlike the tuning — the difference
 * is that this one is not a number with a range, it is three legal values, and
 * the SQL it becomes (`glitch || '{"hold":"…"}'`) interpolates the value into the
 * jsonb it writes. An unvalidated string there is a value written into the row
 * that the read path would then have to drop.
 *
 * @param {'good' | 'bad'} hold
 */
export async function freezeGlitch(hold) {
  if (!HOLDS.includes(hold)) return { ok: false }
  await setGlitchHold(hold)
  revalidateGlitch()
  return { ok: true }
}

/**
 * Releases the freeze. Reachable from the console banner as well as the panel,
 * because a global freeze you have forgotten about looks exactly like a bug — the
 * effect is stuck and nothing on the page says why — so the release has to be
 * where the reminder is.
 *
 * Takes no arguments, which is what lets it be both a form action and a direct
 * call.
 */
export async function releaseGlitch() {
  await setGlitchHold(null)
  revalidateGlitch()
  return { ok: true }
}
