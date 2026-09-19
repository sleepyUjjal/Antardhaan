/**
 * The database client.
 *
 * The neon-http driver makes every query a single HTTP request over Neon's
 * pooled endpoint. There is no connection to hold open, so a spike cannot
 * exhaust a pool, and an instance that scaled to zero costs nothing to wake.
 * That is the whole reason this project is not on `pg` (§9).
 *
 * Importing this module requires DATABASE_URL to be set, which is intentional:
 * a misconfiguration should surface the first time the database is touched,
 * not as a mystery 500 halfway through the event.
 */
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { env } from '../lib/env.js'
import * as schema from './schema.js'

const url = env.DATABASE_URL

// A soft warning, not an error: a direct (non-pooled) URL works, it just opens
// a fresh connection per query, which is exactly what §9 is trying to avoid
// under 500 concurrent readers. Module scope means this fires once per
// instance rather than once per query.
if (!url.includes('-pooler')) {
  console.warn(
    '[db] DATABASE_URL does not look like a pooled Neon endpoint (no "-pooler" in the host). ' +
      'It will work, but it will not absorb a spike. Use the pooled connection string.',
  )
}

export const db = drizzle(neon(url), { schema })

// Available and worth remembering when C7 lands: `db.batch([...])` sends
// several queries in one HTTP round trip, which is how the chamber page gets
// its suit row and its event row without paying for Singapore twice (§9.2).
