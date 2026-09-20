# Antardhaan — Implementation Plan

**Event:** Antardhaan, internal game event for Mridang 2k26
**Stack:** Next.js 16 (App Router) · JavaScript · Tailwind CSS v4 · Neon Postgres · Drizzle ORM · Vercel
**Aesthetic:** a page that never settles — continuously glitching between a bone-white "good" state and a void-black "bad" state, with maroon as the only chromatic accent.
**Primary device:** a phone, held in one hand, on venue wifi.

---

## 1. What we are building

Three surfaces, one visual language:

| Surface | Route | Audience | Purpose |
|---|---|---|---|
| Landing | `/` | Everyone | Sets the theme. Decoy. No links to chambers. |
| Chambers | `/<slug>` ×5 | Participants who were handed the URL | Enter team name + suit code → timestamp recorded |
| Admin | `/admin/*` | You, on your phone | Start time, the glitch controller, suit codes, hidden slugs, leaderboards, CSV export |

### Confirmed decisions

1. **Plain JavaScript.** No TypeScript, no `.ts`/`.tsx`, no build-time types. `jsconfig.json` for the `@/*` path alias, JSDoc comments where a shape needs documenting. Validation is hand-rolled — two fields don't need a schema library.
2. **Identity is self-declared.** A submission is `team name` + `code`. No team accounts, no pre-registration. Names are normalized into a `team_slug` (lowercase, trimmed, punctuation stripped, whitespace collapsed) so "Team Vortex", "team vortex" and "TEAM  VORTEX" collapse into one leaderboard row. The raw spelling is kept for display.
3. **Each suit has one unique code.** Five codes, one per suit, generated in the admin dashboard and stored **as plain text**. A code only ever verifies against its own suit — a Spades code entered at the Hearts chamber is a wrong code. Plain text is a deliberate simplification: it means the admin dashboard can show you a code you lost, and hashing protects nothing here (see §7).
4. **Start time is display-only.** Submissions are accepted whenever. The start time is the zero-point for every elapsed time on the leaderboard, and it is editable — so elapsed times are computed **in SQL at read time**, never stored per row. Fixing a typo re-ranks the whole board instantly.
5. **Hidden endpoints are obscure slugs, shared out-of-band.** Slugs live in the database and are editable from the admin dashboard, so you can rotate a leaked URL mid-event without a redeploy. Nothing on the site links to, hints at, or enumerates them.
6. **Only dynamic data lives in the database.** Codes, slugs, start time and submissions. Suit names and suit glyphs are presentation, so they live in a code constant (`lib/suits.js`) where the components can reach them — no `label` or `glyph` columns.

### What "done" looks like

- A participant with a slug and a code submits in under 15 seconds on a phone, on venue wifi, and sees a confirmation bearing their timestamp.
- You can open the dashboard on your phone mid-event and answer "who is winning Spades" without pinch-zooming or scrolling sideways.
- 500 people hitting the site at once does not fall over, and no code or slug ends up in the client bundle.

---

## 2. Repo hygiene

Two items, both still open as of C5:

1. **`.env` is empty.** It started as a bare `postgresql://…` string, then became a keyed `DATABASE_URL="…"`, and is now zero bytes — so nothing reads a connection string and `npm run db:migrate` cannot run. Fill in all four variables before C5's commands. Separately: **rotate the Neon password.** It sat in plaintext in this directory for the length of this project, and emptying the file does not un-expose a credential that was already on disk. Never let `.env` out of `.gitignore`; commit `.env.example` instead.
2. **The stray `t` file is still tracked.** It is a 741-byte copy of the original brief and `git ls-files` lists it, so it is in the history. `git rm t` — the brief survives in the preamble above and in the commit that added it.

**A correction, because the first draft of this section was wrong.** It claimed `.gitignore` listed `implementation.md` and that "git will never track it". The rule was there, but the file was **already tracked**, and `.gitignore` has no effect on a tracked file. The rule was inert, not harmful — this plan has been in the repo and under version control the whole time. The line is gone now (a rule that does nothing is worse than no rule), but nothing was ever at risk, and no work was ever invisible to git.

---

## 3. Data model

Three tables, plus a Postgres enum for the suits so an invalid suit cannot be inserted. This is the whole game state.

```sql
create type suit_key as enum ('SPADES','CLUBS','DIAMONDS','HEARTS','JOKER');

-- Single row. id is pinned to 1 by a check constraint.
create table event (
  id                integer     primary key default 1,
  start_time        timestamptz not null default now(),
  submissions_open  boolean     not null default true,
  glitch            jsonb       not null default '{}'::jsonb,  -- partial override (C12)
  updated_at        timestamptz not null default now(),
  constraint event_singleton check (id = 1)
);

create table suits (
  suit       suit_key primary key,
  slug       text        not null unique,   -- the hidden URL segment
  code       text        not null,          -- plain text, on purpose (§7)
  is_active  boolean     not null default true,
  updated_at timestamptz not null default now()
);

create table submissions (
  id           bigserial   primary key,
  suit         suit_key    not null references suits(suit),
  team_name    text        not null,   -- as typed; display value
  team_slug    text        not null,   -- normalized; grouping key
  submitted_at timestamptz not null default now(),  -- server clock, never client
  constraint submissions_suit_team_idx unique (suit, team_slug),  -- first solve wins, enforced by the DB
);

create index submissions_suit_time_idx on submissions (suit, submitted_at);
create index submissions_team_idx      on submissions (team_slug, submitted_at);
create index submissions_time_idx      on submissions (submitted_at desc);
```

### Why each index exists

Nothing here is speculative — every index backs a query the app actually runs:

| Index | Serves |
|---|---|
| `suits.slug` (unique) | The chamber hot path: every chamber page load resolves a slug. Also makes the slug lookup an index hit rather than a scan. |
| `submissions (suit, team_slug)` (unique) | Duplicate prevention, and the `ON CONFLICT` target on insert. |
| `submissions (suit, submitted_at)` | Per-suit leaderboard — the `ORDER BY submitted_at` comes straight off the index, no sort step. |
| `submissions (team_slug, submitted_at)` | Overall standings — `GROUP BY team_slug` with `max(submitted_at)` per group. |
| `submissions (submitted_at desc)` | The dashboard's "latest submissions" list and the stat cards. |

At realistic volume — 300 teams × 5 suits = 1,500 rows — every one of these is a trivial index lookup, and the whole board fits in memory. The indexes are there so that stays true if the event is bigger than expected, and because they cost nothing to add now and a migration to add later.

### Design notes

- `unique (suit, team_slug)` is the correctness backbone: a team's first solve is its only solve. A re-submission hits the constraint and the UI responds with the *original* timestamp rather than an error — "already recorded at 21:14:03". This also makes the submit action safely idempotent, which matters when 500 people on flaky wifi double-tap the button.
- No `elapsed_ms` column, deliberately. Elapsed time is derived at read time (§6).
- No `ip_hash`, no `user_agent`, no attempt log. The only thing stored about a participant is the team name they typed. That is both simpler and a cleaner privacy position.
- `event.glitch` is a **partial** override of `TUNING_DEFAULTS` (C12), not a copy of them. `{}` means "whatever the build says", which is what lets a knob added in a later commit work with no backfill, and lets an edit to `TUNING_DEFAULTS` still reach every device that has not overridden it. It is jsonb rather than a column per knob because the knob set changes during rehearsal, and a migration per idea is the wrong tax for that. One column on a one-row table — and every value in it is clamped and allowlisted before it can reach a client.
- The Drizzle schema is the source of truth. Two details need care in JS: `pgEnum` for `suit_key`, and the singleton check on `event`, which is either `check('event_singleton', sql\`id = 1\`)` in a recent `drizzle-orm`, or a hand-added line in the generated migration.

```js
// db/schema.js — the shape, in brief
export const suitKey = pgEnum('suit_key', ['SPADES', 'CLUBS', 'DIAMONDS', 'HEARTS', 'JOKER'])

export const submissions = pgTable('submissions', {
  id:          bigserial('id', { mode: 'number' }).primaryKey(),
  suit:        suitKey('suit').notNull().references(() => suits.suit),
  teamName:    text('team_name').notNull(),
  teamSlug:    text('team_slug').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('submissions_suit_team_idx').on(t.suit, t.teamSlug),
  index('submissions_suit_time_idx').on(t.suit, t.submittedAt),
  index('submissions_team_idx').on(t.teamSlug, t.submittedAt),
  index('submissions_time_idx').on(t.submittedAt.desc()),
])
```

---

## 4. Routes

| Route | Type | Notes |
|---|---|---|
| `/` | static | Landing. Glitch showcase. No chamber links. |
| `/[slug]` | dynamic | Looks up slug in `suits`. Unknown slug → `notFound()` → themed decoy 404. Never reveals whether a slug exists. |
| `/[slug]` (action) | Server Action | The submission. Validated, code-checked, insert-or-conflict. |
| `/admin/login` | static + action | Password → signed cookie. |
| `/admin` | dynamic, guarded | Start time, stat cards, the active-hold banner. |
| `/admin/glitch` | dynamic, guarded | The controller: knobs, presets, hold. Publishes to `event.glitch`. |
| `/admin/suits` | dynamic, guarded | Codes + slugs. |
| `/admin/leaderboards` | dynamic, guarded | Per-suit tabs + overall standings. |
| `/admin/export.csv` | route handler, guarded | Full submission log, CSV. |
| `/admin/export.json` | route handler, guarded | The same rows for a script, plus `startTime` — elapsed is meaningless without it. |
| `/api/glitch` | route handler | Tuning JSON for every client, clamped. Edge-cached, 60 s. |
| `/api/leaderboard` | route handler | JSON for polling. Edge-cached (§9). |
| `/standings` | static shell + client fetch | Public board for the venue screen. |
| `/robots.txt` | static | `Disallow: /`. |
| `not-found.jsx` | static | The decoy. Should look intentional, not broken. |

Chamber pages appear in no nav, sitemap or manifest. The slug never appears in a `<Link>` on a public page, so it is never shipped in a prefetch payload. `robots: { index: false, follow: false }` is set once in the root layout rather than per page — see C9 for why, and for why it is not a second layer on top of `robots.txt`. The one `<Link>` on the site is the decoy's route back to `/`, which names nothing.

**Chambers sit at the root, not under `/c/`.** `/<slug>` is the URL the participants get, and two things follow from that which the `/c/` prefix would have handled for us:

- **`/[slug]` is now the catch-all for every URL on the domain that no other route claims.** `/.env`, `/wp-login.php`, `/phpmyadmin` all arrive at this route — and without a guard, each one is a query against Neon in Singapore. `SLUG_PATTERN` rejects the impossible before the query. Next serves static segments first, so `/admin` and `/standings` never reach here, but nothing else is filtered for us. The pattern and the set now live in `lib/slug.js`; C13 is why.
- **`RESERVED_SLUGS` is a C13 requirement, not a nicety.** A chamber slugged `admin` does not error — it silently becomes unreachable, because Next matches the static `app/admin/` route first and `getChamberData` never sees it. C13 refuses to save any slug with a `slugProblem`. Reserving a word costs nothing; discovering the collision mid-event costs a chamber.

---

## 5. Design system (mobile-first)

Two ideas carry the whole look:

1. **Every colour is a CSS variable swapped on a mode flip.** No component knows which mode it's in; they all reference `--bg`, `--fg`, `--accent`.
2. **The mobile layout is the layout.** Base styles are the phone; `md:` and `lg:` only add. Nothing is designed wide and squeezed down.

### Tokens

```css
@theme {
  --color-paper:      #F2EFE9;  /* good — bone, not pure white */
  --color-ink:        #0B0B0C;  /* bad  — void, not pure black */
  --color-maroon:     #7A0E1E;  /* primary accent */
  --color-maroon-hot: #A81228;  /* active / glow */
  --color-maroon-deep:#3D0710;  /* depth */
  --color-ash:        #7A7772;  /* muted text */
}

:root {
  --bg: var(--color-ink);   --fg: var(--color-paper);  --rule: #221F20;  /* bad is the default */
  --muted: #8A8681;              /* quiet text on ink       — 5.5:1 */
  --accent-text: #C4576A;        /* the accent as foreground — 4.6:1 */
}
:root[data-mode="good"] {
  --bg: var(--color-paper); --fg: var(--color-ink);    --rule: #CFC9BF;
  --muted: #5F5C58;              /* 5.8:1 on paper */
  --accent-text: var(--color-maroon);  /* 9.6:1 on paper */
}
```

**Why `--accent-text` and `--muted` exist at all.** Maroon is a good *background* and a good *rule* in both modes, but it is only a good *foreground* on paper. Maroon on ink measures **1.8:1** — not "low contrast", effectively invisible, and it is the assumption of ~3.4:1 in the first draft of this section that hid it. So the accent splits in two: `--accent`/`--accent-hot` keep doing fills, hairlines and button grounds, and `--accent-text` carries the accent when it *is* the text — true maroon on paper, a lightened `#C4576A` on ink. The same reasoning gives `--muted` a value per mode: ash lands at 3.8:1 on paper, under AA for the small mono lines it is used on. The focus ring uses `--accent-text` too, because a focus indicator needs 3:1 against the page behind it and a maroon ring on ink does not have it.

Why bone and void rather than `#fff`/`#000`: pure white inverting to pure black at high frequency is physically punishing to read. Off-white and off-black hold ~18:1 contrast while surviving a full evening of flipping.

### Mobile-first rules

These are the difference between a page that looks good in a screenshot and one that works at a venue:

