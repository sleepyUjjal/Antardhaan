'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Rule } from '@/components/ui/Rule'
import { normalizeSlug, slugProblem, slugProblemText } from '@/lib/slug'
import { normalizeCode, codeProblem, codeProblemText } from '@/lib/code'

/**
 * One chamber, and everything you can do to it.
 *
 * THE SHAPE IS A CARD, NOT A ROW OF A TABLE, and that is the whole design. Five
 * suits by four controls is a twenty-cell table, which on a 375px screen is
 * either a horizontal scroll or a font nobody can read one-handed in a corridor.
 * A card per suit stacks, and every control in it is full-width and 52px tall
 * because that is what a thumb can hit.
 *
 * THE CODES ARE ON SCREEN, which is the one place in the project they are. §7
 * keeps them out of every participant surface by never selecting the column; this
 * page selects it deliberately, because the reason to re-read a code is that
 * someone lost the last one. The trade is stated rather than hidden: this route
 * is behind the proxy guard, and the card is the only consumer of
 * `getSuitConfig`'s result.
 *
 * EVERY ACTION IS A DIRECT CALL, not a form. Two of them return a value the card
 * has to show — the new code, and the reason a slug was rejected — and routing
 * that through `useActionState` would be machinery for two buttons. The cost is
 * that this page needs JavaScript, which is worth knowing on the device with 2%
 * battery: the console's kill switch works without it, and this does not.
 *
 * @param {{
 *   suit: string,
 *   label: string,
 *   glyph: string,
 *   slug: string,
 *   code: string,
 *   isActive: boolean,
 *   siteUrl: string,
 *   suggest: () => Promise<{ ok: boolean, slug?: string }>,
 *   save: (suit: string, slug: string) => Promise<{ ok: boolean, reason?: string }>,
 *   suggestCode: () => Promise<{ ok: boolean, code?: string }>,
 *   saveCode: (suit: string, code: string) => Promise<{ ok: boolean, reason?: string, code?: string }>,
 *   setActive: (suit: string, isActive: boolean) => Promise<{ ok: boolean }>,
 * }} props
 */

const LABEL = 'font-mono text-xs uppercase tracking-[0.25em] text-muted'

const READOUT =
  'block border border-rule bg-transparent px-3 py-2 font-mono text-sm break-all select-all'

