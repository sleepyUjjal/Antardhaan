/**
 * The build audit — `npm run audit`.
 *
 * The single check that catches the mistake that ends the game on night one: a
 * real slug, a real code, or an admin secret sitting in the build output where
 * anyone can read it. §7 makes codes never reach the client by construction (the
 * column is never selected in lib/chambers.js, so there is no value to leak);
 * this proves it, because "by construction" is a claim about code you wrote and
 * this is a claim about bytes on disk.
 *
 * The plan writes this as "`npm run build`, then grep `.next/` for every real
 * slug and every code". A grep needs the secrets as arguments, which means
 * pasting them onto a command line where they land in your shell history — the
 * opposite of the point. Reading them from the database is both safer and
 * shorter, so this replaces the ritual rather than documenting it.
 *
 * Run after `npm run build`, and again any time a chamber component changes.
 *
 * Scope is "what `next build` wrote", not "everything under .next": the dev
 * server's tree, the build cache and build diagnostics are excluded, because
 * none of them is browser-reachable and the first of them records real request
 * URLs. It also refuses to certify a `.next` that holds a dev tree alongside a
 * build, since from the outside there is no way to tell which files the build
 * wrote. `--all` overrides both. The reasoning is on `NOT_BUILD_OUTPUT` below.
 */
import 'dotenv/config'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asc } from 'drizzle-orm'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { suits } from '../db/schema.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const NEXT_DIR = join(ROOT, '.next')

/**
 * Directories under `.next` that are not build output.
 *
 * `.next/dev` is the dev server's own tree — Turbopack artifacts and a request
 * trace. It is not written by `next build`, not served by `next start`, and not
 * uploaded by Vercel. What it does contain is a record of every URL the dev
 * server has rendered, which is how the first run of this script reported a real
 * SPADES slug: `"inputPage":"/c/c5t6dhy8us"` in `.next/dev/trace`, left over
 * from a dev visit before chambers moved off the `/c/` prefix. Not a leak, and
 * reporting it as one is how a team learns to ignore the audit.
 *
 * `.next/cache` is the build cache and `.next/diagnostics` is build diagnostics.
 * Neither is browser-reachable, though note that `.next/cache` genuinely does
 * hold rendered responses keyed by URL — "never served" is the claim here, not
 * "contains nothing".
 *
 * A denylist rather than an allowlist of `.next/static` and `.next/server`, and
 * deliberately: if a future Next version starts *serving* a new directory, a
 * denylist still scans it while an allowlist would quietly stop checking it. A
 * denylist fails towards a noisy false positive, which is the safe direction.
 */
const NOT_BUILD_OUTPUT = new Set(['cache', 'dev', 'diagnostics'])

/**
 * Files above this are skipped. Nothing that ships is anywhere near it — the
 * largest file a production Next build emits is a few hundred kilobytes — and
 * the cap is what keeps a stray asset from turning the audit into a memory
 * problem. Skips are named in the output rather than counted: an un-audited file
 * is exactly the thing this script exists to not have silently.
 */
const MAX_BYTES = 16 * 1024 * 1024

/**
 * Below this length a substring search over minified JavaScript is meaningless:
 * a four-character slug appears in any bundle by coincidence, thousands of
 * times. Such secrets are *not* silently skipped — they are reported as
 * un-audited, because a check that quietly does nothing is worse than no check.
 * The generated ones (10-character slugs, 8-character codes) are well clear.
 */
const MIN_SEARCHABLE = 6

// `--all` means "check every byte under .next, exclusions and refusals included".
// It is for the paranoid run the night before: it will find the dev trace, and
// it will be slow, and both of those are the point.
const auditEverything = process.argv.slice(2).includes('--all')

// Never print the credential — host only. Same reasoning as db/seed.js: an audit
// that quietly checked production because .env still pointed there is worse than
// no audit.
const url = process.env.DATABASE_URL
if (!url) {
  console.error('\n  DATABASE_URL is not set. Copy .env.example to .env and fill it in.\n')
  process.exit(1)
}

// BUILD_ID is the marker `next build` writes. Checking for it rather than for
// `.next` itself matters: a tree that has only ever been through `next dev` has
// a `.next` directory and nothing worth auditing inside it.
if (!existsSync(join(NEXT_DIR, 'BUILD_ID'))) {
  console.error('\n  No production build in .next. Run `npm run build` first, then audit that build.\n')
  process.exit(1)
}

console.log(`\n  target: ${new URL(url).host}`)
console.log(`  build:  ${relative(ROOT, NEXT_DIR)}\n`)

/**
 * A `.next` that holds both a build and a dev tree is the normal state of a
 * working checkout — `next build` does not clean `.next/dev` — and it is the one
 * state in which this audit cannot mean what it says. The guarantee on offer is
 * "the bytes `next build` wrote are clean", and from the outside there is no way
 * to tell which of these files the build wrote and which the dev server did.
 *
 * So this refuses rather than scanning around the problem. A "Clean" printed
 * next to a mixed tree is precisely the false confidence the script exists to
 * prevent, and `npm run build:clean && npm run audit` is thirty seconds.
 */