| Concern | Rule |
|---|---|
| Viewport height | `100dvh`, never `100vh` — mobile browser chrome changes the height as you scroll, and `vh` gets it wrong. |
| Notches | `padding-bottom: env(safe-area-inset-bottom)` on the submit area, `padding-top: env(safe-area-inset-top)` on any fixed header. |
| Input zoom | Every input and the code field at `font-size: 16px` minimum. Anything smaller makes iOS Safari zoom the page on focus, which wrecks the layout mid-submission. |
| The keyboard | `enterKeyHint="go"` on the code field, `autoCapitalize="characters"`, `autoCorrect="off"`, `spellCheck={false}`, `autoComplete="off"`. One tap to move from name → code → submit. |
| Thumb reach | The submit button is bottom-anchored and ≥ 52 px tall. Everything that matters sits in the lower two-thirds of the screen. |
| No hover | **Nothing depends on hover.** Press states are `:active`, not `:hover` — on a phone, hover either never fires or fires on tap and sticks. The text glitch triggers on tap and on mode flip, not on hover. |
| Scroll | `overscroll-behavior-y: none` to kill rubber-band bounce, `-webkit-tap-highlight-color: transparent` to kill the grey flash, and no fixed-position element that fights the scroll. |
| Type scale | `clamp()` throughout, mobile value first: `--display: clamp(3rem, 15vw, 9rem)` grows the ANTARDHAAN lockup to fill any phone and stops growing on desktop. |
| Reduced motion | Honoured end to end — see below. |

### The glitch engine

A single `GlitchProvider` at the root owns the state; everything else is CSS.

| Layer | Mechanism | Cadence |
|---|---|---|
| Mode flip | `data-mode` toggled on `<html>` | Every 4–10 s, jittered |
| Micro-stutter | 2–4 rapid flips inside ~120 ms at each transition | On every flip |
| Tear | `.is-tearing` on `<html>` for 200 ms; `clip-path: inset()` bands shifted on `translateX` | On every flip |
| Scanlines | Fixed overlay, `repeating-linear-gradient`, 3 px pitch | Wide screens only |
| Grain | `feTurbulence` rendered **once** into a data-URI SVG, stepped via CSS `steps()` | Wide screens only |
| Vignette | Fixed `radial-gradient` | Always — cheap, and sells the depth |
| Text glitch | Two `::before`/`::after` clones from `data-text`, offset ±2 px in maroon, clip-path slicing | On tap, on flip, on demand |
| Signal loss | Full inversion flash | Rare, every ~45 s |
| Scramble | `useScramble()` — heading characters resolve from a glyph pool over ~700 ms | Suit names, success copy, page titles |

Discipline that keeps it from becoming a migraine — and from cooking a phone battery:

- **Phones get three layers: mode flip, tear, vignette.** Scanlines and grain are `@media (min-width: 768px)` only. They're the two most expensive layers visually and computationally, and on a 6-inch screen they read as noise rather than texture.
- Only `transform` and `opacity` animate. The grain is a static SVG stepped by CSS — no canvas loop, no `requestAnimationFrame`, no per-frame JS.
- The oscillator pauses on `visibilitychange`. 500 phones with the page backgrounded should not be animating.
- **`prefers-reduced-motion: reduce` stops the oscillator entirely.** The page locks to `bad` mode with a static maroon-edged composition: no flips, no tear, no grain, no scramble. This is not optional — someone at the venue will have vestibular sensitivity, and a page that strobes is genuinely hostile to them.
- Maroon never carries body text, in either mode. It is a fill, a rule and a background; where the accent has to be the text it goes through `--accent-text` above, which is the only accent value that is legible on ink.

---

## 6. Leaderboard logic

Elapsed time is always computed relative to the *current* start time, in SQL:

```sql
-- Per suit
select s.team_name, s.team_slug, s.submitted_at,
       s.submitted_at - e.start_time as elapsed
from submissions s
cross join event e
where s.suit = $1
order by s.submitted_at asc;
```

```sql
-- Overall: most suits solved, then least total elapsed
select s.team_slug,
       (array_agg(s.team_name order by s.submitted_at desc))[1] as display_name,
       count(distinct s.suit)                as suits_solved,
       sum(s.submitted_at - e.start_time)    as total_elapsed,
       max(s.submitted_at)                   as last_solve
from submissions s
cross join event e
group by s.team_slug
order by suits_solved desc, total_elapsed asc;
```

`display_name` takes the team's most recent spelling, so a team that fixes a typo on their fifth chamber isn't stuck with the typo in the standings.

Ordering by `submitted_at` and by elapsed are equivalent orderings — ranking by elapsed is presentation, so the board reads as stopwatch times rather than clock times.

**As built, none of this runs in SQL.** C14 derives both boards in `lib/board.js` from one `select` of every submission. The property above is unchanged — elapsed is still `submitted_at - start_time`, computed at read time, never stored, so moving the start time re-ranks five chambers with no writes — but the subtraction, the aggregates and the ordering all happen in JavaScript. The three reasons are in C14; the short version is that the tie rule needs a competition rank, `sum(interval)` across neon-http is a plausible-wrong-number hazard, and the per-team timeline needs every row in hand regardless. **The SQL above is what to go back to if the row count ever stops being trivial**, and the reasoning that bounds that is in `lib/board.js`.

---

## 7. What is deliberately not hardened

You asked for simple, so this section is the honest accounting of what that costs:

| Skipped | Why it's acceptable here |
|---|---|
| Hashing the suit codes | Codes are checked server-side and never reach the client, so a hash only protects against a database dump — and if someone has your Neon credentials, the codes are the least of it. Plain text buys something real: the admin dashboard can show you a code you misplaced. |
| Rate limiting submissions | Brute-forcing an 8-character code from a 31-character alphabet is 31⁸ ≈ 8.5 × 10¹¹ possibilities. At a sustained 20 requests/second that is roughly 1,350 years to a 50% chance — and that is assuming the attacker knows the alphabet and has no other way in. Nobody is guessing it; they'll find it written on a clue card instead. |
| Storing IPs or user agents | Nothing to store them for. The upside is that the database holds no personal data at all — just team names people chose themselves. |
| Login rate limiting | The admin password is long and only you know it. A login-attempt table to defend a single-user dashboard for one evening is machinery for its own sake. |

Four things stay, because they are the game rather than security:

1. **Codes and slugs never reach the client.** A code is read from the database inside a Server Action and compared there. It is never passed as a prop, never serialized into the RSC payload, never in a `<Link>`. If it leaks, the game is over on the first night — C9 greps the build output to prove it hasn't.
2. **`Referrer-Policy: no-referrer`.** One header, in `next.config.mjs`. It exists for a specific reason: if any chamber page ever loads or links to an external host, the browser would send the full slug in the `Referer` header, quietly handing your hidden URLs to a third party's logs.
3. **`submitted_at` is always Postgres `now()`.** Timestamps are never taken from the client, so a phone with a wrong clock can't win a chamber.
4. **Codes are compared with `timingSafeEqual` (C7).** This one has to be here, because it is what makes the row above true. Skipping rate limiting is justified by 31⁸ being unguessable, and that argument only holds if there is no cheaper oracle than guessing — and `a === b` short-circuits at the first mismatched character, so a comparison timed from the outside leaks the length of the matching prefix and turns 31⁸ guesses into 8 × 31 = 248. A nanosecond-scale difference is not measurable across a network with millisecond jitter, so this closes a theoretical hole rather than a practical one. It is three lines, and without it the 1,350-year figure above is not the figure that applies.

React escapes interpolated strings, so team names on the public standings are safe as long as no component uses `dangerouslySetInnerHTML` — worth knowing since the standings display text that strangers typed.

---

## 8. Environment variables

```bash
DATABASE_URL="postgresql://…"       # Neon pooled connection string
ADMIN_PASSWORD="…"                   # 24+ chars, generated
SESSION_SECRET="…"                   # 32+ bytes, signs the admin session cookie
NEXT_PUBLIC_SITE_URL="https://…"     # for copyable chamber URLs in the admin + OG tags
```

`.env.example` commits all four **with empty values**. Real values go in `.env` locally and Vercel's env UI for preview and production.

---

## 9. Scale: 500 people at once

The load is spiky and mostly reads. Five things carry it:

**1. The driver, not a pool.** `@neondatabase/serverless` with `drizzle-orm/neon-http` makes each query a single HTTP request over the pooled endpoint — no persistent connection, so a spike can't exhaust a connection pool, and a serverless instance that scales to zero mid-event costs nothing to wake.

**2. One round trip per page load, not two.** A chamber page needs the suit row *and* the event row. On venue wifi, an extra round trip to Singapore is ~80 ms of visible latency. Use `db.batch([...])` or a single join so the page is one query.

**3. Edge caching on the polling endpoint.** This is the important one. 500 phones on `/standings` polling every 15 s is ~33 requests/second — not a disaster, but there's no reason for it to reach the database. `/api/leaderboard` returns:

```
Cache-Control: public, s-maxage=5, stale-while-revalidate=30
```

Vercel's edge absorbs the entire fan-out and at most one origin query happens per 5-second window, no matter how many people are watching. Clients poll every 15 s and pause on `document.hidden`.

**4. A static standings shell.** `/standings` renders as a static page that fills itself from the API client-side, so 500 simultaneous page opens are CDN hits rather than function invocations.

**5. Bounded writes.** Worst case — all 500 people submitting inside two minutes — is about 4 inserts/second against a table with a unique index and under 2,000 rows. Neon will not notice. The unique constraint means even a double-submit storm produces one row per team per suit.

The only genuine risk is the **first** submission of the evening paying a Neon cold start. Send one test submission a few minutes before the event opens.

---

## 10. Commit plan

Each commit builds, deploys, and leaves the site in a coherent state. Commit messages follow `<type>(scope): summary`.

---

### C1 — `chore: bootstrap Next.js (JavaScript), Tailwind, and repo hygiene`

**Goal:** an app that runs, in plain JS, with the repo cleaned up.

