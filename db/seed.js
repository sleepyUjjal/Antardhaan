/**
 * Seeds the two things the site cannot start without: the single `event` row
 * and the five `suits` rows.
 *
 * THIS SCRIPT NEVER OVERWRITES ANYTHING. Both inserts are `onConflictDoNothing`,
 * so running it twice is safe, and running it *after* the event has started is
 * safe — it will not touch a start time you have set, a slug you have rotated,
 * or a code you have generated. That property is the whole reason this is a
 * script and not part of the migration: a migration runs once and is recorded,
 * so you cannot run it again when the row goes missing for some unrelated
 * reason.
 *
 * Run with `npm run seed`.
 */
import 'dotenv/config'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { asc } from 'drizzle-orm'
import { generateCode, generateSlug } from '../lib/code.js'
import { SUIT_KEYS } from '../lib/suits.js'
import { event, suits } from './schema.js'

const url = process.env.DATABASE_URL

if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
  process.exit(1)
}

// Print the target before writing to it — host only, never the credential. A
// seed that quietly wrote to production because .env still pointed there is the
// classic way to lose an evening.
console.log(`\n  target: ${new URL(url).host}\n`)

const db = drizzle(neon(url))

await db.insert(event).values({ id: 1 }).onConflictDoNothing()

await db
  .insert(suits)
  .values(SUIT_KEYS.map((suit) => ({ suit, slug: generateSlug(), code: generateCode() })))
  .onConflictDoNothing()

const rows = await db.select().from(suits).orderBy(asc(suits.suit))
const [eventRow] = await db.select().from(event)

console.log(`  event row: ${eventRow ? 'present' : 'MISSING — the leaderboard will return nothing'}`)
console.log(`  start time: ${eventRow ? eventRow.startTime.toISOString() : '—'}\n`)
console.log('  suit         slug          code')
console.log(`  ${'-'.repeat(34)}`)
for (const row of rows) {
  console.log(`  ${row.suit.padEnd(13)}${row.slug.padEnd(14)}${row.code}`)
}

if (rows.length !== SUIT_KEYS.length) {
  console.log(`\n  ${rows.length}/${SUIT_KEYS.length} suits present — something is wrong.`)
}

console.log(`
  These are generated placeholders, not the codes you will hand out.
  Set the real ones in /admin/suits (C13), which is the system of record.
  Change the start time in /admin before the event opens.
`)
