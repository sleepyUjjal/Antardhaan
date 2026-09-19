'use client'

import { GlitchText } from '@/components/glitch/GlitchText'
import { useGlitch } from '@/components/glitch/GlitchProvider'
import { useScramble } from '@/components/glitch/useScramble'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { Rule } from '@/components/ui/Rule'
import { Stack } from '@/components/ui/Stack'
import { TUNING_DEFAULTS } from '@/lib/glitch'

// Tuning surface for the glitch engine (commit C3). Drives the root provider's
// tuning state, which is why there is no second provider here — two providers
// would both write data-mode on <html> and fight over it.
//
// There is deliberately no device-width preview frame: the overlays are
// position:fixed to the real viewport, so a fake frame would show them wrong
// and teach you the wrong thing. Use real device emulation instead.
const KNOBS = [
  { key: 'minFlipMs', label: 'Min flip', min: 800, max: 20000, step: 200, unit: 'ms' },
  { key: 'maxFlipMs', label: 'Max flip', min: 800, max: 30000, step: 200, unit: 'ms' },
  { key: 'tearMs', label: 'Tear', min: 60, max: 900, step: 20, unit: 'ms' },
  { key: 'grainOpacity', label: 'Grain', min: 0, max: 0.6, step: 0.02, unit: '' },
  { key: 'scanlineOpacity', label: 'Scanlines', min: 0, max: 1, step: 0.05, unit: '' },
]

function Readout({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-2">
      <span className="font-mono text-sm text-ash">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  )
}

export default function GlitchDevPage() {
  const { mode, flip, setMode, reducedMotion, paused, active, tuning, setTuning } = useGlitch()
  const scrambled = useScramble('ANTARDHAAN', { enabled: !reducedMotion })

  // Min must never cross max, or the jitter collapses to a fixed interval.
  function setKnob(key, rawValue) {
    const value = Number(rawValue)
    setTuning((current) => {
      const next = { ...current, [key]: value }
      if (key === 'minFlipMs' && value > current.maxFlipMs) next.maxFlipMs = value
      if (key === 'maxFlipMs' && value < current.minFlipMs) next.minFlipMs = value
      return next
    })
  }

  return (
    <Container className="py-10">
      <Stack gap="xl">
        <header>
          <GlitchText as="h1" className="font-display text-4xl uppercase">
            Glitch control
          </GlitchText>
          <p className="mt-2 text-sm text-ash">
            C3 verification page. Tap the heading to tear it manually. Tune the knobs here on the
            venue hardware, then copy the values into TUNING_DEFAULTS.
          </p>
        </header>

        <Rule tone="accent" />

        <section>
          <h2 className="font-mono text-sm tracking-[0.15em] text-ash uppercase">State</h2>
          <div className="mt-2">
            <Readout label="mode" value={mode} />
            <Readout label="oscillator" value={active ? 'running' : 'stopped'} />
            <Readout label="prefers-reduced-motion" value={reducedMotion ? 'yes' : 'no'} />
            <Readout label="tab hidden" value={paused ? 'yes' : 'no'} />
          </div>
          <p className="mt-3 text-sm text-ash">
            Under reduced motion the oscillator stops and the page locks to bad. The CSS rule in
            globals.css cannot do that on its own — the flip is an attribute change, not an
            animation — which is why it is handled in the provider.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button className="sm:w-auto" onClick={flip}>
              Force flip
            </Button>
            <Button variant="ghost" className="sm:w-auto" onClick={() => setMode('good')}>
              Lock good
            </Button>
            <Button variant="ghost" className="sm:w-auto" onClick={() => setMode('bad')}>
              Lock bad
            </Button>
          </div>
        </section>

        <section>
          <h2 className="font-mono text-sm tracking-[0.15em] text-ash uppercase">Tuning</h2>
          <div className="mt-4 grid gap-5 sm:max-w-lg">
            {KNOBS.map(({ key, label, min, max, step, unit }) => (
              <label key={key} className="grid gap-2">
                <span className="flex items-baseline justify-between font-mono text-sm">
                  <span className="text-ash">{label}</span>
                  <span>
                    {tuning[key]}
                    {unit}
                  </span>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={tuning[key]}
                  onChange={(event) => setKnob(key, event.target.value)}
                  className="w-full accent-[var(--accent)]"
                />
              </label>
            ))}
          </div>
          <Button
            variant="ghost"
            className="mt-5 sm:w-auto"
            onClick={() => setTuning(TUNING_DEFAULTS)}
          >
            Reset to defaults
          </Button>
        </section>

        <section>
          <h2 className="font-mono text-sm tracking-[0.15em] text-ash uppercase">Scramble</h2>
          <p className="mt-2 font-display text-5xl uppercase">{scrambled}</p>
          <p className="mt-2 text-sm text-ash">
            Resolves from a glyph pool over ~700ms. Disabled under reduced motion, and the initial
            render is the real text so SSR and hydration agree.
          </p>
        </section>

        <section>
          <h2 className="font-mono text-sm tracking-[0.15em] text-ash uppercase">Text glitch</h2>
          <div className="mt-3 space-y-4">
            <GlitchText as="p" className="font-display text-3xl uppercase">
              Spades
            </GlitchText>
            <GlitchText as="p" className="font-display text-3xl uppercase">
              Joker
            </GlitchText>
            <p className="text-sm text-ash">
              The maroon fringe is permanent. The slice animation fires on tap and during a tear.
            </p>
          </div>
        </section>

        <Rule />
        <p className="pb-[env(safe-area-inset-bottom)] font-mono text-sm text-ash">
          On a phone, scanlines and grain are hidden — verified by resizing below 768px.
        </p>
      </Stack>
    </Container>
  )
}