**Files:** `package.json`, `jsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `eslint.config.mjs`, `.prettierrc`, `app/layout.jsx`, `app/page.jsx` (placeholder), `app/globals.css`, `.env.example`, `.env` (fix the key), `.gitignore`, `README.md`

- Scaffold Next.js 16 App Router as **JavaScript** — `.js`/`.jsx` only, no `tsconfig.json`, no `@types/*` beyond what Next pulls in. `jsconfig.json` holds the `@/*` → `./*` alias so imports read the same as they would in TS. Omit `baseUrl`: it is deprecated ahead of TypeScript 7, and Next resolves `paths` relative to the config file.
- **ESLint, the Next 16 way.** `next lint` no longer exists, so the script is `eslint .` and `eslint.config.mjs` uses the flat config the package now exports directly:

  ```js
  import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

  export default [...nextCoreWebVitals, { ignores: ['db/migrations/**'] }]
  ```

  Do **not** wrap this in `FlatCompat`. `eslint-config-next` 16 returns a flat config array whose `plugins.react` creates a circular reference, and the legacy validator dies on it with `TypeError: Converting circular structure to JSON`. The array already carries its own global ignores (`.next`, `out`, `build`, `next-env.d.ts`), so only project-specific ignores need declaring.
- Tailwind v4 via `@import "tailwindcss"` and `@tailwindcss/postcss`. This is a mobile-first stylesheet by default; do not add a desktop-first reset on top.
- Fix `.env`: wrap the connection string as `DATABASE_URL="…"`. Remove `implementation.md` from `.gitignore`; delete the stray `t` file.
- Scripts: `dev`, `build`, `start`, `lint`, `format`. The `db:*`, `seed`, `export` and `test` scripts land with their targets in C5 and C6 — wiring them here would put four scripts in the repo that fail on a fresh clone.

**Done when:** `npm run dev` serves a page, `npm run lint` and `npm run build` are both clean, and `find app -name "*.ts*"` returns nothing.

---

### C2 — `feat(theme): design tokens, mobile-first type scale, and layout primitives`

**Goal:** the palette and type exist as tokens before any component uses a colour.

**Files:** `app/globals.css`, `app/layout.jsx`, `components/ui/{Container,Stack,Rule,Button}.jsx`, `lib/cn.js`, `app/dev/theme/page.jsx` (scratch page for the done-when check)

- The six colour tokens and the `data-mode` swaps from §5. Two-layer token setup, and the distinction matters:
  - **Palette** (`--color-paper`, `--color-ink`, `--color-maroon`, …) under plain `@theme`. These are the only literal colour values in the project, and they must *not* change on a mode flip.
  - **Semantic** (`--bg`, `--fg`, `--rule`, `--accent`) declared in `:root` and overridden per mode, then surfaced to Tailwind under **`@theme inline`**. `inline` is the load-bearing word: it makes `bg-bg` compile to `var(--bg)` rather than baking in the value at build time, which is what lets one attribute change on `<html>` recolour the whole site. The corollary bites: anything under `@theme inline` is *not* emitted as a custom property, so `var(--color-bg)` is undefined — use `var(--bg)`.
- Type scale in `clamp()`, mobile value first. Anton (display), Archivo (body), JetBrains Mono (timestamps, codes, figures) via `next/font/google`, subset and self-hosted.
- The mobile-first rules from §5 that belong at the token layer: `100dvh` sizing, safe-area insets, `16px` minimum on inputs, `-webkit-tap-highlight-color`, `overscroll-behavior`. Background colour goes on `<html>` as well as `<body>`, or the iOS overscroll area flashes white on a dark page.
- Four dumb primitives that reference only semantic tokens. `Button` is `min-h-[52px]` and states are `:active`, never `:hover`.
- **Tailwind scans source text, not runtime values.** A class built at runtime — `` `text-${step}` `` — is never generated. Anywhere a class name depends on data, either write the full string in the file or use an inline `style` with `var()`. The scratch page does both, deliberately, as the reference for how to handle it.

**Done when:** the scratch page renders correctly with `data-mode` swapped by hand, at 375 px and 1440 px; the palette swatches hold still while the semantic swatches invert; and no input zooms the page on focus in iOS Safari.

---

### C3 — `feat(glitch): continuous good/bad oscillator, overlays, and scramble hook`

**Goal:** the signature effect, isolated and tunable.

**Files:** `components/glitch/{GlitchProvider,GlitchOverlay,GlitchText}.jsx`, `components/glitch/useScramble.js`, `lib/glitch.js`, `app/globals.css` (the `@layer components` block), `app/layout.jsx` (mount the provider), `app/dev/glitch/page.jsx`

- `GlitchProvider`: mode state, jittered 4–10 s interval, micro-stutter at each flip, the `.is-tearing` window, rare signal-loss flash, and a `visibilitychange` pause. Reads `prefers-reduced-motion` and disables itself entirely.
- **Hooks discipline, because the React Compiler rules are on.** `eslint-plugin-react-hooks` v7's `recommended` set includes `react-hooks/set-state-in-effect`, and it already caught this pattern in C2's scratch page. Two consequences for this commit:
  - React state is the source of truth; the effect *pushes it out* to `document.documentElement.dataset.mode`. Never read the attribute in an effect and `setState` from it.
  - `prefers-reduced-motion` and `document.hidden` are external systems, so read them with `useSyncExternalStore` (subscribe to the `matchMedia` `change` event and the `visibilitychange` event), not a read-then-`setState` effect. This is also the correct fix for the point in §5 about the CSS `prefers-reduced-motion` block not covering the flip — the oscillator genuinely has to stop, and that decision lives here.
- `GlitchOverlay`: vignette always, scanlines and tear behind the mobile budget. Two structural rules, both of which produce silent visual bugs when broken:
  - **The overlays must be siblings of the content wrapper, not inside it.** A `transform` on an ancestor makes that ancestor the containing block for `position: fixed` descendants, so the overlays would scroll with the page and stretch to document height instead of the viewport. This is why the tear displacement animates `.glitch-content` and never `<body>`.
  - **`mix-blend-mode` only reaches the backdrop within the nearest stacking context, and `position: fixed` forms one.** A blended layer nested inside `.glitch-layer` therefore blends against the other overlay layers rather than the page: the signal-loss inversion renders as a plain white flash and the grain stops blending at all. Grain and flash are consequently their own top-level fixed elements, outside `.glitch-layer`.
- `GlitchText`: `data-text` clones with maroon offsets, triggered by tap and flip, never hover. The clones are `content: attr(data-text)`, so the component falls through to a plain element for non-string children.
- `useScramble`: initial state is the real text, not a scrambled string. A random initial value differs between server and client and hydration mismatches; the scramble starts on the first tick instead, which reads as the text settling rather than arriving broken.
- `/dev/glitch`: live controls for flip interval, tear duration and layer opacity, plus a forced flip. The opaque knobs are written out as `--glitch-*` custom properties by the provider, so retuning on the venue projector needs no redeploy; copy the values back into `TUNING_DEFAULTS` to make them permanent.
  - **The device-width preview frame is cut.** The overlays are `position: fixed` to the real viewport, so a fake frame inside the page would render them wrong and teach you the wrong thing. Use real device emulation instead.
  - The page reads the *root* provider rather than mounting its own; two providers would both write `data-mode` on `<html>` and fight over it.
  - This route is a bench, not a product surface — it is public and unauthenticated. C12 deletes it and replaces it with the authenticated controller that persists what you set.

**Done when:** `/dev/glitch` flips continuously with no layout shift, no console errors, and no dropped frames on a 4× CPU throttle.

---

### C4 — `feat(landing): the Antardhaan landing page`

**Goal:** the front door. Sets the theme, tells you nothing useful.

**Files:** `app/page.jsx`, `components/landing/{Hero,EventMeta,Footer}.jsx`, `lib/suits.js`, `app/opengraph-image.jsx`, `app/icon.svg`, `app/layout.jsx` (metadata)

- Anton lockup of ANTARDHAAN, scrambled on mount, sized by `--text-display` (`clamp(3rem, 15vw, 9rem)`) so it fills a phone without overflowing. `MRIDANG 2K26` in `text-accent-text` mono.
- Heavy negative space, a single maroon hairline rule, and the five suit glyphs as faint background marks. `lib/suits.js` is created here rather than in C6: the landing page is the first thing that needs a glyph, and two copies of the suit list would be worse than moving the file's first commit.
- **The suit marks are placed by hand, not generated from an index.** A generated row of five would read as navigation, and nothing on this page navigates. Geometry lives in an inline style — literal values, so Tailwind would find them either way, but the inline object keeps the composition readable and sidesteps the source-text scanning trap (C2).
- **`overflow-hidden` on the hero is load-bearing, not tidiness.** The glyphs are offset past all four edges on purpose and ANTARDHAAN is a single unbreakable word; either one would widen the document and give a phone horizontal scroll. Clipping is what makes the mark bleed off the page instead of stretching it.
- The `<h1>` carries `aria-label` of the real word. The scramble changes the text content for its first 700 ms, and without the label a screen reader reading in that window reads glyphs.
- **No links to chambers.** No sitemap entry, no prefetch, no manifest reference. The landing page has no links at all.
- OG image from the same tokens, so a shared link looks like the site. Two things to know about it:
  - It is **permanently in bad mode.** A mode that flips every few seconds has no frame to freeze, and the void ground is the one that reads on both a light and a dark timeline.
  - `next/font` self-hosts Anton as **woff2, which satori cannot read**, so the route needs the TTF separately.
  - **The font is vendored at `assets/Anton-Regular.ttf`, not fetched at build time — corrected in C9.** The first draft fetched it from `raw.githubusercontent.com` inside a `try`/`catch`, on the theory that a network blip should cost the custom face rather than the build. The theory was wrong in a way worth recording: the catch passed `fonts: []` to `ImageResponse`, and **satori ships no font of its own**, so an empty list throws *"No fonts are loaded. At least one font is required to calculate the layout."* The graceful-degradation path was a build that dies on a blip. Earlier builds had simply been lucky with the fetch. It surfaces in C9 because C9 is the first commit that runs a clean production build.
  - The wider lesson: **a build that reaches a third party is a build that fails for reasons that have nothing to do with you.** It also makes the build non-reproducible — the same commit builds differently on a day GitHub rate-limits. 50 KB in the repo removes the dependency and removes the failure path rather than handling it. A missing font is a setup error, so the route now throws with the exact `curl` in the message instead of failing three layers down inside satori.
- `metadataBase` is set from `NEXT_PUBLIC_SITE_URL` in `app/layout.jsx`, falling back to localhost rather than throwing. The consequence is worth stating: **if that var is not set in Vercel before the production build, the deployed OG tags point at localhost.**

**Done when:** it looks intentional in both modes at 375 px and 1440 px, nothing overflows horizontally on a narrow phone, and searching the DOM/source for any slug returns nothing.

**Revised after C14 — the poster pass.** The event poster came in and the landing page was reworked around it. Not a new commit in the §10 map; it lands as its own commit between C14 and C15.

**Files:** `app/globals.css` (a new *Poster grounds* block, `.hero-stage`, `.hero-lockup`, `.hero-lockup-anchor`, `.hero-figure`), `components/landing/{HeroGround,HeroFigure}.jsx` (new), `components/landing/{Hero,EventMeta}.jsx`, `app/page.jsx`, `app/char.webp` (the figure)

- **THE TEXT GOES BEHIND THE CHARACTER, AND IT IS THE ALPHA THAT DOES IT.** The figure was always painted above the lockup and the halftone band, so ordering was never the problem — but "the text shows through him" was reported three times and treated as one stacking bug for too long, and the real cause was the asset. `char.webp` was being read as an opaque render with a plate behind the figure, and every fix that followed was an attempt to make that plate disappear: first a blend against the page, then a luminance mask. Both were solving a problem the file did not have.
- **`char.webp` is a cutout, and the giveaway was in the preview.** The man is opaque and everything around him is transparent, so a blend on it is a no-op, and a mask is worse than a no-op: `mask-mode: luminance` does not read the alpha channel at all, it reads the RGB of pixels that are already invisible — so masking a cutout paints a flat silhouette over a figure that already had its own detail, which is strictly worse than doing nothing. What read as a light-grey plate in a preview was the viewer's own backdrop showing through the transparency. **That is also why `char.png` previewed on *black* and `char.webp` previewed on *grey*: if the two were a matched pair of positives, the webp's plate would have been pure white. The grey was the tell, and it was available from the first render.**
- **The fix is one filter on `.hero-figure`.** The art is the poster's positive — dark figure, white highlights, transparent ground — which is right for good mode as it stands. Bad mode puts it on ink, so it is inverted: `filter: invert(1)` on the base rule, `filter: none` under `[data-mode='good']`. The invert is on the base rule rather than the other way round because `:root` carries the ink palette and good mode is the override, so a missing `data-mode` attribute still has to land on ink.
- **`invert()` is safe here for exactly the reason it was unusable before.** It leaves the alpha channel alone, so the transparent ground stays transparent and the mode flip costs nothing — no blend, no mask, no filter pair. That is why this is twelve lines of CSS instead of sixty, and it is the thing the earlier arrangement could not do at all: a plate that has been blended away is transparent *by construction*, and a transparent figure has no body to put in front of anything.
- **The figure is sized from the viewport WIDTH, with the hero as a guard — and the order of those terms is the point.** It was `min(84%, 108vw, 50dvh)`, three height-based terms where `108vw` almost never bound, so the figure was effectively height-driven: on a laptop `50dvh` pinned it and dragging the window wider grew the wordmark and left the figure exactly where it was. `min(80vw, 76%)` leads with width so the figure moves on the same axis the lockup does. On a phone the viewport is taller than it is wide, so `80vw` is the smaller term and the figure really is width-driven. On a landscape laptop it is the reverse — `80vw` at 1440 is 1150px against a 720px hero — so the hero binds and widening the window alone will not move it. That is geometry, not a bug: a purely `vw` figure on a landscape screen would be taller than the hero and `overflow-hidden` would cut its head off. The number to move for how big it reads on a laptop is the `76%`.
- **`isolate` on the hero section is containment, and it outlived the reason it was added.** A blended element blends against its nearest stacking context's backdrop, and `.glitch-content` picks up a `transform` during every tear — which is why it went in. There is no blend in the hero any more, but it is still earning its place: `position: relative` alone does not create a stacking context, so without it the lockup's `z-index: 0` and the figure's `10` would be ranked against every other positioned element on the page, and a z-index in `EventMeta` or the footer could land between them. `bg-bg` is the hero's own ground rather than a blend backdrop — bad mode is the default, so the section is ink and the figure on it is inverted to match.
- **`object-fit: cover` on the figure, as insurance rather than as decoration.** With the box's aspect ratio and the art's identical it does nothing; if a future export arrives at a different ratio it crops instead of stretching. "Don't distort the figure" is then enforced by the CSS rather than by the two ratios staying in step.
- **A note on how this went wrong, because the failure mode is repeatable.** The plate was inferred from a preview and never checked against the file — the same mistake as `--figure-crown: 0.84`, one pass earlier, and both produced an elaborate, internally consistent design for an asset that did not exist. The mask pass has a whole `@supports` gate, a two-layer XOR inversion and three paragraphs of justification, all downstream of one unverified read. **Two rules fall out of it: a constant that describes a specific image is read off the file, never reasoned to; and a preview that shows a rectangle behind a figure may be showing the viewer's backdrop, so the file itself is the only witness.**
- **The figure is imported by `Hero.jsx` despite the lesson above**, and deliberately. The rule about imports is about weight, and `<HeroFigure>` is a single `<img>` with no logic to ship. A second slot prop would have been ceremony that bought nothing and made the paint order harder to read — and the paint order is the thing that matters: ground, then lockup, then figure, because the figure is in front.
- **The overlap is anchored to the figure, not to the hero, and that is a correction.** It was written first as "the figure stands on the bottom edge and the lockup is centred in the hero, so the overlap is whatever those two produce" — which is true, and produced a head buried in the middle of the word. The reason it could not be fixed by nudging a percentage of the hero is that the two things are sized on **different scales**: the lockup is `vw` and the figure is a share of the hero, which is the leftover after the meta and the footer. An offset expressed as a share of the hero is right at exactly one window size — at 1440px a crown crossing 3% of the hero is a fifth of the letters, and at 375px the same 3% is half of them. So the lockup is now positioned, not laid out: `.hero-lockup-anchor` sits absolutely inside the section at `bottom: calc(var(--figure-h) * var(--figure-crown) - var(--lockup-cap) * 0.35)`. The quantity is a share of the **cap** because that is what the eye is judging, and it holds from 320px to 2560px.
- **`--figure-crown` was estimated once, and that one digit was the whole bug.** It went in at `0.84` on the reasoning that the art "has roughly 16% of empty above the head". It has 20%. At 0.84 the lockup was anchored **above** the crown — by 27px on a desktop and 13px on a phone — so instead of an overlap there was a gap, and the only reason desktop looked like a near-miss rather than an obvious hole is that the cap is larger there and the `0.35` term happened to cancel most of it. Mobile, where the cap is 35px, had a plain 6px gap and no overlap at all, which is exactly what was reported. **The lesson is not "measure twice": it is that a constant describing a specific image cannot be reasoned to, only read off the file.** The number is now measured against the art (the dome starts 20% down) and the comment in `globals.css` says to re-check it against the file rather than re-derive it. It holds for both files, which are the same picture. `--lockup-cap`'s `0.73` is the same class of constant — Anton's cap height — and `0.35` rather than `0.2` exists because the box's bottom edge sits ~0.07em below the baseline, so a share of the box is not a share of the ink.
- **The stage exists to hold those numbers together.** `.hero-stage` carries `--figure-h`, `--lockup-size`, `--lockup-cap` and `--figure-crown` because none of them means anything alone — the overlap is a product of all four, and splitting them across two files would make the composition unreadable at exactly the moment someone wants to nudge it.
- **The stowaway file location.** `char.webp` is in `app/` because that is where it was dropped. A static import works from there, hands back `width`/`height` at build time and gets the file hashed and cache-busted, which for a 2160×2700 render on 500 phones is worth more than the tidier path — but `public/` is where a runtime image belongs, and moving it means changing the import to a plain `/char.webp` string and dropping the two attributes. Neither is wrong. The mask is gone, so nothing here depends on the URL reaching CSS any more, and the move is now genuinely a one-liner.
- **The lockup scales with the window, with a ceiling — and the first pass got that wrong in the other direction.** `--text-display` is `clamp(3rem, 15vw, 9rem)`, so above about 960px the type stopped responding and a 1440px laptop and a 2560px monitor drew the identical page. The first fix dropped the ceiling entirely, on the reading that "it should scale" meant "with no upper bound"; on desktop that is a 216px wordmark running four fifths of a 1440px window, larger than the hero it sits in, and the figure behind it stopped reading as a figure. The ceiling was doing real work — the mistake was its value. It is now `clamp(3rem, 12vw, 11rem)`: still viewport-driven, holding ~60-65% of the window below about 1470px and then fixed. The `--text-display` token is untouched, because the 404 (`app/not-found.jsx`) and the dev type specimen both use it and neither wants to be uncapped.
- **The `z-index` is explicit** (anchor `0`, figure `10`) so that reordering the JSX cannot silently put the text back on top and leave someone debugging the wrong thing. It is not what makes the character opaque — the alpha is — but it is what makes the order legible without reading `globals.css`.
- **The hero no longer uses `<Container>`.** A 68rem cap on the box does not constrain text sized in vw — it overflows and centres anyway — so the only part worth keeping was the gutter, which is now `px-5 sm:px-8` by hand.
- **Two things were taken from the poster and then taken back out**, and the reasons are worth keeping because both were the obvious thing to reach for: the halftone field **torn into four misregistered quadrants**, and a **hairline corner frame**. The torn field read as noise rather than as print at the sizes the page actually draws it; the corner marks competed with the composition instead of framing it. What survived is the texture — the jaali over the ground and a single halftone screen across the wordmark's middle. Both are quiet by design, because a figure is coming to sit on top and two loud layers cannot share a hero.
- **The torn field's one real lesson survives it.** Clip first, then translate — which is the order CSS applies them in — so the seams open up; translating first slides the cut lines along with the ink and the misregistration is invisible. If the effect is ever wanted again, that is the ordering, and it is not obvious.
- **The suit glyphs moved from `--fg` to `--accent-text`.** The poster's corner ornament is dark red, not grey, and `--accent-text` is the mode-correct red in both frames — the lightened `#c4576a` on ink, maroon itself on paper — so the marks stay red through the flip instead of going muddy in one of the two. Opacities went up to match, the lightened red being dimmer than paper. The halftone screen uses it for the same reason: `--accent` is 1.8:1 on ink and the screen would simply vanish in bad mode.
- **The ornament is a CSS mask, not a background image.** A data URI cannot reference a CSS variable, and the scanlines above have to hand-write their SVG once per mode for exactly that reason; `mask-image` + `background-color: currentColor` costs one more property and makes the flip free. (`-webkit-mask-*` is written out explicitly — Lightning CSS is not relied on to infer it.)
- **None of the ground is in the mobile budget.** It is static — no animation, no blend mode, no per-frame work — so unlike the scanline and grain layers it stays on at every width.
- **The decoration left the client bundle, and that is the structural change worth remembering.** `Hero` is the only client component on this page, so the entire ground used to ship to the phone in JavaScript to be positioned by inline styles that never change. It is now `HeroGround`, rendered by `app/page.jsx` and passed to `Hero` as `children`.
- **`children` and not an import, and this is the trap.** A client module's imports join the client bundle, so `import { HeroGround } from './HeroGround'` inside `Hero.jsx` would have compiled the ground as a client component and shipped the lot — while looking, in that file, exactly like it had been taken out. The page is a server component; passing it down is the one arrangement where it is really rendered on the server. This was written the wrong way first and caught on review, not by a test.
- **The hero's `overflow-hidden` is doing more work than it was.** The glyphs are offset past the edges as before, and the lockup is now sized to run ~78% of the viewport at every width, so it is the only thing standing between the composition and a horizontally scrolling phone.

**Not yet observed running.** No browser has rendered any of this, and `npm run lint && npm run test && npm run build:clean` has not been run since the first pass. What that means has changed with this pass, and it changed for the better: the mask path that had never executed *anywhere* is gone, and what replaced it is one `<img>`, one `filter: invert(1)` and a `z-index`. There is no longer anything here with a wrong-*answer* failure mode. The things to check are now all tuning by comparison, in this order: that the figure's background is genuinely transparent in the browser (a rectangle of any colour means the file is not the cutout it is believed to be, and that is the one assumption in this whole block that rests on a preview rather than on the file), that the word and the halftone band are hidden behind him, and that he inverts with the mode flip. Then the overlap and the size.

The numbers composed by eye and most likely to want a nudge: `12vw` in `--lockup-size` (whether the desktop reads as a poster or as a mistake), `0.35` of a cap in the anchor's offset (the overlap), `80vw` / `76%` in `--figure-h` (how big the figure is, and the `76%` is the one that governs on a laptop), and the halftone band's `top: 24% / height: 52%`. The band is a specific suspect — the figure sits opaquely on top of it now, so if the band reads as a hard-edged rectangle rather than as a tint, that is the first thing to pull. A static import also ships `char.webp` exactly as exported, so the file's own weight is worth a look — it is a 2160×2700 render and the figure never draws taller than about 900px on any screen in the composition.

**Done when (unchanged):** it looks intentional in both modes at 375 px and 1440 px, nothing overflows horizontally on a narrow phone, and searching the DOM/source for any slug returns nothing. Two additions from the rework: the lockup has to stay legible and inside the page at 320 px and at 2560 px, and the figure has to invert cleanly with the mode flip — in particular, no rectangle of light or dark around it. And the two this pass added: **only the top of the head crosses the word**, at 320 px and at 1440 px alike; and **the word and the halftone band are hidden where the figure covers them**, which is the whole of what the transparency buys and is the one thing to look at first if it is not.

---

### C5 — `feat(db): Neon + Drizzle schema, migration, and seed`

**Goal:** the schema from §3 exists in Neon, and the rows the site cannot start without are in it.

**Files:** `db/schema.js`, `db/client.js`, `db/seed.js`, `drizzle.config.js`, `db/migrations/0000_*.sql`, `lib/env.js`, `lib/code.js`, `.prettierignore`, `package.json` (scripts)

- **The drizzle-kit config must be `drizzle.config.js`, not `.mjs`.** drizzle-kit discovers `drizzle.config.{js,json,ts}` and does not look for `.mjs` at all — given an `.mjs` config it falls back to the `drizzle.config.json` default and reports *that* file as missing. The error names a file you never wrote, which points at the wrong problem. `package.json` sets `"type": "module"`, so a `.js` config is ESM regardless and the syntax is identical.

- Drizzle schema mirroring §3, including `unique(suit, team_slug)`, the `event_singleton` check, and all four indexes. No `relations()` — every read here is an aggregate (§6), which is SQL, not an object graph.
- `neon-http` driver over the pooled connection string, with a one-time `console.warn` when the URL has no `-pooler` in the host. It works either way; a direct URL just opens a connection per query, which is precisely what §9 is avoiding.
- **`lib/code.js` lands here, not in C6.** The seed is its first consumer, and two generators would drift. It uses `node:crypto`'s `randomInt` rather than `Math.random` — these codes are what stands between a stranger and a chamber, and `Math.random` is not designed to be unguessable. `randomInt` is also uniform, so there is no modulo bias.
- **`lib/env.js` validates lazily.** Importing it is free; the error appears at the first line that *reads* a value, naming the variable. Checking at module load instead turns a missing variable into an import-time crash in whichever file happened to pull it in first — same bug, worse message.
  - `NEXT_PUBLIC_SITE_URL` comes through here for the admin copy-link and the export, but **not** for `app/layout.jsx`, which keeps C4's tolerant localhost fallback. A wrong OG URL is cosmetic; a broken admin page is not.
- **The seed is a script, not part of the migration** — this is a change from the first draft of this section. A migration runs once and is recorded, so you cannot re-run it when a row goes missing for some unrelated reason. `db/seed.js` is idempotent and **never overwrites**: both inserts are `onConflictDoNothing`, so running it after the event has started will not touch a start time you set, a slug you rotated, or a code you generated. It prints the target host (never the credential) before writing, because a seed that quietly ran against production is the classic way to lose an evening.
- **`drizzle-kit generate` writes the migration — do not hand-write `0000_*.sql`.** The instinct is reasonable and it fails silently: `drizzle-kit migrate` finds pending migrations through the journal in `db/migrations/meta/`, so a hand-written `.sql` with no matching snapshot is *never applied* and no error is raised. When something genuinely cannot be expressed in the schema, the supported route is `drizzle-kit generate --custom`, which creates the journal entry for you.
- `npm run db:generate` → `db:migrate` → `seed`, in that order. No `db:push`: it bypasses the migration folder and desynchronises it, and with exactly one migration there is nothing to gain.
- `event.glitch` (jsonb, default `{}`) is created with the table here; C12 is the only thing that ever writes to it.

**Done when:** `npm run db:generate` has produced `0000_*.sql` and you have **read it** before applying it — in particular the `event_singleton` check, which Drizzle emits with a qualified column reference and is worth confirming renders as `"event"."id" = 1` rather than something Postgres rejects. Then: `npm run db:migrate` applies cleanly, `npm run db:studio` shows the three tables with their indexes, `npm run seed` is safe to run twice, inserting a duplicate `(suit, team_slug)` is rejected, and `explain analyze` on the per-suit leaderboard query shows an index scan rather than a sort.

---

### C6 — `feat(lib): team-name normalization`

**Goal:** the pure logic that stops one team becoming two rows, tested before anything calls it.

**Files:** `lib/team.js`, `lib/team.test.js`, `lib/code.test.js`, `vitest.config.mjs`, `package.json` (the `test` script)

- `parseTeamName(raw)` → `{ displayName, slug } | null`. One function returning both forms, rather than a slug-only normalizer plus a second `.trim()` at the C7 call site: the 40-character rule and the display value have to agree about what the name *is*, and two places computing it is how they stop agreeing. `null` for every rejection, because C7's failure path is already a returned object and an exception would have to be caught and converted back into the same thing. The cost is that C7 cannot distinguish "too long" from "empty" and shows one message for both — deliberate, since neither is recoverable from the caller's side.
- **Accent folding is Latin-only, and this is the subtle one.** The obvious implementation strips `\p{M}` after NFD. `\p{M}` is *every* combining mark in Unicode, including the Devanagari matras and the Arabic and Hebrew vowel points — characters that are part of a letter, not decoration on one. Stripping those turns `टीम` into `टम`, so two Hindi-named teams could never match each other at a Hindi college fest. The fold instead matches `(\p{Script=Latin})\p{M}+` and keeps the captured base, so it can only apply where it is wanted. `NON_ALPHANUMERIC` keeps `\p{M}` in its allowed class for the same reason — a surviving matra is part of its word, and dropping it there would undo the fix.
- **Apostrophes are deleted, not turned into a space.** They are the only punctuation mark treated that way, and the reason is the whole point of the file: `"Bob's Boys"` and `"Bobs Boys"` are one team spelling one name, and the general rule would give `bob s boys` and `bobs boys` and split them.
- **The 40-character limit counts code points**, not UTF-16 units. An emoji is one character to the person who typed it and two to `.length`, so `[...name].length` — the obvious check would reject a 31-character name for being 56 long.
- `lib/code.test.js`: `generateCode` and `generateSlug` return the right length, never emit an ambiguous character (`0/O/1/I/L`), draw from all 31 alphabet characters rather than leaving the last one unreachable, and do not repeat across a large sample.
- `vitest.config.mjs` pins `include: ['lib/**/*.test.js']`. The default glob excludes `node_modules` but not `.next`, and by C16 this commit sits next to a production build. The tests import relatively, so no `@/*` alias resolution is needed. `vitest` installs with `npm install -D vitest`, its version left to the resolver rather than guessed at.
- `lib/suits.js` (C4) and `lib/code.js` (C5) already exist — C5 moved `code.js` forward because the seed needs it. This commit adds the tests for it rather than the file.

