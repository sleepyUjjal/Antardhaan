/**
 * Environment access.
 *
 * Values are validated where they are *read*, not at import. Importing this
 * module costs nothing; the error appears at the first line that actually needs
 * the value, naming the variable. The alternative — checking at module load —
 * turns a missing variable into an import-time crash in whatever file happened
 * to pull this in first, which is a worse error message for the same bug.
 *
 * NEXT_PUBLIC_SITE_URL is read through here by the admin copy-link and by the
 * CSV export, but *not* by app/layout.jsx: metadata falls back to localhost
 * rather than failing, because a wrong OG URL is cosmetic while a broken admin
 * page is not.
 */

const HINT =
  'Copy .env.example to .env and fill it in. On Vercel, set it under Project → Settings → Environment Variables.'

function read(name) {
  const value = process.env[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing environment variable ${name}. ${HINT}`)
  }
  return value
}

export const env = {
  get DATABASE_URL() {
    return read('DATABASE_URL')
  },
  get ADMIN_PASSWORD() {
    return read('ADMIN_PASSWORD')
  },
  get SESSION_SECRET() {
    return read('SESSION_SECRET')
  },
  get NEXT_PUBLIC_SITE_URL() {
    // Trailing slashes are stripped rather than rejected. The example file asks
    // for no trailing slash and people add one anyway, and a double slash in a
    // pasted chamber URL is a bug that only shows up when you send it.
    return read('NEXT_PUBLIC_SITE_URL').replace(/\/+$/, '')
  },
}
