/**
 * drizzle-kit config: generate, migrate and studio all read this.
 *
 * `dotenv/config` is imported here rather than relying on drizzle-kit to find
 * .env on its own. Whether it does has moved between versions, and this file
 * needs DATABASE_URL present whatever version is installed.
 */
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error(
    'DATABASE_URL is not set. drizzle-kit reads it from .env via dotenv/config at the top of this file.',
  )
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.js',
  out: './db/migrations',
  dbCredentials: { url },
  verbose: true,
  // No `strict`: it turns generate into an interactive confirmation, and these
  // commands are meant to be runnable from a script.
})