This is the one place a test earns its keep: a normalization bug doesn't crash anything, it just quietly shows two rows for one team in front of everyone.

**Done when:** `npm run test` passes, including a case proving `"Team  Vortex!"` and `"team vortex"` produce the same slug, and a case proving `टीम वर्टेक्स` survives with its matras intact.

---

### C7 — `feat(chamber): slug resolution and the submission action`

**Goal:** the write path, end to end, with no UI yet.

**Files:** `lib/chambers.js`, `lib/submissions.js`, `app/[slug]/actions.js`, `app/[slug]/page.jsx` (minimal), `app/[slug]/SubmitProbe.jsx` (C8 deletes it)

- `getChamberData(slug)`: one batched query (`db.batch`, one HTTP round trip — §9.2) returning the suit row and the event row; `notFound()` on a slug miss; respects `is_active` and `submissions_open`.
- **The code is never selected here.** Not fetched and then filtered out — never read. §7's first rule breaks in practice via a `select()` with no column list whose result gets spread into a client component's props. Excluding the column at the query makes the guarantee structural: a value that was never fetched cannot escape through a careless prop, a `<Link>` or an RSC payload, and that does not depend on discipline holding at four separate call sites.
- **A retired chamber is a 404, not a "closed" page.** `is_active = false` goes to the same `notFound()` as a typo. A page that says "this chamber has been deactivated" confirms a leaked slug was real, which is the one thing a leaked URL must never do (§4).
- **The logic lives in `lib/submissions.js`, not in `actions.js`.** A `'use server'` module makes every export a publicly callable endpoint; keeping the logic out of it means the action file's callable surface is exactly one function, and the logic stays importable by a test.
- **The action takes `(prevState, formData)` and reads the slug from a hidden field**, rather than binding the slug onto the action. Binding reads better but `useActionState` calls its action as `(prevState, formData)`, so a bound slug lands in the wrong parameter. The hidden field is safe because the slug is not what authorises anything: the action re-resolves it and checks the code against whichever suit comes back, so a tampered slug only chooses a different chamber to be rejected by.
- **Codes are compared with `timingSafeEqual`.** This looks like the hardening §7 skips, and it is not — see the new item 4 in §7. Short version: skipping rate limiting is justified by 31⁸ being unguessable, and that argument only holds if there is no cheaper oracle than guessing.
- `submitEntry` returns `{ ok: true, duplicate, submittedAt, elapsedMs }` or `{ ok: false, reason: 'bad_code' | 'closed' | 'invalid' }`, documented as a JSDoc `@typedef` since there are no types. `elapsedMs` rather than `elapsed` so the unit is in the name.
- **Three situations collapse into `'closed'`**: a slug that stopped resolving, a chamber retired mid-event, and the global `submissions_open` switch. They are one sentence to the person holding the phone, and none is a distinction a participant can act on.
- The duplicate path re-reads the existing row and returns its original timestamp, so a double-tap is harmless and the participant sees the time they actually earned. The conflict target is named (`[suit, teamSlug]`) rather than left bare, so a conflict on anything else surfaces as an error instead of being swallowed.
- The page sets `dynamic = 'force-dynamic'` and deliberately has **no `generateStaticParams`** — a statically rendered chamber would bake every slug into the build output.

