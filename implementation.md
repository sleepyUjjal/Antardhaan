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
| `/api/glitch` | route handler | Tuning JSON for every client, clamped. Edge-cached, 60 s. |
| `/api/leaderboard` | route handler | JSON for polling. Edge-cached (§9). |
| `/standings` | static shell + client fetch | Public board for the venue screen. |
| `/robots.txt` | static | `Disallow: /`. |
| `not-found.jsx` | static | The decoy. Should look intentional, not broken. |

Chamber pages appear in no nav, sitemap or manifest. The slug never appears in a `<Link>` on a public page, so it is never shipped in a prefetch payload. `robots: { index: false, follow: false }` is set once in the root layout rather than per page — see C9 for why, and for why it is not a second layer on top of `robots.txt`. The one `<Link>` on the site is the decoy's route back to `/`, which names nothing.

**Chambers sit at the root, not under `/c/`.** `/<slug>` is the URL the participants get, and two things follow from that which the `/c/` prefix would have handled for us:

- **`/[slug]` is now the catch-all for every URL on the domain that no other route claims.** `/.env`, `/wp-login.php`, `/phpmyadmin` all arrive at this route — and without a guard, each one is a query against Neon in Singapore. `SLUG_PATTERN` in `lib/chambers.js` rejects the impossible before the query. Next serves static segments first, so `/admin` and `/standings` never reach here, but nothing else is filtered for us.
- **`RESERVED_SLUGS` is a C13 requirement, not a nicety.** A chamber slugged `admin` does not error — it silently becomes unreachable, because Next matches the static `app/admin/` route first and `getChamberData` never sees it. C13 validates every slug it saves with `isValidSlug`. Reserving a word costs nothing; discovering the collision mid-event costs a chamber.

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

**Files:** `app/admin/glitch/{page,actions}.jsx`, `components/admin/GlitchKnobs.jsx`, `app/api/glitch/route.js`, `components/glitch/GlitchProvider.jsx`, `lib/glitch.js`, `lib/glitch.test.js`, `app/admin/page.jsx` (the active-hold banner), and `/dev/glitch` is deleted

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

**Done when:** publishing a change moves the effect on a second device within a minute with no redeploy, a hold survives a reload, and reduced motion still overrides a published Showtime preset.

---

### C13 — `feat(admin): suit codes and hidden slugs`

**Files:** `app/admin/suits/{page,actions}.jsx`, `components/admin/SuitCard.jsx`

- One card per suit, stacked on mobile: label, glyph, current slug, current code, last updated.
- **Generate code** — new 8-char code, saved, shown immediately with a copy button. Because codes are plain text, you can also reopen this page any time and read them, which is the whole reason for that decision.
- **Edit slug** — generate a random one or type a thematic one by hand.
- **Copy chamber URL** — builds the full `<NEXT_PUBLIC_SITE_URL>/<slug>` and copies it, so sending a chamber to a team is one tap from your phone. Refuses to save or copy a slug that `isValidSlug` rejects, and says which rule it broke — a reserved word here is a chamber that would silently never resolve.
- **Deactivate** — retires a chamber that leaked, without deleting its submissions.

**Done when:** rotating a code invalidates the old one immediately, and `navigator.clipboard` works over HTTPS on a phone.

---

### C14 — `feat(admin): leaderboards, overall standings, and CSV export`

**Files:** `app/admin/leaderboards/page.jsx`, `components/admin/{SuitTabs,LeaderList,TeamTimeline}.jsx`, `app/admin/export.csv/route.js`, `lib/leaderboard.js`

- Tabs, one per suit, defaulting to the suit with the most recent submission.
- **Mobile layout is a card list, not a table.** Rank, team name, time, elapsed — a wide table on a 375 px screen is the single most common way an admin panel becomes useless at an event. Desktop upgrades the same data into a table.
- Ranks 1–3 carry the maroon treatment; ties share a rank.
- **Overall standings**: suits solved, total elapsed, last solve, expanding into a team timeline showing all five chambers and where that team stands on each.
- Export: submissions as CSV with `Content-Disposition: attachment`, guarded by the same middleware, plus a JSON dump for archival.
- Empty states that say "no submissions yet" rather than rendering an empty list.

**Done when:** with 30 seeded submissions across 5 suits the ranking matches hand-computed expectations including the tie case, and the whole board is readable on a phone without horizontal scrolling.

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
5. **Codes from physical clue cards.** If codes are printed before the site is built, C13 needs a "type an existing code" path alongside generate.
6. **Landing copy.** `META.tagline` in `components/landing/EventMeta.jsx` is a placeholder — *"What disappears does not always leave."* — and the landing page carries no date and no venue. Both are one-line edits in one object, and both are deliberate: inventing a date would have been worse than leaving it out.
7. **How far the glitch controller reaches.** C12 publishes tuning to every device via `/api/glitch`. If you would rather each device kept its own settings, the endpoint and the fetch come out and it stays a local bench — but the `hold` is the part that genuinely has to be global, so that half stays either way.
