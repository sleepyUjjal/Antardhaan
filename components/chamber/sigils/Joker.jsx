/**
 * Joker — a five-pointed star.
 *
 * The fifth suit has no card glyph, so it borrows the jester's star, which is
 * also what lib/suits.js uses for it on the landing page. A star rather than a
 * drawn jester's cap on purpose: a cap is three curved points and two dips, and
 * hand-authored curves for that read as a lumpy blob at hero scale with nothing
 * to check them against. A star is ten exact points, so it is correct by
 * construction. Swap it here if a proper sigil gets drawn — nothing else knows
 * this shape.
 *
 * Outer radius 46, inner 18.5, first point at the top, alternating every 36
 * degrees around (50, 50).
 */
export function Joker() {
  return (
    <path d="M50 4L60.9 35L93.8 35.8L67.6 55.7L77 87.2L50 68.5L23 87.2L32.4 55.7L6.2 35.8L39.1 35Z" />
  )
}