**Done when:** manual checks cover a valid code, a wrong code, a duplicate submission, a deactivated suit, submissions closed, and a slug that never existed rendering the decoy rather than anything that confirms it does not.

---

### C8 — `feat(chamber): the five chambers, built for a phone`

**Goal:** the participant-facing page — the most important screen in the project.

**Files:** `app/[slug]/page.jsx`, `components/chamber/{SuitSigil,SubmitForm,ResultPanel}.jsx`, `components/chamber/sigils/*.jsx`

- Suit sigil hero at large scale — ♠ ♣ ♦ ♥ plus a hand-drawn joker sigil, each as inline SVG that participates in the mode flip.
- One form: team name, code, submit. Name field autofocused; the code field takes over on `enterKeyHint="go"`. Bottom-anchored submit inside thumb reach, ≥ 52 px, with `env(safe-area-inset-bottom)` padding.
- Pending state disables the button while the action is in flight — 500 people on flaky wifi will double-tap, and the unique constraint is the backstop rather than the plan.
- Result states, each with its own treatment: **recorded** (scramble reveal, timestamp, elapsed), **already recorded** (the original timestamp, calm rather than alarming), **wrong code** (generic — never hints at how close), **closed**. Each is announced via `aria-live` so a screen reader hears the outcome, and focus moves to the panel on submit.

**Done when:** a real submission on a phone takes under 15 seconds with one hand, and the confirmation is legible at arm's length in both modes.

---

### C9 — `feat(secrecy): noindex, no-referrer, decoy 404, and the build audit`

**Goal:** close the discovery surface before anyone sees the site.

**Files:** `app/robots.js`, `app/not-found.jsx`, `next.config.mjs`, `app/layout.jsx`, `scripts/audit-build.mjs`

- `robots.txt` disallows everything. **`noindex` goes in the root layout, not per page.** The brief named the chamber and standings pages, but no page on this site should be findable — it is five hundred people who were handed a URL, and every public surface is a decoy by design (§4). Setting it once in `app/layout.jsx` means a page added later cannot forget it, which is exactly the failure a per-page rule has.
- **`Disallow` and `noindex` do not stack the way it looks, and the plan should say so.** A crawler that obeys `Disallow: /` never fetches a page, so it never reads that page's meta tag. They cover different arrivals: robots.txt stops the crawl; the meta tag is what a crawler sees if it arrives anyway, which is the normal case for link unfurlers (Slack, Discord, Twitter) that read meta tags and ignore robots.txt. Neither is redundant and neither is sufficient alone.
- `Referrer-Policy: no-referrer` in `next.config.mjs`, for the reason in §7. `source: '/:path*'` so it covers `/` as well as the chambers, the decoy and the API routes. It is deliberately the only entry — the rest of the header set belongs to a site defending itself from strangers.
- `not-found.jsx`: a decoy that reads as part of the piece — it's the page an explorer is most likely to hit, so it should look deliberate. It is also the page with the tightest constraint in the project: it must confirm nothing about what *does* exist. No "chamber not found", no "check your code", no list of suits. One sentence, about this address alone, identical whether the visitor typed `/.env` or came one character short of a real slug.
- **The build audit is a command, not a ritual.** The brief wrote it as "`npm run build`, then grep `.next/` for every real slug and every code" — but a grep needs the secrets as arguments, which puts them in your shell history, which is the opposite of the point. `npm run audit` reads them from the database and walks the build output itself. It checks slugs and codes; it also checks `ADMIN_PASSWORD` and `SESSION_SECRET` if they are set, since those are the same failure class and two lines away. It **fails loudly** rather than passing quietly: an unseeded database, a missing build, or any secret too short for a substring search to mean anything each produce an explicit refusal to call the result clean.

**The first run found a slug, and the finding was the script's fault — but not entirely.** `npm run audit` on the real project reported `SPADES slug` in `.next/dev/trace`, in a span reading `"inputPage":"/c/c5t6dhy8us"`. Three things came out of it, and all three are now in the script:

1. **`.next/dev` is not build output.** It is the dev server's tree — never written by `next build`, never served by `next start`, never uploaded by Vercel — and it holds a trace of every URL the dev server has rendered. `.next/cache` and `.next/diagnostics` are excluded for the same reason. The exclusion is a denylist rather than an allowlist of `.next/static` and `.next/server`, deliberately: if a future Next version starts serving a new directory, a denylist still scans it while an allowlist would stop checking it silently. A denylist fails towards a noisy false positive, which is the direction to fail in — but the noise was still worth removing, because a scanner that cries wolf is one people learn to skim.
2. **`next build` does not clean `.next/dev`, so a working checkout holds a mixed tree** — dev artifacts sitting beside the production build. That is the one state where the audit cannot mean what it says: the promise is "the bytes `next build` wrote are clean", and from the outside there is no way to tell which files the build wrote. It now refuses to certify a mixed tree and points at `npm run build:clean`, rather than scanning around the problem and printing "Clean" next to a directory it could not vouch for. That false confidence is exactly what the script exists to prevent.
3. **The general lesson: anything that logs URLs leaves real slugs on disk.** The dev server does it. Vercel's function logs will do it. So will browser history on any device a participant used. None of that is a leak in the sense §7 means — no participant can reach your Vercel dashboard — but it means the slug's secrecy has an operational floor, and it is worth knowing where the copies are rather than being surprised by them. It also means the audit's scope should be "what a browser can fetch", which is now what it is.

The scan was otherwise clean: **no code appeared anywhere**, in a tree that included 538 files of build output. §7's structural claim — that a column never selected has no value to leak — held on the first real test.

**Done when:** `npm run audit` on a production build of a *seeded* database prints clean, and `/anything-wrong` renders the decoy without hinting that a correct slug exists.

---

### C10 — `feat(admin): password login, session cookie, and route guard`

**Goal:** only you reach `/admin`.

**Files:** `app/admin/login/{page.jsx,actions.js}`, `components/admin/LoginForm.jsx`, `lib/{session,password}.js`, `proxy.js`, `components/glitch/GlitchProvider.jsx`, `lib/{glitch,glitch.test}.js`

- Login form → compare against `ADMIN_PASSWORD`. The comparison uses `timingSafeEqual` from `node:crypto` — one line, no dependency, no ceremony.
- Session: a `jose` HS256 JWT in an HttpOnly + Secure + SameSite=Lax cookie, 12 h expiry, signed with `SESSION_SECRET`. A signed cookie rather than storing the password in it, which is the one shortcut worth not taking.
- `middleware.js` guards `/admin/:path*`, redirecting to login. Edge-safe, so keep it free of database imports.
- Login page styled with the same tokens but **the oscillator off** — you'll be reading this at 1 a.m. with 30% battery, and it should not fight you.

**Five ways this came out different from the brief above, and why.**

1. **`middleware.js` became `proxy.js`, and the rename is more than a rename.** Next 16 renamed the convention — the codemod is `middleware-to-proxy` — so `middleware.js` still runs but warns on every dev boot and every build, and the build refuses outright if both files exist. The export has to be renamed with the file: the entry template does `mod.proxy || mod.default`, so a `proxy.js` exporting `middleware` throws *"must export a function named `proxy`"*. What makes it more than cosmetic is in `entries.js`: `runDependingOnPageType` sends a proxy file to `onServer()` unconditionally, where a middleware file goes to the edge unless it opts out. **The whole of this commit was first written on the assumption that the guard runs on the edge. It does not, and the code was simpler once that was known** — see below. `config.matcher` survived intact (`get-page-static-info.js` reads it for either filename), so the guard is still scoped to `/admin` and nothing else.

2. **The auth code is two files, and the reason for that changed mid-commit.** It was written while the guard was edge-bound, where `node:crypto` does not resolve — so the JWT and the password comparison could not share a module, and `lib/session.js` read `process.env.SESSION_SECRET` as a *literal* member expression rather than through `lib/env.js`, because only the written-out form gets substituted into a bundle and the dynamic `process.env[name]` form depends on a runtime `process.env` an edge bundle is not guaranteed to have. On Node, both of those are non-issues and the file now reads the secret the way everything else in the project does. The two files stay split for the reason that never depended on the runtime: `verifyPassword` cannot live in the action file, because a `'use server'` module turns every export into a publicly callable endpoint, and a callable password comparison is worse than the thing it protects. The guard also imports `lib/session.js` on every `/admin` request and has no use for a comparison it never calls.

3. **`verifyPassword` hashes both sides before comparing, and that is the opposite call from `codesMatch` in `lib/submissions.js`.** That one checks lengths first and says why: a suit code is 8 characters from a published alphabet, so its length is public. A password's is not. `timingSafeEqual` throws on a length mismatch, so the "obvious" fix — check lengths, then compare — returns on the first byte for nearly every wrong guess, which is both a shorter path than a correct guess and an oracle for the password's length. Hashing to 32 bytes first makes the inputs the same length by construction.

4. **The "oscillator off" requirement needed a change to the provider, and there is no way around that.** `GlitchProvider` lives in the root layout, which has no per-route props, and nesting a second provider under it does not work — both would write `data-mode` onto `<html>` and fight over it every few seconds. So the provider now reads `usePathname()` and takes the route as a fourth input alongside reduced motion and tab visibility, via `isStillRoute` in `lib/glitch.js`, which holds `/admin` and locks it to bad mode. Bad mode rather than whatever you arrived in, following the two precedents already in the project: reduced motion locks to bad, and `opengraph-image.jsx` is permanently bad because "a mode that flips every few seconds has no single frame to freeze".
   - `/admin/glitch` is carved out of the hold in advance. C12 puts the tuning knobs there, and a held tuning page is a page that lies: you would drag a knob, nothing would move, and you would conclude the publish path was broken. Reserved the same way `RESERVED_SLUGS` reserves words for routes that do not exist yet.
   - `lib/glitch.test.js` starts here with the `isStillRoute` cases, including the prefix-boundary one (`/administrator` must not be held). C12 extends it.

5. **No `?next=` parameter.** Carrying the destination through the login means validating it on the way back, and anything unvalidated there is an open redirect. Sessions last twelve hours, there is one user, and you log in once at the start of the evening — that is not worth an allowlist. The redirect drops the query string.

**Two things deliberately not built.** There is no rate limit or lockout on the login: the control is that `ADMIN_PASSWORD` is generated at 24+ characters, and a per-instance counter in a serverless function counts nothing. And there is no logout in this commit — it belongs with the dashboard shell in C11, and without it the login page stays reachable while logged in, which is the right behaviour while there is no way out.

**Also worth knowing before the first build:** `secure: true` on the cookie is conditional on `NODE_ENV === 'production'`. Not a weakening — production is HTTPS and production gets the flag. It is because Safari silently discards a `Secure` cookie over plain `http://localhost`, so the login would appear to succeed and then bounce back to the form with no error, which is a bad hour to lose.

**Done when:** `/admin` redirects when logged out, the cookie is invisible to `document.cookie`, and the login page is usable one-handed.

**A note that was written before the build ran, and is now moot — kept because the rule it states is not.** While this file was `middleware.js` on the edge, there was a real chance the audit would report `SESSION_SECRET` or `ADMIN_PASSWORD` inside `.next/server/…`, because a compiler inlining `process.env` into an edge bundle writes the value into the artifact. On the Node runtime the value is a runtime lookup instead, the way `DATABASE_URL` has always been, so this should not happen. If it does anyway, read the path before reacting: a secret in `.next/server/…` is a server bundle that is never sent to a browser, which is a different finding from a slug in `.next/static/…`, and the audit should learn to say which it is rather than being waved past.

---

### C11 — `feat(admin): dashboard, start time, and the kill switch`

**Files:** `app/admin/actions.js`, `app/admin/(dashboard)/{layout,page}.jsx`, `components/admin/{StartTimeForm,StatCards}.jsx`, `lib/event.js`

- Start time as a `datetime-local` input, stored as `timestamptz`. Server Action, `revalidatePath('/admin')`.
- `submissions_open` as a labelled kill switch — not gating (per your call), but the thing you flip if a chamber leaks or something breaks mid-event.
- Stat cards: total submissions, teams on the board, suits solved out of five, time since start. Laid out two-up on a phone, four-up on desktop.
- **Logout lands here**, in `app/admin/actions.js` with the button in the new layout. C10 built the cookie and left it without a way to clear it, deliberately: the 12 h expiry is the only exit until this exists, and `lib/session.js` already exports everything the action needs.
- The start-time control shows the resulting elapsed time for the current leader *live*, so you can see the effect of an edit before saving it.

**Done when:** changing the start time updates every elapsed time on the board without touching a submission row.

**Six things worth knowing about how this landed.**

1. **The dashboard is a route group — `app/admin/(dashboard)/` — and the parentheses are load-bearing.** A layout at `app/admin/layout.jsx` wraps every segment beneath it, which includes `/admin/login`: the login page would grow a console header and a "Log out" button, and the one screen on the site whose whole job is to have nothing else on it would stop being that. The group scopes the chrome to the logged-in pages and changes no URL. C12's tuning page and C15's boards drop in beside it and inherit it.

