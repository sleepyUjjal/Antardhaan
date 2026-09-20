'use client'

import { useMemo, useState, useTransition } from 'react'
import { useGlitch } from '@/components/glitch/GlitchProvider'
import { GlitchText } from '@/components/glitch/GlitchText'
import { Button } from '@/components/ui/Button'
import { Rule } from '@/components/ui/Rule'
import { PRESETS, RANGE_PAIRS, TUNING_DEFAULTS, TUNING_RANGES, mergeTuning } from '@/lib/glitch'

/**
 * The knobs, from the venue.
 *
 * WHAT THIS PAGE IS FOR. The effect is dialled in against the real projector, in
 * the real room, at the real size — which is the one thing that cannot be done
 * from a laptop beforehand and the reason the effect is remotely tunable at all.
 * Drag something, watch it happen on the screen in front of you, publish.
 *
 * THE TWO SCOPES, because they are easy to confuse and confusing them is how you
 * spend ten minutes wondering why nothing is happening:
 *
 * - A knob move affects **this device only**, instantly. The provider is above
 *   this page, so the sliders are writing straight into the state that paints
 *   your screen. That is what makes tuning feel direct.
 * - **Publish** writes the row. Every other device picks it up when its 60-second
 *   copy expires — the plan's done-when is "within a minute", and that minute is
 *   the price of the edge cache that keeps 500 concurrent visitors off the
 *   database. Nothing here needs a redeploy.
 *
 * The freeze is the exception to the first rule: it publishes itself, because a
 * freeze you have to also remember to publish is a freeze that does not happen
 * when you need it.
 *
 * NO DEVICE PREVIEW FRAME, for the reason C3's panel gave and this one inherits:
 * the overlays are `position: fixed` to the real viewport, so a fake phone frame
 * would show them wrong. The page you are standing on is the preview.
 */

/**
 * The readouts are in each knob's own natural unit, which is not one unit. The
 * four CSS knobs are milliseconds and are read as milliseconds — 200ms is a value
 * you compare against another value at a glance. The signal-loss gap is not: at
 * thirty to sixty seconds, `30000ms` is a number you have to do arithmetic on
 * before it means anything, and the panel's job at 1 a.m. is to be read without
 * arithmetic. So it prints `30s`.
 */
const showMs = (value) => `${value}ms`

function showGap(ms) {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
}

const KNOBS = [
  { key: 'minFlipMs', label: 'Min flip', step: 200, format: showMs },
  { key: 'maxFlipMs', label: 'Max flip', step: 200, format: showMs },
  { key: 'tearMs', label: 'Tear', step: 20, format: showMs },
  { key: 'grainOpacity', label: 'Grain', step: 0.02, format: String },
  { key: 'scanlineOpacity', label: 'Scanlines', step: 0.05, format: String },
  // Named as a pair rather than as one "Flash every" slider, because it *is* a
  // pair: the flash lands at a random point between the two, which is what keeps
  // it a surprise rather than a metronome. One slider would have to either lose
  // the randomness or invent a spread around a midpoint, and both of those are
  // worse than a second row.
  { key: 'signalLossMinMs', label: 'Flash min gap', step: 1000, format: showGap },
  { key: 'signalLossMaxMs', label: 'Flash max gap', step: 1000, format: showGap },
]

const SECTION = 'font-mono text-xs tracking-[0.25em] text-muted uppercase'

function Readout({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-2">
      <span className="font-mono text-sm text-muted">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  )
}

/**
 * @param {{
 *   saved: object,
 *   publish: (value: object) => Promise<{ ok: boolean }>,
 *   reset: () => Promise<{ ok: boolean }>,
 *   freeze: (hold: 'good' | 'bad') => Promise<{ ok: boolean }>,
 *   release: () => Promise<{ ok: boolean }>,
 * }} props
 */
