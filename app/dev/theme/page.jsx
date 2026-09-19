'use client'

import { useGlitch } from '@/components/glitch/GlitchProvider'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { Rule } from '@/components/ui/Rule'
import { Stack } from '@/components/ui/Stack'
import { cn } from '@/lib/cn'

// Scratch page for verifying the token layer (commit C2). Manual mode toggle
// until C3's oscillator owns data-mode. Not linked from anywhere.
//
// Class names below are written out in full on purpose: Tailwind scans source
// text, so a constructed name like `text-${step}` would never be generated.
const PALETTE = ['color-paper', 'color-ink', 'color-maroon', 'color-maroon-hot', 'color-maroon-deep', 'color-ash']
const SEMANTIC = ['bg', 'fg', 'rule', 'accent', 'accent-hot']

const SCALE = [
  { label: 'display', cls: 'text-display font-display' },
  { label: '5xl', cls: 'text-5xl' },
  { label: '4xl', cls: 'text-4xl' },
  { label: '3xl', cls: 'text-3xl' },
  { label: '2xl', cls: 'text-2xl' },
  { label: 'xl', cls: 'text-xl' },
  { label: 'lg', cls: 'text-lg' },
  { label: 'base', cls: 'text-base' },
  { label: 'sm', cls: 'text-sm' },
]

// Inline var() rather than a utility class, for the same reason.
function Swatch({ name }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-14 w-full border border-rule" style={{ background: `var(--${name})` }} />
      <span className="font-mono text-sm text-muted">--{name}</span>
    </div>
  )
}

export default function ThemeDevPage() {
  // Mode is owned by GlitchProvider as of C3. This page must not write
  // data-mode itself — two writers on the same attribute would fight, and the
  // provider's flip would silently undo whatever you set here.
  const { mode, setMode } = useGlitch()

  return (
    <Container className="py-10">
      <Stack gap="xl">
        <header>
          <h1 className="font-display text-4xl uppercase">Token scratch</h1>
          <p className="mt-2 text-sm text-muted">
            C2 verification page. Swap modes, check both, and focus the inputs on a real phone to
            confirm the page does not zoom.
          </p>
        </header>

        <Rule tone="accent" />

        <section>
          <h2 className="font-mono text-sm tracking-[0.15em] text-muted uppercase">Mode</h2>
          <div className="mt-4 flex gap-3">
            <Button variant={mode === 'good' ? 'primary' : 'ghost'} onClick={() => setMode('good')}>
              Good
            </Button>
            <Button variant={mode === 'bad' ? 'primary' : 'ghost'} onClick={() => setMode('bad')}>
              Bad
            </Button>
          </div>
        </section>

        <section>
          <h2 className="font-mono text-sm tracking-[0.15em] text-muted uppercase">Palette</h2>
          <p className="mt-2 text-sm text-muted">These must stay put when the mode flips.</p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {PALETTE.map((name) => (
              <Swatch key={name} name={name} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-mono text-sm tracking-[0.15em] text-muted uppercase">Semantic</h2>
          <p className="mt-2 text-sm text-muted">
            These must change when the mode flips. Nothing else on the site names a palette colour.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {SEMANTIC.map((name) => (
              <Swatch key={name} name={name} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-mono text-sm tracking-[0.15em] text-muted uppercase">Type scale</h2>
          <div className="mt-4 space-y-3">
            {SCALE.map(({ label, cls }) => (
              <div key={label} className="flex items-baseline gap-4">
                <span className="w-16 shrink-0 font-mono text-sm text-muted">{label}</span>
                <span className={cn('truncate', cls)}>Antardhaan</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            Body copy is Archivo. Maroon carries no paragraphs on ink — it lands at ~3.4:1, which is
            fine for rules and large decorative type and not fine for body text.
          </p>
          <p className="mt-2 font-mono text-sm">21:14:03 · SPADES · +00:12:47</p>
        </section>

        <section>
          <h2 className="font-mono text-sm tracking-[0.15em] text-muted uppercase">Controls</h2>
          <div className="mt-4 grid gap-3 sm:max-w-md">
            <Button>Primary action</Button>
            <Button variant="ghost">Secondary action</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="mt-6 grid gap-3 sm:max-w-md">
            <label className="font-mono text-sm text-muted" htmlFor="team">
              Team name
            </label>
            <input
              id="team"
              className="min-h-[52px] w-full border border-rule bg-transparent px-4 text-fg placeholder:text-muted"
              placeholder="Team Vortex"
              autoComplete="off"
            />
            <label className="font-mono text-sm text-muted" htmlFor="code">
              Code
            </label>
            <input
              id="code"
              className="min-h-[52px] w-full border border-rule bg-transparent px-4 font-mono tracking-[0.3em] uppercase"
              placeholder="XXXX-XXXX"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </section>

        <Rule />
        <p className="pb-[env(safe-area-inset-bottom)] font-mono text-sm text-muted">
          Safe-area padding applies here — on a notched phone this clears the home bar.
        </p>
      </Stack>
    </Container>
  )
}