2. **The start-time control is a client component because a `datetime-local` value has no timezone in it, and the server cannot supply one.** The input holds a wall-clock string; what the database stores is an absolute instant (`timestamptz`). Nothing in the string says which offset applies, and a Server Action parsing `2026-09-20T18:30` resolves it against the *server's* timezone — UTC on Vercel — so a start time of 18:30 at the venue is stored as 00:00 and every elapsed time on every board is wrong by five and a half hours. The fix is that the visible input carries **no `name`** and a hidden input next to it carries `inputValueToIso(value)`: the browser does the conversion, because the browser is the only party that knows what the offset was. `lib/format.js` gained both halves (`toLocalInputValue`, `inputValueToIso`) and they are the third and fourth functions in that file that must not run during server rendering.

3. **The input's initial value comes from `useSyncExternalStore`, not from a mount effect.** The stored instant has to be rendered as this device would write it, and the server has no idea which timezone that is — so a server-rendered value is a hydration mismatch on a field React will not repair, showing UTC to someone who is not in UTC. `useSyncExternalStore(subscribeNoop, () => toLocalInputValue(iso), () => '')` is the sanctioned shape for exactly this: server snapshot for the hydration render, real one immediately after. The mount-effect-plus-setState version is rejected outright by `react-hooks/set-state-in-effect`, the same rule GlitchProvider documents. Cost is one frame with an empty field.

4. **The form owns a draft value, and there is deliberately no `key` on it.** The plan at one point had the page pass `key={startIso}` so a save would remount the form and clear the field — that is wrong twice over. A draft that wins once you type keeps the field showing what you typed across the revalidation the save triggers, which is what the save should feel like; and a key would remount the component the instant its confirmation message appeared, so the message would never be read. `null` means "untouched, follow the stored value".

5. **The logout button is hand-rolled; the kill switch is `components/ui/Button`.** Not an inconsistency. `Button` bakes in `w-full`, which is right for a form's submit in a narrow column and wrong in a header row next to a title — and `lib/cn.js` joins rather than merges, so a width passed in to undo it would be settled by Tailwind's emission order rather than by intent. The rule is not "never use Button here", it is "do not pass Button a class that fights one it already has". Both controls clear 44px for a thumb.

6. **`force-dynamic` is declared once, on the group's layout.** Every page in the group is the same kind of page — a live read of a database that changes while you are looking at it — so it belongs on the segment that owns them rather than repeated on each. A statically rendered console would show build-time numbers at the venue, which is the worst way for this surface to fail: plausible and wrong. **Check the build output for `/admin` as `ƒ` rather than `○`** — if it ever renders as static, the segment config did not inherit and each page needs its own line.

**Three things deliberately not built.** There is no control for editing or deleting a submission: a solve is a fact a team earned, and if one is wrong the start time was wrong, so the fix belongs in the field above rather than in a delete button that rewrites history. StatCards' "running for" is stale the moment it is sent — correct, because the page is `force-dynamic` and a server-rendered tick would need a client island holding a clock for a number the reader can round in their head; the live board is C15. And the kill switch posts the state to move *to*, not the state we are in, so a submit from a stale page in a second tab is a no-op instead of a silent flip back.

---

### C12 — `feat(admin): the glitch controller`

**Goal:** the effect stops being a property of the build and becomes something you can dial from your phone at the venue, with the whole room picking it up.

**Files:** `app/admin/(dashboard)/glitch/{page,actions}.jsx`, `components/admin/GlitchKnobs.jsx`, `app/api/glitch/route.js`, `components/glitch/GlitchProvider.jsx`, `lib/glitch.js`, `lib/glitch.test.js`, `app/admin/(dashboard)/page.jsx` (the active-hold banner), and `/dev/glitch` is deleted

- **This is C3's `/dev/glitch` panel promoted into the admin and made to persist.** The knobs are the same; what changes is that they no longer live and die in React state. `/dev/glitch` is deleted in this commit — it was a public route with no auth, and keeping a second copy of the same controls is a maintenance tax with no upside.
- `lib/glitch.test.js` already exists — C10 started it for `isStillRoute`. Extend it with the tuning cases below; do not replace it.
- The value is a partial override in `event.glitch` (jsonb, §3). `{}` means "use the build defaults", so **Reset writes `{}`, not a copy of the defaults** — that is the entire reason it is a partial override rather than a snapshot. A knob added in a later commit needs no backfill, and an edit to `TUNING_DEFAULTS` still reaches every device that has not overridden it.
- **`sanitizeTuning(input)` in `lib/glitch.js` is the security boundary of this commit.** It is the point where a jsonb value becomes a CSS custom property on every visitor's device: an allowlist of known keys, each clamped to its range, everything else dropped. Apply it on write *and* on read — the read side is what stops one bad row from reaching 500 phones at once. `lib/glitch.test.js` covers clamping, unknown-key rejection, and non-numeric input.
- `/api/glitch` serves tuning only — never a code, never a slug — with `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=300`. `max-age` as well as `s-maxage` so a repeat navigation is a browser cache hit and costs nothing at all.
- The provider fetches once on mount and merges. It paints with `TUNING_DEFAULTS` first, so first paint stays identical between server and client and nothing is blocked on the fetch; the override lands a few hundred ms later, which is invisible for opacity knobs. Two rules:
  - **The fetch must not stomp a local edit.** Adopt the remote value only while the tuning is still the initial one. Without that guard, an in-flight response silently reverts whatever you just dragged.
  - **This is a deliberate exception to §9's one-round-trip rule.** That rule is about *server-side* round trips to Neon in Singapore. This is one client-side request to Vercel's edge, cached, non-blocking — and it is what makes "publish" mean anything.
- **A hold.** `hold: null | 'good' | 'bad'` rides in the same blob so the flip can be frozen globally: for reading the rules out, or when the projector is struggling with it. The provider gains it as a third input alongside reduced-motion and tab-visibility.
  - **A global freeze you have forgotten about looks exactly like a bug**, so `/admin` shows a banner while one is active, with the release on the banner itself.
- **`prefers-reduced-motion` still wins over everything** — a published preset, a hold, anything. The oscillator's own media-query check remains the last word; a global control must never be able to take that away.
- Presets: Rehearsal (the defaults), Showtime, Calm. Copying the numbers back into `TUNING_DEFAULTS` is what makes one permanent.

**Seven things worth knowing about how this landed.**

1. **The tuning page lives in the route group (`app/admin/(dashboard)/glitch/`), not at `app/admin/glitch/`.** The URL is unchanged — groups do not appear in paths — so `isStillRoute('/admin/glitch')` still carves it out of the admin hold exactly as C10 reserved it. What the group buys is the console chrome, the same as C11's dashboard: the header, the logout, and `force-dynamic`.

2. **`GlitchProvider` lost its `tuning` prop, and that is the commit's real architectural move.** The provider sits in the root layout, which is a server component and *could* read `event.glitch` — but doing so would make every page on the site a database round trip for a value the edge can serve from cache, and 500 concurrent visitors is the number this whole design is arranged around (§9). So the tuning moved to `/api/glitch` behind a 60-second cache, and the prop that would have made it a build-time input is gone. The prop was never passed by anything; it was left over from C3, when tuning was local state.

3. **The "do not stomp a local edit" guard is a ref, and the first version of it was not.** The obvious version compares the tuning against `TUNING_DEFAULTS` by identity — the initial state *is* that module constant, so `current === TUNING_DEFAULTS` reads as an exact test for "nobody has dragged anything", with no extra state. It is not exact: pressing Reset sets the state back to that same constant, so a fetch still in flight would then be adopted over a reset the user had just made deliberately. The ref is set by a wrapper that the provider exposes *as* `setTuning`, so every edit marks it as a side effect of being an edit — a separate `markTouched()` beside `setTuning()` would be correct until the first call site that remembered one and not the other.

4. **The min/max pairing runs in two places, and the second one is not redundant.** `sanitizeTuning` repairs `minFlipMs > maxFlipMs` when both keys are present, which covers a published pair. But a stored `{ minFlipMs: 15000 }` is perfectly legal on its own — nothing in it is out of range — and only becomes an inverted interval when it meets the *default* max of 10000. `mergeTuning` is the first point where both numbers exist at the same time, so it repairs the pair again. The failure this prevents is quiet: `randomBetween(15000, 10000)` still returns numbers, just from an interval running backwards, and nothing about the effect looks obviously broken. There is now a second pair with the same rule — see the flash-rate note below — and both are driven from one exported `RANGE_PAIRS` list rather than from a special case each.

5. **The freeze is a jsonb patch — `glitch || '{"hold":"bad"}'` and `glitch - 'hold'` — not a read-modify-write.** The read-modify-write version would carry whatever the caller is holding back into the row, so tapping Freeze on the panel mid-drag would publish the half-finished knob positions you had not decided on yet. The freeze is the control you reach for while something is going wrong, so it is the one that has to be right on the first tap. It also gives "released" exactly one representation: `{}` and "no freeze" are the same state, which is what makes `{}` mean the build defaults everywhere else.

6. **Three things the panel does differently from the plan's shape, all for the same reason — the freeze is not a knob.**
   - **The freeze publishes itself.** Every other control needs Publish, because you want to see a change before you commit it. A freeze is the opposite: you press it because something is wrong *now*, and one that also requires a second press is one that does not happen.
   - **Publish is a direct Server Action call, not a form.** The value being published is an object in React state; threading it through a hidden form field as JSON would be a serialisation round trip with no reader.
   - **`releaseGlitch()` takes no arguments**, which is what lets the same function be a `<form action={…}>` on the console banner — no JavaScript, on the device with 2% battery — and a plain async call on the panel.

7. **Reset releases the freeze, and the panel says so.** The hold rides in the same blob, so writing `{}` clears it. That is the right behaviour and it is also a surprise waiting to happen — someone resets the knobs and the room unfreezes — so it is stated on the page next to the button rather than left to be discovered.

**One thing deliberately not fixed.** On the tuning page the sliders show the build defaults for a beat and then jump to the published values, when the fetch lands. Everywhere else that jump is invisible — it is an opacity knob — but the tuning page is where someone is looking directly at the numbers. Removing it would mean seeding the provider from the server on that route, which is a setState-in-effect (the rule `react-hooks/set-state-in-effect` rejects, and the reason the provider uses `useSyncExternalStore` for its other inputs) to save a fifth of a second on one page. The fetch also cannot be made faster without giving up the edge cache that keeps the site off the database.

**Also worth knowing:** `/api/glitch`'s error path returns `{}` with `Cache-Control: no-store`. An empty object is the build defaults, which is exactly the right thing to render when the tuning cannot be read — but caching that for 60 seconds would make a transient database failure look like a publish that did not work, which is the one failure mode here that costs real debugging time at the venue. `console.error` because the client's fetch genuinely cannot tell an empty tuning from a working one, so this log line is the only place the failure is visible at all.

**Added during the commit: the signal-loss flash rate, which was the one rate nobody could move.** The panel shipped in this commit with five knobs, and the flash — the rare full inversion, the frame that looks like the screen lost signal — was not one of them. Its gap sat in `TIMING` as `signalLossMinMs: 30000` / `signalLossMaxMs: 60000` and was read straight out of the constant. The asymmetry was visible in the signatures: `nextFlipDelay(tuning, random)` took the tuning and `nextSignalLossDelay(random)` did not, because one of them had become a knob in C12 and the other had not. Three things came out of closing that.

1. **The failure of leaving it open is the quietest one in this commit.** If the sliders had shipped without the provider being taught to read them, everything would appear to work: the drag moves, Publish saves, the panel shows the new number after a reload, and every device goes on flashing on the old schedule. That is indistinguishable from a cache that has not expired yet, so the first instinct is to wait rather than to look at the code — and the 60-second cache is real, which makes the wrong instinct feel confirmed. What actually prevents it is smaller than it sounds: the delay function takes the tuning, and the signal-loss effect lists `tuning` in its dependencies the way the flip loop already did.

2. **Two rows, not one slider called "Flash every".** The gap is a *range* — the flash fires at a random point inside it, which is what keeps it a surprise rather than a metronome — so a single control would have to either drop the randomness or invent a spread around a midpoint. Neither is worth the row it saves. What changed instead is the readout: the four CSS knobs stay in milliseconds, because 200ms is a number you compare against another at a glance, and the flash gap prints `30s` / `1m 30s`, because `30000ms` is a number you have to do arithmetic on before it means anything.

3. **`RANGE_PAIRS` became an exported list, and the panel's slider handler stopped being two hand-written cases.** There are now two pairs that mean "a random value between these two and the lower one must not cross the upper", and the panel has to carry the other half of whichever pair you are dragging or it shows a pair the database would have to repair. The two `if`s it had were correct for the flip and would simply not have existed for the flash rate — so the panel now reads the same list the sanitiser does, the same way both already read `TUNING_RANGES`. A third pair is now a row in one array.

**The invariant that made the presets a decision.** `lib/glitch.test.js` asserts that every preset carries a value for every key in `TUNING_RANGES`, which is deliberate: `applyPreset` merges onto the current tuning rather than replacing it, so a preset that omitted the flash gap would leave the rate wherever it happened to be. Pressing Calm on a device that had just run Showtime would be calm in every respect except the one that hits hardest. So Showtime and Calm both name the pair — roughly twice as often as the default for Showtime, three to five minutes for Calm.

**Also:** the default `signalLossMaxMs` is 60000, so a stored `{ signalLossMinMs: 120000 }` is the *same* inverted-interval bug item 4 describes, one pair over, and it is easier to reach — wanting a two-minute gap is an ordinary thing to want. It is covered by the same repair and has its own test.

