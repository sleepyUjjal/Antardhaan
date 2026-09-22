import { GlitchText } from '@/components/glitch/GlitchText'
import { HeroMark } from '@/components/landing/HeroMark'
import { Container } from '@/components/ui/Container'
import { Stack } from '@/components/ui/Stack'
import { cn } from '@/lib/cn'

/**
 * The landing page's entire editorial surface: two strings, in one place.
 *
 * Deliberately not in the database. This page is static and must stay static
 * (§9) — the copy is presentation, the same way suit labels are (§3).
 *
 * The tagline is a placeholder — see §13. Anything that named a chamber, a
 * suit count, or a time would be a hint, and this page is a decoy.
 *
 * The poster this page's composition comes from carries its own line under the
 * wordmark — NOTHING IS WHAT IT SEEMS, in the same wide-tracked uppercase the
 * fest line is set in. It is a better fit for the glitch than the placeholder is
 * and it is one string to swap in, but it is the client's copy and not the
 * poster's job to decide, so the placeholder stays until someone says otherwise.
 */
export const META = {
  fest: 'MRIDANG 2K26',
  tagline: 'What disappears does not always leave.',
}

export function EventMeta({ className }) {
  return (
    <Container className={cn('relative', className)}>
      <Stack as="section" gap="sm">
        {/* text-accent-text, not text-accent: maroon as a *foreground* on ink
            is 1.8:1 and would be invisible half the time. See globals.css. */}
        <GlitchText as="p" className="font-mono text-sm tracking-[0.35em] text-accent-text uppercase">
          {META.fest}
        </GlitchText>

        {/* The poster's bottom band. It is a halftone screen rather than the
            solid <Rule> used everywhere else on the site, because this is the
            one line that is allowed to look like it came off a press — and
            aria-hidden, because a screen reader has nothing to do with a row of
            dots. */}
        <div aria-hidden="true" className="halftone h-3 text-accent-text opacity-60" />

        <div className="hero-meta-tagline-row">
          <p className="max-w-[32ch] text-lg">{META.tagline}</p>
          <HeroMark className="hero-mark-in-meta" />
        </div>
      </Stack>
    </Container>
  )
}
