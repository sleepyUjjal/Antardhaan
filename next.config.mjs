/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * One header, on every route. §7 has the full reasoning; the short version is
   * that a chamber's slug lives in its URL, and the `Referer` header is how a URL
   * escapes to a third party without anyone choosing to send it. The moment any
   * chamber page links to or loads from an external host, the browser hands that
   * host the full slug — and from there it is in someone else's logs, and in
   * their analytics, forever.
   *
   * `/:path*` matches zero or more segments, so this covers `/` as well as the
   * chamber pages, the decoy 404 and the API routes.
   *
   * Deliberately the only entry. A CSP, HSTS, `X-Frame-Options` and the rest all
   * belong to a site defending itself from strangers, and this one is a game for
   * five hundred people who were handed the URL — see the table at the top of §7
   * for why each of those is skipped rather than forgotten.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ]
  },
}

export default nextConfig
