/**
 * Heart — two lobes and a chin, in one path.
 *
 * Drawn entirely with cubics rather than arcs: an arc's large-arc and sweep
 * flags are the part of SVG path syntax that silently renders inside out when a
 * coordinate moves, and this shape gets mirrored to build the spade.
 */
export function Heart() {
  return (
    <path d="M50 88C50 88 8 60 8 34C8 18 22 8 34 8C42 8 48 13 50 18C52 13 58 8 66 8C78 8 92 18 92 34C92 60 50 88 50 88Z" />
  )
}
