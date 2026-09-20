import char from '@/app/char.webp'

/**
 * The character, standing on the bottom edge of the hero with only its crown
 * crossing the wordmark.
 *
 * ONE <img>, AND THE ALPHA IS THE WHOLE MECHANISM. char.webp is a cutout: the
 * man is opaque, everything around him is transparent, so painting him above
 * the lockup is all it takes for the word and the halftone band to disappear
 * behind his shoulders. globals.css holds the positioning and the one filter
 * that flips his polarity for the ink frame.
 *
 * This file was briefly two elements — a frame carrying a luminance mask and an
 * <img> as a blend-mode fallback — on the reading that the art had a flat plate
 * behind the figure. It does not. Nothing here needs to remove a background
 * that was never there, and both of those paths would have made the cutout
 * worse rather than better: a blend on a transparent image is invisible, and a
 * luminance mask ignores alpha entirely, so it would have painted a flat
 * silhouette over a figure that already had its own detail. The lesson is in
 * globals.css in longer form, and it is worth keeping: a preview that shows a
 * grey rectangle behind a figure is showing the viewer's backdrop, not the
 * file.
 *
 * width and height COME FROM THE IMPORT and are passed through even though the
 * box is really sized by `height: var(--figure-h)` and `aspect-ratio` in CSS,
 * which win over the attributes' presentational hint. They are kept because the
 * box is what keeps the layout stable before the bytes land, and an <img> that
 * carries its own intrinsic size is the cheaper half of that insurance; the CSS
 * is the half that actually binds. A hand-written ratio in CSS can drift from
 * the art on a re-export, which is the one thing the import cannot protect.
 *
 * WHY THE ASSET IS IMPORTED FROM app/. It should be in `public/`, and that is a
 * one-line move; it is here because it was dropped there and the import is what
 * keeps it working untouched. The import is also what gets it hashed and
 * cache-busted, which for a 2160x2700 file on 500 phones is worth more than the
 * tidier path.
 *
 * `alt=""` because this is decoration. It is the event's face, but there is no
 * information in it — the <h1> beside it already says the word, and a screen
 * reader announcing an image of a masked man before the title would be noise.
 */
export function HeroFigure() {
  return (
    <img
      src={char.src}
      width={char.width}
      height={char.height}
      alt=""
      draggable={false}
      className="hero-figure"
    />
  )
}