**Done when:** publishing a change moves the effect on a second device within a minute with no redeploy, a hold survives a reload, reduced motion still overrides a published Showtime preset, and dragging Flash min gap and publishing moves the flash interval on that second device too. The three are one line of code each: the 60 s is the `max-age`/`s-maxage` pair on `/api/glitch`, the reload is that the hold is a column rather than React state, and the override is the order of `forced` in GlitchProvider — reduced motion, then the admin hold, then the published freeze. The flash rate needs the panel, the action, `/api/glitch`, `mergeTuning` and `nextSignalLossDelay` to all agree, which is the one path here with five links. **None of it has been observed running yet**: no build, lint, or test has completed since C8, for the environment reason noted in C10.

---

### C13 — `feat(admin): suit codes and hidden slugs`

**Files:** `app/admin/(dashboard)/suits/{page.jsx,actions.js}`, `components/admin/SuitCard.jsx`, `lib/slug.js`, `lib/slug.test.js`, `lib/suit-admin.js`, `components/admin/AdminNav.jsx`, `app/admin/(dashboard)/layout.jsx`

- One card per suit, stacked on mobile: label, glyph, current slug, current code, last updated.
- **Generate code** — new 8-char code, saved, shown immediately with a copy button. Because codes are plain text, you can also reopen this page any time and read them, which is the whole reason for that decision.
- **Edit slug** — generate a random one or type a thematic one by hand.
- **Copy chamber URL** — builds the full `<NEXT_PUBLIC_SITE_URL>/<slug>` and copies it, so sending a chamber to a team is one tap from your phone. It always copies the **saved** slug, and Save is disabled while `slugProblem` reports anything — with the rule it broke named underneath the field, because a reserved word here is a chamber that would silently never resolve.
- **Deactivate** — retires a chamber that leaked, without deleting its submissions.

**Two files were split out, and both splits are the commit.**

1. **`lib/slug.js` — the rules moved out of `lib/chambers.js` so the browser can import them.** The plan above says the card refuses a slug `isValidSlug` rejects, which reads as though the card could just call it. It could not: `lib/chambers.js` imports `db/client.js` and `next/navigation`, so a `'use client'` component importing the rules from there pulls the Neon client into the browser bundle. The alternative — a second copy of the pattern in the card — is the version that goes wrong, because the two drift and the field starts accepting a slug the action then rejects, which presents as a save button that does nothing.

   So the predicates, the pattern, and the reserved set moved to a module with **no imports at all**, and `lib/chambers.js` imports `SLUG_PATTERN` back. There is still exactly one pattern in the project. The reserved set went along with the pattern rather than being split from it, because they answer the same question and `slugProblem` is the single point where the order between them matters.

2. **`lib/suit-admin.js` — the admin reads and writes did not go into `lib/chambers.js`.** That module's header states its central guarantee, and §7 rests on it: it *never selects the code*. Not fetched and filtered, never read. `getSuitConfig` does the opposite, on purpose. Putting it in the same file would not break anything — and that is the problem: the guarantee would quietly stop being true, and a rule you can only check by reading a 200-line file for the one function that misbehaves is a rule that survives on memory. Two files, and the rule is one grep.

   The cost is stated in the module rather than hidden: `getSuitConfig`'s result contains every code, so it must not be spread into a *participant* page's props. It has exactly one caller, `app/admin/(dashboard)/suits/page.jsx`.

**Things worth knowing about how this landed.**

- **A slug collision is a returned result, not a thrown error.** `setSuitSlug` catches Postgres `23505` and returns `{ ok: false, reason: 'taken' }`, following `lib/submissions.js`. Type-a-slug-another-chamber-has is an ordinary thing for a person to do, and it has a sentence. There is no read-then-write: reading first to check would still race with the write it was checking for, so the unique index is the check and the error is the answer.

  `isUniqueViolation` checks **two spellings**, and that is not belt-and-braces: `@neondatabase/serverless` over HTTP raises its own error and hangs the original off `error.cause`, while a direct `pg` connection puts the code on the error itself. Knowing only one of them turns "that slug is taken" into a 500 on whichever deployment used the other.

- **`suggestSlug` generates and does not write.** A Random button that saved would silently re-point a live chamber, and every team holding the old URL would get a 404 — from a single tap, with no confirmation, on the one page you open in a hurry. It fills the field; Save slug is a second, deliberate press; the status line says which one happened. The same reasoning decides what Copy URL copies: the **saved** slug, never the draft, because an unsaved URL is one that does not work.

- **`normalizeSlug` runs on every keystroke, not on submit.** Autocorrect leaves trailing spaces and the keyboard capitalises the first letter of anything, so a field that stored what it was given would reject `The-mirror ` for two reasons the person did not choose. Normalising on the way in also means the string `slugProblem` tests is exactly the string that gets saved — a slug normalised *after* validation is a slug that was validated as something else. `lib/slug.test.js` pins the property that makes this safe: a slug that passes the pattern is already normalised, so normalising is the identity on everything the save button is enabled for.

- **Every action is a direct Server Action call, not a form.** Two of them return a value the card has to render — the new code, and the reason a slug was rejected — and routing that through `useActionState` would be machinery for two buttons. The cost is real and is written down on the page: **this route needs JavaScript.** The console's kill switch and its freeze release do not, and that difference is deliberate — those are the two controls you reach for when something is already wrong, and this is not.

- **`RESERVED_SLUGS` gained `_next`, and the test says out loud that it is unreachable.** A leading underscore fails the shape rule first, so `slugProblem('_next')` is `'shape'` and never `'reserved'`. It stays in the set because the set doubles as the list of what already lives at the root — it is documentation as much as a check — and `lib/slug.test.js` pins that reading down so a later edit cannot reorder the checks and quietly start calling it reserved.

- **`NEXT_PUBLIC_SITE_URL` is read in the page, not in the card.** `lib/env.js` is a server module: it also reads `DATABASE_URL` and `SESSION_SECRET`, and importing it from a client component to get at one public string would put the other two getters in the browser bundle. The page resolves the URL and passes the string down.

- **`getSuitConfig` throws unless it finds all five rows**, matching `lib/event.js` and `lib/chambers.js`. Four rows is worse than zero: a console listing four chambers looks like it is working, and the missing one stays invisible until a team cannot play it. The count is checked against `SUIT_KEYS.length` rather than the literal `5`, so adding a suit to `lib/suits.js` and to the schema without seeding it is caught here.

- **One file beyond the plan's list: `components/admin/AdminNav.jsx`.** This is the third page under `/admin` and the first commit where typing URLs stopped being a reasonable way to move between them — the surface is a phone at a venue, and a phone has no address bar you would want to type into twice. It is a client component for one reason (`usePathname`) and marks the current page with `aria-current="page"` as well as a colour.

  Its rule cost a second pass. The obvious test is "the pathname is this, or is beneath it", which is right for a section and **wrong for `/admin`, because `/admin` is a prefix of the other two** — so the plain version lights up Console on `/admin/suits` and `/admin/glitch`, i.e. on every page it exists to distinguish between, and the nav looks like it is working because something is always underlined. The three entries are siblings, so `/admin` carries an `exact` flag and the prefix half applies only to the others. Nothing catches this: it is a wrong-looking-right bug in a file no test covers, and the only reason it is not shipping is that the comment claiming the behaviour was checked against the code.

  C14 corrected the prediction that was in that comment. It expected boards to live under `/admin/leaderboards/…` and the prefix half to be doing work by now; the chamber is in the query string instead (`?suit=SPADES`), so nothing under `/admin` has a sub-route and the prefix half is genuinely unused. It stays — it is the correct rule for a nav, and the first nested page anyone adds would otherwise go dark on itself — but the comment now says it is unused rather than pretending it is load-bearing.

  It also cost the layout a change: the nav sits in a wrapper **outside** the `<Container>`, so the rule under it runs full-bleed and lands on the same edges as the header's. Inside, `Container`'s `px-5 sm:px-8` would inset it by 20 px and two rules 44 px apart would disagree about where the page ends, which reads as a mistake because it is one.

- **A stale cross-reference was corrected:** `lib/code.js` said its slugs fit `SLUG_PATTERN` "in lib/chambers.js". It now names `lib/slug.js` and states the invariant the seed depends on — the alphabet is lowercase letters and digits only, so a generated slug can never fail the shape rule and can never land on a reserved word. `lib/slug.test.js` asserts it over 500 draws rather than leaving it in a comment in two files.

**Done when:** rotating a code invalidates the old one immediately, and `navigator.clipboard` works over HTTPS on a phone.

**Not yet observed running.** As with C12, no build, lint, or test has completed since C8 — the environment reason is in C10. Everything in this commit is hand-traced. The clipboard fallback is also the one path here that cannot be checked from a desk: `navigator.clipboard` is undefined outside a secure context, so it works on the deployed site and not on `http://<lan-ip>:3000`, which is exactly why the failure branch says "select it and copy" rather than throwing — both readouts are `select-all` for that reason.

---

### C14 — `feat(admin): leaderboards, overall standings, and CSV export`

**Files:** `lib/board.js`, `lib/board.test.js`, `lib/leaderboard.js`, `app/admin/(dashboard)/leaderboards/page.jsx`, `app/admin/export.csv/route.js`, `app/admin/export.json/route.js`, `components/admin/{SuitTabs,LeaderList,TeamTimeline,ClockTime}.jsx`, `components/admin/AdminNav.jsx`

- Tabs, one per suit, defaulting to the suit with the most recent submission.
- **Mobile layout is a card list, not a table.** Rank, team name, time, elapsed — a wide table on a 375 px screen is the single most common way an admin panel becomes useless at an event. Desktop upgrades the same data into a table.
- Ranks 1–3 carry the maroon treatment; ties share a rank.
- **Overall standings**: suits solved, total elapsed, last solve, expanding into a team timeline showing all five chambers and where that team stands on each.
- Export: submissions as CSV with `Content-Disposition: attachment`, guarded by the same middleware, plus a JSON dump for archival.
- Empty states that say "no submissions yet" rather than rendering an empty list.

**Done when:** with 30 seeded submissions across 5 suits the ranking matches hand-computed expectations including the tie case, and the whole board is readable on a phone without horizontal scrolling.

**The arithmetic moved out of SQL, and that is the commit.** §6 states the leaderboard as SQL — the per-suit board and the overall standings as two aggregates, with elapsed as `submitted_at - start_time` inside them. `lib/board.js` computes all of it in JavaScript instead, and `lib/leaderboard.js` runs one `select` of every submission plus one of the event row, in a single `db.batch`.

**§6's design property is preserved exactly**: elapsed is derived at read time from the current start time and is never stored, so moving the start time still re-ranks five chambers with no writes. What changed is *where* the subtraction happens.

Three reasons, in order of weight:

1. **The tie rule is a ranking, and SQL has no competition rank without a window function.** `RANK()` gives 1, 2, 2, 4 but only as a window function over an `ORDER BY`, which is one more thing to get right, cannot be unit-tested here, and has an off-by-one failure mode that renders as a plausible board. `rankBy` is four lines and has a test.
2. **§6's aggregates need `sum(interval)` and `extract(epoch from …)`.** Over neon-http an interval comes back as a string that has to be cast and re-parsed; a faithful rewrite would have carried three casts whose failure mode is a correct-looking wrong number instead of an error.
3. **The timeline needs every row anyway.** C14's own bullet asks the standings to expand into "all five chambers and where that team stands on each", and §6's two aggregates cannot produce that. Once the rows are in hand, the aggregates are a `reduce` over a few thousand objects.

**The cost is real and is written into the module rather than hidden:** every submission is in memory at once. At the stated scale — 500 teams × 5 chambers, §9 — that is 2,500 rows, which is nothing, and it stops being nothing somewhere in the tens of thousands. If the event ever grows past that, §6's SQL is the shape to go back to, which is why it stays in the plan.

**Two more consequences of fetching once, both wanted.**

- **One round trip, not two.** §6's two aggregates would have been two statements. §9.2's rule is that a page pays for one HTTP request, and `db.batch` is how this commit keeps to it: the submissions and the event row ride together.
- **The suit board and the standings cannot disagree.** Two statements in a batch are not one transaction, so a solve landing between them would put a team on the chamber board and not in the standings — on the same screen, at the same moment. Deriving both from one array makes that unrepresentable rather than unlikely.

**The split into `lib/board.js` and `lib/leaderboard.js` is C13's split again.** `lib/leaderboard.js` imports `db/client.js`, which reads `DATABASE_URL` at import time by design, so anything importing it cannot be loaded without a database — and the done-when above is precisely a set of arithmetic claims to check against hand-computed expectations. A rule you can only verify against a live Neon branch is a rule nobody verifies. `lib/board.js` has one import (`SUIT_KEYS` from `lib/suits.js`) and no database.

**Things worth knowing about how this landed.**

- **The standings are a card list at every width; the chamber board is two layouts.** `LeaderList` renders an `<ol>` and a `<table>` and lets CSS hide one, which is affordable because the rows are static. `TeamTimeline` cannot do that: it expands, and a `<li>` and a `<tr>` cannot share a parent, so duplicating it across two layouts would mean two copies of the open/closed state that can disagree. It is a single list at every width — which is also the honest answer, because "which two chambers has this team not found" is a question you ask from a phone.

- **`components/admin/ClockTime.jsx` is a fourth component beyond the plan's three, and the reason is hydration.** `formatClockTime` is `toLocaleTimeString`: it resolves against the server's timezone during server rendering and the device's in the browser, so a server-rendered board shows Vercel's UTC to an organiser standing in a venue in IST — and React flags the mismatch on hydration. `lib/format.js` says this at the top and it is why no formatter in it is called during SSR. The board's *ranking* column does not have this problem: `formatElapsed` is pure arithmetic on a duration and renders identically on both sides, which is why the number a board is ordered by is the one that never flickers, and only the wall clock needed an island.

  The island uses `useSyncExternalStore` with a `getServerSnapshot`, which is the shape `StartTimeForm` and `GlitchProvider` already use. That is not a style preference: `react-hooks/set-state-in-effect` rejects the mount-effect-and-setState version, and `getServerSnapshot` is what makes the hydration render match the server HTML — so there is no `suppressHydrationWarning` here, and adding one would have been a claim that the two renders differ when the hook exists to make them agree. It is rendered per row rather than once per list behind a shared "is hydrated" flag, because that flag makes whether a time is real a property of the list, and the first time a row is rendered somewhere else it comes out blank with nothing to explain it.

