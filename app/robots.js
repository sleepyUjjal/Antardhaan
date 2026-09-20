/**
 * `/robots.txt` — nothing is crawlable.
 *
 * Next serves this at `/robots.txt` only. It does not claim `/robots`, which is
 * why `RESERVED_SLUGS` in lib/slug.js lists `robots` anyway: without that, a
 * chamber slugged `robots` would sit at a path that reads like infrastructure
 * to anyone who sees it.
 *
 * The honest note on how this composes with the `noindex` in app/layout.jsx:
 * they do not stack the way it looks. A crawler that obeys `Disallow: /` never
 * fetches a page, so it never reads that page's `noindex` meta tag — the two
 * cover different arrivals rather than the same one twice. This file stops the
 * crawl; the meta tag is what a crawler sees if it arrives anyway, which is the
 * normal case for link unfurlers (Slack, Discord, Twitter) that read meta tags
 * and ignore robots.txt. Neither is redundant, and neither is sufficient alone.
 */
export default function robots() {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  }
}
