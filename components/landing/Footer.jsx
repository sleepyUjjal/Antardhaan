import { Container } from '@/components/ui/Container'
import { Rule } from '@/components/ui/Rule'

/**
 * No links — here or anywhere else on this page.
 *
 * A maroon rule is also where the accent survives bad mode best: a hairline is
 * decoration, so it keeps the true maroon in both modes, while text gets the
 * lightened --accent-text (globals.css).
 */
export function Footer() {
  return (
    <footer className="relative mt-20 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Container>
        <Rule tone="accent" />
        <div className="mt-4 flex items-baseline justify-between gap-4 font-mono text-xs tracking-[0.2em] text-muted uppercase">
          <span>Antardhaan</span>
          <span>Mridang 2k26</span>
        </div>
      </Container>
    </footer>
  )
}