- **The export guard is a CSV-injection measure, and its asymmetry is the design.** A field beginning `=`, `+`, `-`, `@`, tab or CR is a *formula* to Excel, Sheets and Numbers — and every team name in the file was typed by a stranger, so `=HYPERLINK(…)` and the DDE forms are pasted into the organiser's own spreadsheet. `csvCell` prefixes a leading apostrophe, and it does so **for strings only**: a number is never a formula, and a negative elapsed is a legitimate value in this file, so `'-42` would turn the duration column into text and silently break every sum and sort over it. The guard reads "strings that look like a formula".

  The accepted cost, stated rather than hidden: some spreadsheets display the apostrophe, so a team named `=evil` reads as `'=evil`. The alternative is not a cleaner cell, it is one that runs. Anyone who needs the byte-for-byte name has the JSON export, which carries it unaltered.

- **The CSV opens with a byte-order mark, and it is built from its code point.** Team names are allowed to be Devanagari — `lib/team.js` is explicit about not stripping them — and Excel on Windows reads a BOM-less UTF-8 CSV as the system codepage, which renders every Hindi team as mojibake. Both exports send `charset=utf-8` for the same reason at the other end. `String.fromCharCode(0xfeff)` rather than a literal character or a `\u` escape: a literal one is invisible in a diff, in an editor and in review, and any tool that trims trailing whitespace deletes it without saying so, while whether a file holds the character or the six characters that spell it cannot be told apart by looking. A code point can be misread neither way.

- **`lib/board.test.js` is the done-when written down.** Thirty submissions across five chambers, hand-computed first, deliberately containing the cases that are easy to get wrong rather than looking like real play: a tie on a chamber board (S0 gives 1, 2, 2, **4** — nothing in third), a tie in the standings on *both* keys (Echo and Foxtrot share rank 6, so Golf is 8 with nobody in 7), a team with more chambers but a worse total on either side of the comparison, and teams missing chambers shown as gaps.

  It also asserts things about the fixture itself — that each chamber is solved at most once per team, mirroring `unique('submissions_suit_team_idx')`, and that every timestamp is distinct. The second is what makes the order-independence assertion mean something: `overallStandings` resolves a team's display name from its last row, so if two rows shared a timestamp the answer would fall back to iteration order, and reversing the array could legitimately change it.

- **Two properties the tests pin that the code could have got wrong quietly.** `rankBy` returns copies rather than annotating the rows it is given, because the same shared array is handed to four board builders and a `rank` written onto those objects would leak one board's numbering into the next. And `suitBoard` filters before its in-place sort for the same reason: the caller's array is the source for all five tabs.

- **The standings carry a third sort key that §6 does not have, and it is not a tie-break.** Teams tied on chambers solved and total elapsed still **share a rank**; the slug comparison is there so the *order among them* is deterministic. Without it the standings shuffle on every refresh — same ranks, different rows in the same positions — which reads as the page being unstable and makes "read me the fourth line" useless over a radio. `teamSlug` is compared with `<` rather than `localeCompare` so that the server's locale cannot change the board's order.

- **The selected chamber is in the URL, and the tabs are links.** `?suit=SPADES` is what makes each tab a `<Link>` instead of a button, and three things fall out of it that matter at a venue: the board works with JavaScript off, a refresh and a back button and a shared link all land on the board you were looking at, and the server component re-reads on every switch, so a tab you have not opened in ten minutes is not showing you a stale board. The cost is a round trip per press, which is the right trade for a board whose entire job is being current. The parameter is checked against `SUIT_KEYS` rather than trusted: `?suit=A&suit=B` arrives as an array and falls back to the default instead of rendering an empty board that looks like a database problem.

  The tab counts come from the same rows the boards are built from, so a tab's number can never disagree with the length of the list it opens.

- **`defaultSuit` is "most recently solved", not "most solves".** You open this page during the event, and the interesting chamber is the one somebody just finished — that is the solve you are about to be asked about. Defaulting to the fullest chamber would show the same board all evening.

- **The two export routes set `dynamic` themselves.** A route handler is its own entry point and is **not** wrapped by the route group's layout, so the `force-dynamic` that keeps the boards page live does not reach them. Without the flag a GET handler is a candidate for caching, and a cached export is a result set that silently stops matching the board it claims to be. Both also send `Cache-Control: no-store` for the same reason at the proxy, and a fixed filename, so a second pull is a browser-suffixed `(1)` rather than a name nobody can predict.

  The CSV writes rows in the query's order — oldest first, the order they were written — and deliberately does **not** re-sort into the board's fastest-first order. A spreadsheet can sort itself; an archival dump's job is preserving what cannot be reconstructed.

- **The JSON export carries `startTime` because `elapsedMs` is meaningless without it.** Every duration in the file is measured from that instant, and an export of bare durations could not be checked against the boards once the console is gone. It costs one field. `elapsed_ms` and the human `elapsed` both appear in the CSV for the same kind of reason: if they ever disagree, the ms column is right and the readable one is a bug.

- **`AdminNav` gained a fourth entry in one line**, second rather than last, because boards is the page that is actually open during the event while the other three are set up once and left alone. No logic changed, which is the test a page list should pass.

- **Empty states say what is missing in words.** An empty board and a broken query look identical on a phone, and this page is only ever read during the one evening when "is it broken or is nobody playing" is a real question with two different answers. The chamber board says "no submissions for this chamber yet"; the standings say nothing has been solved.

**Not yet observed running.** The same as C12 and C13: no build, lint or test has completed since C8, for the environment reason recorded in C10, so every expectation in `lib/board.test.js` is hand-traced rather than observed passing. The done-when's second half — "the whole board is readable on a phone without horizontal scrolling" — is not something a unit test can assert anyway, and is the first thing to check on a real 375 px screen.

---

### C15 — `feat(live): auto-refreshing boards and the public standings screen`

**Files:** `app/api/leaderboard/route.js`, `components/useLiveBoard.js`, `app/standings/page.jsx`

- `/api/leaderboard` returns aggregates only — never a code, and no config fields — with `Cache-Control: public, s-maxage=5, stale-while-revalidate=30` so the edge absorbs the polling fan-out (§9).
- Client hook: poll every 15 s, pause on `document.hidden`, "updated 3s ago" indicator, new rows flash once on arrival rather than re-animating the whole list.
- `/standings`: a static shell that fills client-side, sized for the venue screen — large type, high contrast, no animation beyond the mode flip. Mobile-first still applies, because half the people looking at it will be looking at it on a phone.

**Done when:** a submission appears on the dashboard within 15 s, `/standings` is readable from 5 m on a projector, and 50 concurrent clients polling it produce roughly one origin query per 5 s (verifiable in the Neon query log).

---

### C16 — `feat(polish): mobile pass, accessibility, and the decoy 404`

**Files:** assorted components, `app/not-found.jsx`, `app/{loading,error}.jsx`

- The mobile pass, on a real phone rather than a resized browser: 375 px and 320 px, thumb-only submission, no horizontal overflow at any width, safe-area insets verified on a notched device.
- The perf budget: total JS under ~120 KB gzipped on the chamber route, no long tasks during a mode flip, and a submission round trip that stays under a second on throttled 4G.
- Accessibility: `prefers-reduced-motion` verified end to end, `aria-live` on results, focus management on submit, labelled inputs, `:focus-visible` rings at 3:1 against both modes, and `:active` states everywhere a `:hover` would have been.
- Loading and error boundaries, plus a readable screen for a missing env var and for an unreachable database — the two failures most likely to happen at the worst moment.
- **Delete `app/dev/`.** `/dev/glitch` goes in C12; `/dev/theme` is a C2 scratch page that by now has no reason to be reachable in production. Neither leaks anything, but a public route into the machinery is untidy and free to remove.

**Done when:** Lighthouse mobile ≥ 90 performance and ≥ 95 accessibility on `/`, `/<slug>`, and `/admin`, and a full keyboard-only submission succeeds.

---

### C17 — `chore(deploy): Vercel, Neon, load test, and the runbook`

**Files:** `README.md`, `scripts/{seed,export}.js`, `docs/runbook.md`, `vercel.json`

- Connect the repo to Vercel; set the four env vars for production and preview.
- **Set the function region to Mumbai (`bom1`).** Your Neon instance is in `ap-southeast-1` (Singapore) and your participants are in India — Mumbai is the shortest path to both, and it's the difference between a snappy chamber and a sluggish one on venue wifi. Confirm the pooled connection string is the one deployed.
- **Load test the submission action at 200 concurrent** with autocannon. The realistic worst case is 500 people submitting inside a couple of minutes, and you want to know how it behaves now rather than then. Watch the p95, not the average.
- `seed` for a demo board; `export` dumping every table to JSON for archival.
- `docs/runbook.md`: set the start time, where codes come from, rotate a leaked slug, read the boards, export mid-event, what to do if Neon is unreachable.

**Done when:** a production submission from a phone on venue-like wifi succeeds, the load test holds its p95 under a second, and you've followed the runbook start to finish once.

---

### C18 — `docs: finalise README and hand-off notes`

**Files:** `README.md`, `implementation.md`

- Architecture summary, the four env vars, local setup, migration commands, the commit map with status, and the design-system rationale — including the mobile-first rules, so the next person extends it without breaking the feel on a phone.
- Record what shipped versus what was planned.

**Done when:** someone who has never seen the repo can clone it, run it, and understand the glitch system and the leaderboard rules from the README alone.

---

## 11. Sequencing

```
C1 → C2 → C3 → C4 ─┐
                    ├─→ C8 → C9 → C16 ─┐
       C5 → C6 → C7 ─┘                  ├─→ C17 → C18
                    C10 → C11 → C12 → C13 → C14 → C15 ─┘
```

- **C1–C4** are the visual foundation and need no database.
- **C5–C7** are the data path; C8 depends on C7, and C6 is testable in isolation.
- **C10–C15** are the admin side and are independent of C8 — parallelizable if you have a second pair of hands. C12 is the one admin commit with a dependency outside the group: it needs C5's `event.glitch` column.
- **C16** lands last among features, because it polishes everything above it.

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Glitch effect stutters or drains battery on mid-range Android | High — it's the whole aesthetic, on the device most people will use | Mobile layer budget and `visibilitychange` pause (C3); throttle-test at 4× CPU and on a real mid-range phone (C16) |
| A slug or code leaks into the client bundle | High — the game is over on night one | Codes compared server-side only; C9 greps the build output for both |
| A published glitch override breaks the effect on every device at once | Medium — it is now a global control, not a local one | Every value is allowlisted and clamped before it is stored *and* before it is served (C12); `prefers-reduced-motion` still overrides it; `/admin` shows a banner while a hold is active |
| The leaderboard splits one team into two rows | Medium — visible and embarrassing | `team_slug` normalization with tests (C6), `unique(suit, team_slug)` as the backstop |
| Polling fan-out from 500 phones | Medium — could hammer the database | Edge-cached endpoint with `s-maxage` (§9, built in C15); verify against the Neon query log |
| Neon cold start on the first submission | Low | Pooled endpoint; send a test submission before the event opens |
| Start time typed wrong | Low | Elapsed times are derived in SQL, so fixing it re-ranks instantly with no data migration |
| Admin panel unusable on a phone at the venue | Medium — it's your only view of the event | Card layouts rather than tables on mobile (C14); the whole admin surface is built mobile-first and checked on a real device (C16) |

---

## 13. Open questions

1. **Joker scoring.** Should the Joker chamber count as a fifth suit for standings, or as a bonus/multiplier? The plan treats it as a standard fifth suit — trivially changed in `lib/leaderboard.js`.
2. **Overall tie-break.** Currently most suits solved, then least total elapsed. If you'd rather weight by suit difficulty, that's a small change in one query.
3. **Public standings.** C15 builds `/standings`. Say the word and it comes out, or gets put behind a code.
4. **Repeat visits.** A team can solve each suit once. If chambers should be re-enterable, the unique constraint is the one thing to revisit.
5. **Codes from physical clue cards.** If codes are printed before the site is built, C13 needs a "type an existing code" path alongside generate. **C13 shipped without it** — the page rotates and reads codes, and the only way a code enters the table is `generateCode()`. If the codes are going on cards, that is a second input on the card next to "Generate a new code", and the question to settle first is whether the printed code or the row is the system of record when the two disagree: rotating a printed code would invalidate the card in someone's hand, and the page currently warns about that in the only way it can — the note under the button.
6. **Landing copy.** `META.tagline` in `components/landing/EventMeta.jsx` is a placeholder — *"What disappears does not always leave."* — and the landing page carries no date and no venue. Both are one-line edits in one object, and both are deliberate: inventing a date would have been worse than leaving it out. **The event poster supplies a candidate for the tagline**: *NOTHING IS WHAT IT SEEMS*, set in the same wide-tracked uppercase as the fest line, which is a better fit for a site whose whole aesthetic is misregistration. It is one string, and it was left alone because it is the client's copy and not the poster's job to decide.
7. **Devanagari wordmark.** The poster's wordmark is bilingual — अंत and RDHAN sharing a baseline. The page's is Latin only, deliberately. `next/font` does not currently load a Devanagari face, and Anton has no coverage, so अंत would render in whatever the device falls back to: correct on most Android and iOS, tofu on some, and a different weight and width on nearly all of them — on a page read on 500 unknown phones, that is a per-device gamble taken for two glyphs. Doing it properly means a second `next/font/google` face (Noto Sans Devanagari or Tiro Devanagari Hindi, to sit against Anton), which is a real download on the site's most-visited page. Worth doing; not worth doing blind.
8. **How far the glitch controller reaches.** C12 publishes tuning to every device via `/api/glitch`. If you would rather each device kept its own settings, the endpoint and the fetch come out and it stays a local bench — but the `hold` is the part that genuinely has to be global, so that half stays either way.
