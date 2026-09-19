import { GlitchText } from '@/components/glitch/GlitchText'
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
        <p className="max-w-[32ch] text-lg">{META.tagline}</p>
      </Stack>
    </Container>
  )
}
