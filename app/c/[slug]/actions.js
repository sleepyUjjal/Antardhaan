'use server'

/**
 * The chamber Server Action — the boundary, and nothing else.
 *
 * A `'use server'` module makes *every* export a publicly callable endpoint, so
 * the only thing exported here is the one function the form is allowed to call.
 * The logic it delegates to lives in lib/submissions.js, where it can be read
 * and tested without that rule applying to it.
 */
import { recordSubmission } from '@/lib/submissions'

/**
 * `prevState` is unused, and it is not a mistake — it is the first half of the
 * contract `useActionState` calls this with, `(prevState, formData)`. The form
 * has no use for a previous result because every submission returns the whole
 * outcome, but dropping the parameter would shift `formData` into its place and
 * silently feed the action a state object instead of the form.
 *
 * @param {unknown} prevState
 * @param {FormData} formData
 */
export async function submitEntry(prevState, formData) {
  return recordSubmission({
    slug: formData.get('slug'),
    teamName: formData.get('teamName'),
    code: formData.get('code'),
  })
}
