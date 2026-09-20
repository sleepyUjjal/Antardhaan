import { LoginForm } from '@/components/admin/LoginForm'
import { Rule } from '@/components/ui/Rule'
import { login } from './actions'

/**
 * The login page, and the only page under `/admin` that renders logged out.
 *
 * A server component wrapping a client form, the same shape as the chamber page:
 * the action is imported here and passed down as a prop, so the client component
 * never needs to know where the action module lives.
 *
 * Note that a successful login redirects to `/admin`, which does not exist yet —
 * C11 adds the dashboard. Until then the redirect lands on the decoy 404, which
 * is confusing for exactly one commit.
 *
 * There is no link back to `/` and no styling beyond the tokens. This page has
 * one job and a person standing in a corridor at 1 a.m. should not have to read
 * it.
 */
export const metadata = { title: 'Admin' }

export default function AdminLoginPage() {
  return (
    // No <Container>: it carries `max-w-[68rem]` and `cn` joins rather than
    // merges (lib/cn.js), so a narrower max-width passed in would sit beside it
    // and the winner would be whichever Tailwind emitted last. The gutter is
    // written out instead.
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <p className="font-mono text-xs tracking-[0.35em] text-muted uppercase">Restricted</p>

        <h1 className="mt-4 font-display text-3xl uppercase leading-none tracking-tight">
          Antardhaan
        </h1>

        <div className="mt-6">
          <Rule tone="accent" />
        </div>

        <p className="mt-6 text-muted">Event console. Staff only.</p>

        <LoginForm action={login} />
      </div>
    </main>
  )
}
