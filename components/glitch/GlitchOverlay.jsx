/**
 * The overlay stack. Fixed, full-viewport, and completely inert to input.
 *
 * Server component on purpose — it has no state, and every effect it renders is
 * driven by classes the provider puts on <html>.
 *
 * Two structural rules here, both load-bearing:
 *
 * 1. These must be siblings of .glitch-content, never inside it. A transform on
 *    an ancestor would make that ancestor the containing block for these fixed
 *    layers, and they would scroll with the page.
 *
 * 2. The two layers using mix-blend-mode are outside .glitch-layer, not inside
 *    it. `position: fixed` forms its own stacking context, and mix-blend-mode
 *    only blends with the backdrop *within* the nearest one — so a blended layer
 *    nested in .glitch-layer would blend against the other overlay layers
 *    instead of the page. The inversion flash would read as a white flash, and
 *    the grain would sit on top of the page unblended.
 */
export function GlitchOverlay() {
  return (
    <>
      <div className="glitch-layer" aria-hidden="true">
        <div className="glitch-scanlines" />
        <div className="glitch-tear" />
        <div className="glitch-vignette" />
      </div>
      <div className="glitch-grain" aria-hidden="true" />
      <div className="glitch-flash" aria-hidden="true" />
    </>
  )
}