export function GlitchKnobs({ saved, publish, reset, freeze, release }) {
  const { tuning, setTuning, hold, mode, active, reducedMotion, paused } = useGlitch()
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState(null)

  // What the database holds, defaults filled in. `saved` is the raw partial, so
  // comparing it against `tuning` directly would call every un-overridden knob a
  // difference — the tuning always has every key and the stored blob usually has
  // none of them.
  const stored = useMemo(() => mergeTuning(saved), [saved])

  const dirty =
    KNOBS.some(({ key }) => tuning[key] !== stored[key]) ||
    (tuning.hold ?? null) !== (stored.hold ?? null)

  // Min must never cross max, or the jitter runs backwards through an inverted
  // interval — see the note in lib/glitch.js's sanitiser, which repairs the same
  // pairs on the way into the database. Here the *other* knob moves with the one
  // you are dragging, so the control never shows you an impossible pair.
  //
  // Driven by RANGE_PAIRS rather than by two hand-written `if`s per pair, so the
  // panel and the sanitiser agree about which keys pair up by construction. The
  // two hand-written cases this replaced were correct for the flip and would have
  // silently not existed for the signal-loss gap — dragging "Flash min gap" past
  // "Flash max gap" would have left the pair inverted on screen, and been quietly
  // repaired on publish, so the panel would show one thing and the room get
  // another.
  function setKnob(key, rawValue) {
    const value = Number(rawValue)
    setTuning((current) => {
      const next = { ...current, [key]: value }
      for (const [low, high] of RANGE_PAIRS) {
        if (key === low && next[low] > next[high]) next[high] = next[low]
        if (key === high && next[high] < next[low]) next[low] = next[high]
      }
      return next
    })
  }

  /** Local edit first — the screen answers immediately — then the row. */
  function applyPreset(values) {
    setTuning((current) => ({ ...current, ...values }))
    setStatus({ ok: true, text: 'Preset applied here. Publish to send it to every device.' })
  }

  function setHold(next) {
    // `hold: null` rather than deleting the key: the provider reads it with `??`,
    // and the row only ever loses the key when the release writes.
    setTuning((current) => ({ ...current, hold: next }))
    startTransition(async () => {
      const result = await (next === null ? release() : freeze(next))
      setStatus(
        result?.ok
          ? { ok: true, text: next === null ? 'Freeze released.' : `Frozen on ${next}.` }
          : { ok: false, text: 'That did not save. Check the connection and try again.' },
      )
    })
  }

  function publishNow() {
    startTransition(async () => {
      const result = await publish(tuning)
      setStatus(
        result?.ok
          ? { ok: true, text: 'Published. Every device picks this up within a minute.' }
          : { ok: false, text: 'That did not save. Check the connection and try again.' },
      )
    })
  }

  function resetNow() {
    setTuning(TUNING_DEFAULTS)
    startTransition(async () => {
      const result = await reset()
      setStatus(
        result?.ok
          ? { ok: true, text: 'Reset to the build defaults.' }
          : { ok: false, text: 'That did not save. Check the connection and try again.' },
      )
    })
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className={SECTION}>State</h2>
        <div className="mt-2">
          <Readout label="mode" value={mode} />
          <Readout label="oscillator" value={active ? 'running' : 'stopped'} />
          <Readout label="freeze" value={hold ?? 'released'} />
          <Readout label="prefers-reduced-motion" value={reducedMotion ? 'yes' : 'no'} />
          <Readout label="tab hidden" value={paused ? 'yes' : 'no'} />
        </div>

        {/* The first question when the effect looks stuck is which of the three
            things that can stop it is stopping it, and from here they are
            indistinguishable — a held route, a published freeze and a reduced-
            motion setting all produce a still page. */}
        {reducedMotion ? (
          <p className="mt-3 text-sm text-muted">
            This device has reduced motion enabled, so the oscillator is stopped and the page is
            locked to bad. That is not the freeze, and it overrides it — the knobs below will change
            nothing here, though they still change what everyone else sees.
          </p>
        ) : null}

        {!reducedMotion && hold ? (
          <p className="mt-3 text-sm text-accent-text">
            Frozen on {hold} for everyone. The flip will not move until this is released.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="ghost" className="sm:w-auto" onClick={() => setHold('good')}>
            Freeze good
          </Button>
          <Button variant="ghost" className="sm:w-auto" onClick={() => setHold('bad')}>
            Freeze bad
          </Button>
          <Button variant="ghost" className="sm:w-auto" onClick={() => setHold(null)}>
            Release
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted">
          A freeze publishes itself, because it is the control you reach for while something is going
          wrong. Good for reading the rules out; bad when the projector is struggling.
        </p>
      </section>

      <Rule />

      <section>
        <h2 className={SECTION}>Presets</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {PRESETS.map((preset) => (
            <Button
              key={preset.key}
              variant="ghost"
              className="sm:w-auto"
              onClick={() => applyPreset(preset.values)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          Rehearsal is the build defaults. A preset moves the knobs on this device only — copying its
          numbers into TUNING_DEFAULTS is what makes one permanent for everyone.
        </p>
      </section>

      <Rule />

      <section>
        <h2 className={SECTION}>Tuning</h2>
        <div className="mt-4 grid gap-5 sm:max-w-lg">
          {KNOBS.map(({ key, label, step, format }) => (
            <label key={key} className="grid gap-2">
              <span className="flex items-baseline justify-between font-mono text-sm">
                <span className="text-muted">{label}</span>
                <span className="tabular-nums">{format(tuning[key])}</span>
              </span>
              <input
                type="range"
                min={TUNING_RANGES[key].min}
                max={TUNING_RANGES[key].max}
                step={step}
                value={tuning[key]}
                onChange={(event) => setKnob(key, event.target.value)}
                className="w-full accent-[var(--accent)]"
              />
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          The sliders stop at the same limits the database enforces, so a knob cannot be dragged to a
          value that would be silently clamped on the way in. Dragging one half of a pair carries the
          other with it.
        </p>
        <p className="mt-3 text-sm text-muted">
          The two flash gaps are the rare full inversion — the moment the screen looks like it lost
          signal — as opposed to the flip, which is continuous. It fires at a random point between the
          two, so it stays a surprise. Any knob move redraws the schedule, which means a drag can push
          the next flash further out than the number you just set; stop dragging and the countdown
          starts again.
        </p>
      </section>

      <Rule />

      <section>
        <h2 className={SECTION}>Publish</h2>

        {/* The dirty line is the answer to "did that go anywhere", which is the
            question this whole page exists to make unnecessary. */}
        <p className={`mt-3 font-mono text-sm ${dirty ? 'text-accent-text' : 'text-muted'}`}>
          {dirty ? 'Not published — these values are on this device only.' : 'Matches what is live.'}
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button className="sm:w-auto" onClick={publishNow} disabled={pending}>
            {pending ? 'Saving…' : 'Publish to every device'}
          </Button>
          <Button variant="ghost" className="sm:w-auto" onClick={resetNow} disabled={pending}>
            Reset to defaults
          </Button>
        </div>

        {status ? (
          <p
            role="status"
            className={`mt-4 font-mono text-sm ${status.ok ? 'text-muted' : 'text-accent-text'}`}
          >
            {status.text}
          </p>
        ) : null}

        <p className="mt-3 text-sm text-muted">
          Reset writes an empty override rather than a copy of the current defaults, so a knob added
          later still reaches every device that has not overridden it. It releases a freeze as well,
          because the freeze lives in the same override — worth knowing before you press it while the
          room is frozen.
        </p>
      </section>

      <Rule />

      <section>
        <h2 className={SECTION}>This page is the preview</h2>
        <GlitchText as="p" className="mt-4 font-display text-3xl uppercase">
          Antardhaan
        </GlitchText>
        <p className="mt-3 text-sm text-muted">
          The overlays are fixed to the real viewport, so there is no preview frame here to be wrong —
          what you are looking at is what the room sees. Tap the word to tear it manually.
        </p>
      </section>
    </div>
  )
}
