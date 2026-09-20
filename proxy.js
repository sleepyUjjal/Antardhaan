/**
 * The route guard for `/admin`.
 *
 * This file was `middleware.js` and is now `proxy.js`. Next 16 renamed the
 * convention — `middleware.js` still works but warns on every dev boot and every
 * build, and the build refuses outright if both files exist, so this is a rename
 * rather than a copy. The export had to be renamed with it: the entry template
 * reads `mod.proxy || mod.default`, so a file called `proxy.js` exporting
 * `middleware` is a file that throws "must export a function named `proxy`".
 *
 * The rename is not only cosmetic, and it is the reason lib/session.js no longer
 * has to be hand-written to survive an edge runtime. In `entries.js`,
 * `runDependingOnPageType` sends a proxy file straight to `onServer()` — Node,
 * always — where a middleware file went to the edge unless it opted out. So this
 * runs on Node, `node:crypto` resolves in anything it imports, and `process.env`
 * is a real object rather than whatever the compiler managed to inline.
 *
 * What has NOT changed is that this file stays free of database imports. The
 * guard's whole job is to answer "is there a validly signed, unexpired session
 * cookie" — the token is verified here, not merely looked for, because a
 * middleware that only checked the cookie's presence would redirect on a forged
 * one and hand every admin page the job of verifying it, which is the version of
 * this that gets one page wrong. A chamber query in here would run on every
 * `/admin` request through a different pool than the one that owns it.
 *
 * The matcher below is the other half of that. Without it this would run on every
 * request the site serves, including the chamber pages — 500 concurrent
 * participants (§9) paying a JWT verification they have no use for, to protect a
 * route none of them are going to.
 */
import { NextResponse } from 'next/server'
import { SESSION_COOKIE, readSession } from '@/lib/session'

const LOGIN_PATH = '/admin/login'

export async function proxy(request) {
  const { pathname } = request.nextUrl

  // The login page has to be reachable while logged out, or this redirects to
  // itself forever. It is the one hole in the matcher's net, and the action it
  // posts to lands on the same path, so the POST is covered by this line too.
  if (pathname === LOGIN_PATH) return NextResponse.next()

  if (await readSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next()
  }

  // Redirect to the login page and drop whatever was in the query string.
  //
  // There is deliberately no `?next=` here. Carrying the destination through
  // would mean validating it on the way back — anything unvalidated is an open
  // redirect, and the only way to validate it properly is to allowlist paths,
  // which is a lot of machinery to save one navigation. Sessions last twelve
  // hours and there is one user; you log in once at the start of the evening, not
  // once per page.
  const url = request.nextUrl.clone()
  url.pathname = LOGIN_PATH
  url.search = ''
  return NextResponse.redirect(url)
}

/**
 * `/admin` and everything under it, and nothing else.
 *
 * Both forms are listed because `/admin/:path*` matching a bare `/admin` depends
 * on how path-to-regexp treats a zero-length repeat, and this is not a line to be
 * clever about: the cost of listing both is one array entry, and the cost of
 * being wrong is the dashboard sitting there unguarded.
 *
 * `config.matcher` survived the rename intact — `get-page-static-info.js` reads
 * it for a proxy file exactly as it did for a middleware file, so this is not a
 * silently-ignored export.
 *
 * `/admin/login` is matched too, and exempted inside the function rather than by
 * excluding it here — a path that has to be spelled out twice in two different
 * syntaxes is a path that will eventually be spelled differently in one of them.
 */
export const config = {
  matcher: ['/admin', '/admin/:path*'],
}
