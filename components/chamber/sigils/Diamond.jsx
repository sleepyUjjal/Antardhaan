/**
 * Diamond — a rhombus. Four points, no curves.
 *
 * Inset by 6 rather than 0 because a shape that touches the viewBox edge looks
 * cropped rather than composed, and the four suit sigils sit next to each other
 * at different sizes on the admin screens.
 */
export function Diamond() {
  return <path d="M50 6L94 50L50 94L6 50Z" />
}
