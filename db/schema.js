/**
 * The Drizzle schema. This file is the source of truth for the database —
 * db/migrations is generated from it, never edited by hand.
 *
 * Shape and the reasoning behind it: implementation.md §3.
 */
import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

/**
 * The five suits. A Postgres enum rather than a lookup table or a text column,
 * so an invalid suit cannot be inserted at all — the database refuses it rather
 * than a validation function somewhere having to remember to.
 *
 * These five strings are written out literally, and deliberately not imported
 * from lib/suits.js. drizzle-kit bundles and evaluates this file to generate
 * migrations, and a value it has to resolve through another module is a moving
 * part in the one place that must not have any. The two lists must stay in
 * sync; lib/suits.js carries the display side of the same five keys.
 */
export const suitKey = pgEnum('suit_key', ['SPADES', 'CLUBS', 'DIAMONDS', 'HEARTS', 'JOKER'])

/**
 * One row, forever. `event_singleton` is what makes that true in the database
 * rather than in a convention — without it, a stray insert makes a second event
 * row and every `cross join event` in §6 silently doubles its results.
 */
export const event = pgTable(
  'event',
  {
    id: integer('id').primaryKey().default(1),
    startTime: timestamp('start_time', { withTimezone: true }).notNull().defaultNow(),
    submissionsOpen: boolean('submissions_open').notNull().default(true),
    // A partial override of TUNING_DEFAULTS (lib/glitch.js). `{}` means "use
    // the build defaults" — see C12 in implementation.md for why it is partial
    // rather than a full snapshot.
    glitch: jsonb('glitch').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('event_singleton', sql`${t.id} = 1`)],
)

/**
 * The per-suit configuration: where the chamber lives and what opens it.
 *
 * `code` is plain text on purpose. It is compared server-side inside a Server
 * Action and never reaches a client, so a hash would only protect against a
 * database dump — and it would cost the ability to re-read a code you lost.
 * §7 has the full accounting.
 */
export const suits = pgTable('suits', {
  suit: suitKey('suit').primaryKey(),
  slug: text('slug').notNull().unique(),
  code: text('code').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * One row per team per suit. Nothing here is derived — elapsed time is computed
 * in SQL at read time (§6), so correcting the start time re-ranks the whole
 * board with no data migration.
 */
export const submissions = pgTable(
  'submissions',
  {
    // mode: 'number' rather than bigint-as-string. At ~1,500 rows this is far
    // inside Number.MAX_SAFE_INTEGER, and a string id would leak into every
    // comparison and every React key.
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    suit: suitKey('suit')
      .notNull()
      .references(() => suits.suit),
    teamName: text('team_name').notNull(), // as typed; what gets displayed
    teamSlug: text('team_slug').notNull(), // normalized; what gets grouped on
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The correctness backbone: a team's first solve is its only solve, and the
    // ON CONFLICT target that makes a double-tap harmless. Named explicitly
    // rather than left to Postgres's default (`submissions_suit_team_key`) so
    // the generated SQL reads the same as §3 and a targeted ON CONFLICT has
    // something stable to name.
    unique('submissions_suit_team_idx').on(t.suit, t.teamSlug),
    index('submissions_suit_time_idx').on(t.suit, t.submittedAt),
    index('submissions_team_idx').on(t.teamSlug, t.submittedAt),
    index('submissions_time_idx').on(t.submittedAt.desc()),
  ],
)

// No `relations()` and no db.query.* usage. Every read in this project is an
// aggregate or a leaderboard ordered by time (§6), which is SQL, not an
// object graph — so the relational layer would be dead weight.