export function SuitCard({
  suit,
  label,
  glyph,
  slug,
  code,
  isActive,
  siteUrl,
  suggest,
  save,
  suggestCode,
  saveCode,
  setActive,
}) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState(null)

  // The draft is the only local state, and it starts as the saved slug. A
  // `slug` prop that changes underneath it — because the save revalidated the
  // page — needs no reset: a successful save returns the normalised value, which
  // is what the draft already holds, so they agree by construction.
  const [draft, setDraft] = useState(slug)
  const [draftCode, setDraftCode] = useState(code)

  const codeProb = codeProblem(draftCode)
  const codeDirty = draftCode !== code
  const codeProbText = codeProblemText(codeProb)


  // Normalised as you type, which is not a nicety on a phone. Autocorrect adds
  // trailing spaces and the keyboard capitalises the first letter of anything, so
  // a field that stored what it was given would reject `The-mirror ` for two
  // reasons the person did not choose. Normalising on input also means the value
  // tested below is exactly the value that would be saved.
  const problem = slugProblem(draft)
  const dirty = draft !== slug
  const problemText = slugProblemText(problem)

  /** The full URL a team types. Not a secret, and not a slug on its own. */
  const chamberUrl = `${siteUrl}/${slug}`

  async function copy(text, what) {
    // `navigator.clipboard` is undefined outside a secure context, which is the
    // case on http://<lan-ip>:3000 during a run-through and never on the deployed
    // site. The fallback is not a second clipboard implementation, because there
    // is no such thing that works reliably — it is a sentence telling you to
    // select the value, which is why both readouts above are `select-all`.
    try {
      if (!navigator.clipboard) throw new Error('no clipboard api')
      await navigator.clipboard.writeText(text)
      setStatus({ ok: true, text: `${what} copied.` })
    } catch {
      setStatus({ ok: false, text: `Could not copy automatically. Select the ${what} and copy it.` })
    }
  }

  function suggestCodeNow() {
    startTransition(async () => {
      const result = await suggestCode()
      if (!result?.ok) {
        setStatus({ ok: false, text: 'Could not generate one. Check the connection and try again.' })
        return
      }
      setDraftCode(result.code)
      setStatus({ ok: true, text: 'Generated. Nothing is saved until you press Save code.' })
    })
  }

  function saveCodeNow() {
    startTransition(async () => {
      const result = await saveCode(suit, draftCode)
      if (result?.ok) {
        setStatus({ ok: true, text: 'Code saved. The old code stopped working immediately.' })
        return
      }
      setStatus({
        ok: false,
        text: codeProblemText(result?.reason) ?? 'That did not save. Check the connection and try again.',
      })
    })
  }

  function suggestNow() {
    startTransition(async () => {
      const result = await suggest()
      if (!result?.ok) {
        setStatus({ ok: false, text: 'Could not generate one. Check the connection and try again.' })
        return
      }
      // Fills the field rather than saving. A button that silently re-pointed a
      // live chamber would leave every team holding the old URL with a 404.
      setDraft(result.slug)
      setStatus({ ok: true, text: 'Generated. Nothing is saved until you press Save slug.' })
    })
  }

  function saveNow() {
    startTransition(async () => {
      const result = await save(suit, draft)
      if (result?.ok) {
        setStatus({ ok: true, text: 'Slug saved. The old URL stops resolving immediately.' })
        return
      }
      setStatus({
        ok: false,
        text:
          result?.reason === 'taken'
            ? 'Another chamber already uses that slug. Try another.'
            : (slugProblemText(result?.reason) ?? 'That did not save. Check the connection and try again.'),
      })
    })
  }

  function toggleActive() {
    startTransition(async () => {
      const result = await setActive(suit, !isActive)
      setStatus(
        result?.ok
          ? {
              ok: true,
              text: isActive
                ? 'Retired. The URL now 404s like any other wrong one, and the submissions are kept.'
                : 'Back in service. The URL works again.',
            }
          : { ok: false, text: 'That did not save. Check the connection and try again.' },
      )
    })
  }

  return (
    <div className="border border-rule p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="flex items-baseline gap-3">
          <span aria-hidden="true" className="text-2xl leading-none">
            {glyph}
          </span>
          <span className="font-display text-xl uppercase leading-none tracking-tight">{label}</span>
        </h2>

        {/* A word, not a colour. "Retired" and "In service" are the two states the
            button below moves between, and reading one is the entire verification
            that the button did something — which matters most for the one that
            makes a live URL stop working. */}
        <p
          className={`font-mono text-xs tracking-[0.25em] uppercase ${
            isActive ? 'text-muted' : 'text-accent-text'
          }`}
        >
          {isActive ? 'In service' : 'Retired'}
        </p>
      </div>

      <div className="mt-3">
        <Rule tone={isActive ? 'rule' : 'accent'} />
      </div>

      <div className="mt-4 flex flex-col gap-5">
        <div>
          <p className={LABEL}>Chamber URL</p>
          {/* `break-all` rather than `truncate`: a URL that wraps onto two lines
              is readable and copyable by hand, and one with its tail cut off is
              neither. `select-all` so a long-press selects the whole thing. */}
          <p className={`mt-2 ${READOUT}`}>{chamberUrl}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {/* Copies the *saved* slug, never the draft. If you have typed a new
                one and not saved it, the URL that works is still this one, and a
                copy button that handed out an unsaved URL would be the identical
                mistake to Generate-then-save in one tap. */}
            <Button variant="ghost" className="sm:w-auto" onClick={() => copy(chamberUrl, 'URL')}>
              Copy URL
            </Button>
          </div>
        </div>

        <div>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Code</span>
            <input
              value={draftCode}
              onChange={(event) => setDraftCode(normalizeCode(event.target.value))}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              className="border border-rule bg-transparent px-4 py-3 font-mono text-fg tracking-[0.3em]"
            />
          </label>

          {codeProb && codeDirty ? <p className="mt-2 text-sm text-accent-text">{codeProbText}</p> : null}

          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="ghost" className="sm:w-auto" onClick={() => copy(code, 'code')}>
              Copy code
            </Button>
            <Button variant="ghost" className="sm:w-auto" onClick={suggestCodeNow} disabled={pending}>
              Random
            </Button>
            <Button
              variant="ghost"
              className="sm:w-auto"
              onClick={saveCodeNow}
              disabled={pending || codeProb !== null || !codeDirty}
            >
              {codeDirty ? 'Save code' : 'Saved'}
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted">
            The old code stops working the moment this saves. There is no going back to it.
          </p>
        </div>

        <div>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Slug</span>
            <input
              value={draft}
              onChange={(event) => setDraft(normalizeSlug(event.target.value))}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              className="border border-rule bg-transparent px-4 py-3 font-mono text-fg"
            />
          </label>

          {/* The reason, while you type it — which is the whole point of keeping
              the rules in a module the browser can import. A reserved word here
              is a chamber that would save cleanly and then never resolve. */}
          {problem && dirty ? <p className="mt-2 text-sm text-accent-text">{problemText}</p> : null}

          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="ghost" className="sm:w-auto" onClick={suggestNow} disabled={pending}>
              Random
            </Button>
            <Button
              variant="ghost"
              className="sm:w-auto"
              onClick={saveNow}
              disabled={pending || problem !== null || !dirty}
            >
              {dirty ? 'Save slug' : 'Saved'}
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted">
            Saving moves the chamber. Every team holding the old URL gets the same 404 as any other
            wrong address, and the solves already recorded keep their times.
          </p>
        </div>

        <div>
          <Button variant="ghost" onClick={toggleActive} disabled={pending}>
            {isActive ? 'Retire this chamber' : 'Put it back in service'}
          </Button>
          <p className="mt-3 text-sm text-muted">
            Retiring is not deleting. Nothing is removed from the board — it stops the URL resolving,
            which is what you want when one has leaked.
          </p>
        </div>

        {status ? (
          <p
            role="status"
            className={`font-mono text-sm ${status.ok ? 'text-muted' : 'text-accent-text'}`}
          >
            {status.text}
          </p>
        ) : null}
      </div>
    </div>
  )
}
