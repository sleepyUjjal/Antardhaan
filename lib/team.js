/**
 * Team-name normalization.
 *
 * Turns whatever someone typed into a stable grouping key, so that "Team
 * Vortex", "team  vortex" and "TEAM VORTEX!" are one team on the board rather
 * than three. This is the only logic in the project whose failure is invisible:
 * a bug here does not throw, it quietly shows two rows for one team in front of
 * everyone (§12). Hence the tests next door.
 *
 * Pure string in, plain object out — no database, no React, no clock.
 */

/** Longest accepted name, counted in code points after trimming. */
export const MAX_TEAM_NAME_LENGTH = 40

// Accent folding: "Café" and "Cafe" are one team. NFD splits "é" into "e" plus
// a combining accent, and this keeps the base letter while dropping the marks.
//
// Latin-only, deliberately, rather than the obvious `\p{M}`. `\p{M}` is every
// combining mark in Unicode, which includes the Devanagari matras and the
// Arabic and Hebrew vowel points — characters that are part of a letter, not
// decoration on one. Stripping those turns "टीम" into "टम" and would split
// every Hindi-named team at the event. Anchoring the match on a Latin base
// means the fold can only ever apply where it is wanted.
//
// NFD is still required first: "é" is one code point until it is decomposed,
// so without it there is no mark to find and no fold to make.
const LATIN_ACCENTS = /(\p{Script=Latin})\p{M}+/gu

// Apostrophes are deleted, not turned into a space, and they are the only
// punctuation to get that treatment. "Bob's Boys" and "Bobs Boys" are one team
// spelling one name, and the entire purpose of this file is that they land in
// one row. The general rule below would give "bob s boys" and "bobs boys" and
// split them — the bug this file exists to prevent, reintroduced by its own
// fallback.
const APOSTROPHES = /['’‘`´]/g

// Everything that is not a letter, a digit, or a combining mark becomes a
// single space. The `+` collapses a run of punctuation and whitespace in one
// step, so "Team - Vortex" and "Team Vortex" agree without a second pass.
//
// `\p{M}` belongs in the class because a Devanagari matra survives the step
// above and is part of its word — dropping it here would undo that fix and give
// "ट म".
//
// Unicode property escapes rather than [a-z0-9]: a team that names itself in
// Devanagari keeps its letters, instead of normalizing to nothing and being
// rejected outright.
const NON_ALPHANUMERIC = /[^\p{L}\p{N}\p{M}]+/gu

/** Runs of whitespace become one space, so the display value reads as typed. */
const WHITESPACE_RUN = /\s+/g

/**
 * Parses a raw team name into the two forms the database needs.
 *
 * Returns `null` rather than throwing for every rejection. The caller is a
 * Server Action validating one form field, and its failure path is already a
 * returned object (C7) — an exception here would have to be caught and
 * converted back into that same object, which is ceremony around a value the
 * function already knows.
 *
 * The single `null` does mean the caller cannot tell "too long" from "empty",
 * and C7 shows one message for both. That is deliberate: neither is recoverable
 * from the caller's side, and a name that normalizes to nothing is not a case
 * worth its own sentence.
 *
 * @param {unknown} raw
 * @returns {{ displayName: string, slug: string } | null}
 */
export function parseTeamName(raw) {
  if (typeof raw !== 'string') return null

  // Collapse whitespace for display too, not only for the slug. "Team  Vortex"
  // is a double-tap on the space bar, not a decision, and it should not survive
  // into the standings. Punctuation is left alone here — the exclamation mark
  // in "Team Vortex!" is something someone chose to type, and `team_name` is
  // the value that keeps what they typed.
  const displayName = raw.trim().replace(WHITESPACE_RUN, ' ')
  if (displayName === '') return null

  // Code points, not `.length`. An emoji is one character to the person who
  // typed it and two UTF-16 units to `.length`, so measuring the string the
  // obvious way would reject a 31-character name for being 56 long.
  if ([...displayName].length > MAX_TEAM_NAME_LENGTH) return null

  const slug = displayName
    .normalize('NFD')
    .replace(LATIN_ACCENTS, '$1')
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(NON_ALPHANUMERIC, ' ')
    .trim()

  // A name of pure punctuation, pure emoji, or a script this normalization
  // strips entirely leaves nothing to group on. There is no slug that would
  // match it, so every submission of it would be its own row.
  if (slug === '') return null

  return { displayName, slug }
}
