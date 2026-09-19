/**
 * Club — three lobes on a stem.
 *
 * Lobes are `<circle>` elements rather than arc segments in a path: a circle is
 * exactly a circle at any scale, and the union of three of them with the stem
 * below needs no boolean geometry to look right.
 *
 * The stem's apex is at y=48, inside the top lobe (radius 21 about y=30 puts its
 * lower edge at y=51). Pulling it any lower than that leaves the apex floating
 * in the small curvilinear gap the three circles leave at their centre, and the
 * stem reads as detached. Where it crosses the two lower lobes it is hidden by
 * them, which is what produces the notches on either side.
 */
export function Club() {
  return (
    <>
      <circle cx="50" cy="30" r="21" />
      <circle cx="27" cy="60" r="21" />
      <circle cx="73" cy="60" r="21" />
      <path d="M50 48L38 82C36 90 31 94 24 94L76 94C69 94 64 90 62 82Z" />
    </>
  )
}
