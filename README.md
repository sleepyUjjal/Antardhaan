# Antardhaan

An internal game event site for **Mridang 2k26**.

A page that never settles — continuously glitching between a bone-white "good" state and a
void-black "bad" state, with maroon as the only chromatic accent. Five hidden chamber endpoints,
one per suit (Spades, Clubs, Diamonds, Hearts, Joker), an admin dashboard, and per-suit
leaderboards.

## Stack

- **Next.js 16** (App Router), plain JavaScript — no TypeScript
- **Tailwind CSS v4**
- **Neon Postgres** via `@neondatabase/serverless` + Drizzle ORM
- Deployed on **Vercel**

## Setup

```bash
npm install
cp .env.example .env   # then fill in the four values
npm run dev
```

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (flat config — Next 16 removed `next lint`) |
| `npm run format` | Prettier |

`db:*`, `seed`, `export`, and `test` scripts arrive with commits C5 and C6, when their target
files exist.

## Environment

Four variables, documented in `.env.example`. `.env` is gitignored; production values live in
Vercel's env UI.

## Where things are

The full commit-by-commit implementation plan is in [`implementation.md`](./implementation.md).
It is the source of truth for what each commit contains and why, including the data model, the
mobile-first design rules, and the leaderboard logic.