if (!auditEverything && existsSync(join(NEXT_DIR, 'dev'))) {
  console.error('  This .next holds a dev tree as well as a build (.next/dev is present).')
  console.error('  next build does not clean it, so this audit cannot tell build output')
  console.error('  from dev output, and a clean result would not mean anything.\n')
  console.error('    npm run build:clean && npm run audit\n')
  console.error('  `npm run audit -- --all` scans it anyway, dev trace and all.\n')
  process.exit(1)
}

const db = drizzle(neon(url))
const rows = await db.select().from(suits).orderBy(asc(suits.suit))

// An empty table would make this pass trivially, which is the one way an audit
// can lie. It is not a clean result, it is no result.
if (rows.length === 0) {
  console.error('  No suits in the database, so there is nothing to audit. Run `npm run seed`.\n')
  process.exit(1)
}

const secrets = []
for (const row of rows) {
  secrets.push({ label: `${row.suit} slug`, value: row.slug })
  secrets.push({ label: `${row.suit} code`, value: row.code })
}
// Not part of C9's brief, but the same failure class and two lines to add: an
// admin password or session secret inlined into a client chunk is a worse night
// than a leaked code. Absent variables are simply not checked.
for (const name of ['ADMIN_PASSWORD', 'SESSION_SECRET']) {
  const value = process.env[name]
  if (typeof value === 'string' && value.trim() !== '') {
    secrets.push({ label: name, value })
  }
}

const searchable = secrets.filter((s) => s.value.length >= MIN_SEARCHABLE)
const tooShort = secrets.filter((s) => s.value.length < MIN_SEARCHABLE)

/** Every file under `.next`, skipping symlinks (which cannot be in a build we emitted). */
function* walk(dir, topLevel = false) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      // The exclusion applies at the top level only. A directory called `dev` or
      // `cache` deeper in the tree is build output like anything else, and
      // matching on the name alone would skip it.
      if (topLevel && !auditEverything && NOT_BUILD_OUTPUT.has(entry.name)) continue
      yield* walk(full)
    } else if (entry.isFile()) {
      yield full
    }
  }
}

/** A window around a hit, so the finding is legible without opening the file. */
function excerpt(text, index, length) {
  const start = Math.max(0, index - 60)
  const end = Math.min(text.length, index + length + 60)
  const lead = start > 0 ? '…' : ''
  const trail = end < text.length ? '…' : ''
  return `${lead}${text.slice(start, end).replace(/\s+/g, ' ')}${trail}`
}

const findings = []
const skippedLarge = []
let files = 0
let bytes = 0

for (const file of walk(NEXT_DIR, true)) {
  const stats = statSync(file)
  if (stats.size > MAX_BYTES) {
    skippedLarge.push(`${relative(ROOT, file)} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`)
    continue
  }

  // utf8 decoding replaces invalid sequences with U+FFFD, which cannot corrupt
  // an ASCII slug or code — so a binary file can be searched as text without
  // producing false positives, only false misses at a boundary that the window
  // above would have caught anyway.
  const text = readFileSync(file, 'utf8')
  files += 1
  bytes += stats.size

  for (const secret of searchable) {
    const index = text.indexOf(secret.value)
    if (index !== -1) {
      findings.push({ file: relative(ROOT, file), secret, context: excerpt(text, index, secret.value.length) })
    }
  }
}

const mb = (bytes / 1024 / 1024).toFixed(1)
console.log(`  scanned ${files.toLocaleString()} files (${mb} MB)`)
console.log(`  checked ${searchable.length} secrets`)
if (auditEverything) {
  console.log('  --all: dev tree, build cache and diagnostics included')
} else {
  console.log(
    `  skipped ${[...NOT_BUILD_OUTPUT].map((d) => `.next/${d}`).join(', ')} — never served to a browser; --all audits them`,
  )
}
if (skippedLarge.length > 0) {
  // Named, not counted. A skipped file is an unchecked file, and the point of
  // this script is that there are none of those.
  console.log(`\n  NOT AUDITED — over ${MAX_BYTES / 1024 / 1024} MB:`)
  for (const entry of skippedLarge) console.log(`    ${entry}`)
  console.log('  Nothing that ships is remotely this large, so this is a sign the')
  console.log('  scan is looking somewhere it should not be. Worth a look.')
}
if (tooShort.length > 0) {
  console.log(
    `\n  NOT AUDITED — too short for a substring search to mean anything (<${MIN_SEARCHABLE} chars):`,
  )
  for (const secret of tooShort) console.log(`    ${secret.label} (${secret.value.length} chars)`)
  console.log('  These are unchecked. Set a longer slug in /admin/suits.')
}

if (findings.length > 0) {
  console.log(`\n  ${findings.length} LEAK(S) FOUND\n`)
  for (const finding of findings) {
    console.log(`  ${finding.secret.label} (${finding.secret.value.length} chars)`)
    console.log(`    in ${finding.file}`)
    console.log(`    ${finding.context}\n`)
  }
  console.error('  The game is over on night one if this ships. Do not deploy.\n')
  process.exit(1)
}

console.log('\n  Clean. No slug, code or server secret appears anywhere in the build output.\n')
