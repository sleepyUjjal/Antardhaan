/**
 * Spade — a heart inverted, with a stem.
 *
 * The body is the heart path mirrored vertically about y=48 (every y becomes
 * 96 - y), so the chin that pointed down becomes the tip that points up and the
 * two shoulders become the wide base. Body and stem are separate elements rather
 * than one combined path because they overlap where they meet: two shapes with
 * the same fill merge visually, while a single path with two subpaths would need
 * their winding directions to agree or the overlap would punch a hole.
 */
export function Spade() {
  return (
    <>
      <path d="M50 8C50 8 92 36 92 62C92 78 78 88 66 88C58 88 52 83 50 78C48 83 42 88 34 88C22 88 8 78 8 62C8 36 50 8 50 8Z" />
      <path d="M50 58L38 82C36 90 31 94 24 94L76 94C69 94 64 90 62 82Z" />
    </>
  )
}
