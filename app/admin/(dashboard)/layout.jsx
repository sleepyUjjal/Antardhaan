import { Container } from '@/components/ui/Container'
import { logout } from '../actions'

/**
 * The console chrome — everything under `/admin` that is not the login page.
 *
 * A ROUTE GROUP, not a plain `app/admin/layout.jsx`, and the difference is the
 * whole reason this file sits in parentheses. A layout at `app/admin/` wraps
 * *every* segment beneath it, `/admin/login` included, which would put a "Log
 * out" button on the login page and a console header above a form whose entire
 * job is to be the one screen with nothing else on it. The group declares its own
 * layout for the logged-in pages only, and changes no URL: `/admin` is still
 * `/admin`, and C12's tuning page and C15's boards drop in beside this file
 * rather than needing each other's chrome restated.
 *
 * `force-dynamic` is declared here rather than on each page because every page in
 * this group is the same kind of page — a live read of a database that changes
 * while you are looking at it. A statically rendered console would show the
 * numbers from build time at the venue, which is the single worst way for this
 * surface to fail: plausible, and wrong.
 */
export const dynamic = 'force-dynamic'

export default function AdminDashboardLayout({ children }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Not sticky. A sticky header on a notched phone has to clear
          `env(safe-area-inset-top)` and needs a matching page gutter, and this
          console is two short screens that never scroll far enough for it to
          matter — the panels below are the content. */}
      <header className="border-b border-rule">
        <Container className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="font-mono text-xs tracking-[0.35em] text-muted uppercase">Antardhaan</p>
            <p className="mt-1 font-mono text-xs text-muted">Event console</p>
          </div>

          {/* A plain <button>, not components/ui/Button. Button bakes in
              `w-full`, which is right for a form's submit and wrong in a header
              row next to a title — and lib/cn.js joins rather than merges, so a
              width passed in to undo it would be settled by Tailwind's emission
              order rather than by intent. 44px is the touch target; the visible
              box is smaller than the button. */}
          <form action={logout}>
            <button
              type="submit"
              className="inline-flex min-h-[44px] touch-manipulation items-center border border-rule px-4 font-mono text-xs tracking-[0.15em] text-muted uppercase transition-colors duration-150 select-none active:border-accent active:text-accent-text"
            >
              Log out
            </button>
          </form>
        </Container>
      </header>

      <Container as="main" className="flex-1 pt-6 pb-16">
        {children}
      </Container>
    </div>
  )
}
