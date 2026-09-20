'use client'

import { usePathname } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  TIMING,
  TUNING_DEFAULTS,
  isStillRoute,
  mergeTuning,
  nextFlipDelay,
  nextSignalLossDelay,
  otherMode,
  randomInt,
} from '@/lib/glitch'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

// Subscribe functions are module-scoped so their identity is stable — an inline
// arrow would make useSyncExternalStore resubscribe on every render.
function subscribeReducedMotion(onChange) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function subscribeVisibility(onChange) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

function getHidden() {
  return document.hidden
}

// Server snapshots: assume motion is fine and the tab is visible. React renders
// these during SSR and hydration, then re-reads on the client.
const getFalseOnServer = () => false

const GlitchContext = createContext(null)

export function useGlitch() {
  const value = useContext(GlitchContext)
  if (!value) throw new Error('useGlitch must be used inside <GlitchProvider>')
  return value
}

/**
 * Owns the good/bad flip for the whole document.
 *
 * React state is the source of truth; effects only push it outward to the DOM.
 * Reads of external systems (the reduced-motion media query, tab visibility) go
 * through useSyncExternalStore rather than a read-then-setState effect — both
 * because that is correct and because react-hooks/set-state-in-effect rejects
 * the other shape.
 *
 * FOUR INPUTS determine whether the oscillator runs: reduced motion, tab
 * visibility, the route, and a published hold. The order between them is stated
 * once, at `forced` below, because "which one wins" is the only question this
 * component has to answer and it is a question with a wrong answer that looks
 * fine in testing.
 *
 * No `tuning` prop. It was one until C12, when the tuning stopped being a
 * property of the build and became a row in the database — the root layout this
 * provider lives in is a server component and *could* read that row, but doing so
 * would make every page on the site a database read for a value the edge can
 * serve, and 500 concurrent visitors is the number this whole design is arranged
 * around. So the defaults paint first and the published override arrives by fetch.
 */
export function GlitchProvider({ children, initialMode = 'bad' }) {
  const [mode, setMode] = useState(initialMode)
  const [tuning, setTuning] = useState(TUNING_DEFAULTS)

  /**
   * Whether anyone has moved a knob since this page loaded. A ref, not state:
   * nothing renders from it, and re-rendering when it flips would be a render
   * caused by "something else is about to be rendered".
   *
   * The tuning page is the only thing that writes tuning, and it does so through
   * `setTuning` below — so this is set in the one place every edit has to pass
   * through, rather than at each of the five call sites that would have to
   * remember to.
   */
  const touched = useRef(false)

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getFalseOnServer,
  )
  const hidden = useSyncExternalStore(subscribeVisibility, getHidden, getFalseOnServer)

  // The route is read here rather than passed down because the provider lives in
  // the root layout, which has no per-route props — and because a second provider
  // nested under this one would not work: both would write `data-mode` onto
  // <html> and they would fight over it every few seconds.
  //
  // `usePathname` returns the pathname during SSR as well, so the server and the
  // first client render agree and this does not cause a hydration mismatch.
  const pathname = usePathname()
  const still = isStillRoute(pathname)

  /**
   * The published freeze, or null. Read off the tuning blob because that is where
   * it is stored — see lib/event.js for why it shares the column.
   */
  const hold = tuning.hold ?? null

  // THE ORDER, and it is the whole of this component's policy.
  //
  // `prefers-reduced-motion` wins over everything, and has to: it is the user's
  // own setting, made before they arrived, and a control on someone else's phone
  // must never be able to override it. Holding it first is what makes that true
  // even when a Showtime preset is published and a freeze is on.
  //
  // Then the admin subtree, which is held for its own reasons (see isStillRoute).
  // Both of those freeze on `bad`, the frame a page with no flip loop should
  // settle on. Only then the published hold, which is the one that can pin either
  // frame.
  const forced = reducedMotion || still ? 'bad' : hold

  const active = !forced && !hidden
  // Derived, not set from an effect: every one of the four inputs above is a
  // reason to stop, and a mode written by an effect would be a fifth source of
  // truth racing the others.
  const effectiveMode = forced ?? mode

  // The published override, fetched once per page load and merged onto the
  // defaults. First paint is already on screen by then, which is the point:
  // nothing below this line is blocked on the network.
  useEffect(() => {
    let cancelled = false

    fetch('/api/glitch')
      .then((response) => (response.ok ? response.json() : null))
      .then((published) => {
        if (cancelled || !published) return

        // THE GUARD: only adopt the published value if nothing has been moved on
        // this device yet.
        //
        // Without it the response reverts whatever you dragged while it was in
        // flight, and the symptom is a control that springs back a fifth of a
        // second after you let go — which reads as a broken knob, not as a race.
        // The window is small and the tuning page is exactly where someone is
        // most likely to be dragging within it, because the page loads with the
        // sliders already under their thumb.
        if (touched.current) return
        setTuning(mergeTuning(published))
      })
      // Not an error state, and deliberately silent. The defaults are already on
      // screen and are a correct rendering of "nothing has been published" — which
      // is also what a failed request means, as far as this device can tell.
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.mode = effectiveMode
  }, [effectiveMode])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--glitch-tear-ms', `${tuning.tearMs}ms`)
    root.style.setProperty('--glitch-grain-opacity', String(tuning.grainOpacity))
    root.style.setProperty('--glitch-scanline-opacity', String(tuning.scanlineOpacity))
  }, [tuning])

  // The flip loop: a jittered timer, and at each firing a short burst of rapid
  // flips rather than a single clean one.
  useEffect(() => {
    if (!active) return undefined

    const root = document.documentElement
    let flipTimer
    let tearTimer
    let cancelled = false

    const tear = () => {
      root.classList.add('is-tearing')
      clearTimeout(tearTimer)
      tearTimer = setTimeout(() => root.classList.remove('is-tearing'), tuning.tearMs)
    }

    const burst = (done) => {
      tear()
      const count = randomInt(TIMING.microStutterMin, TIMING.microStutterMax)
      let step = 0
      const tick = () => {
        if (cancelled) return
        setMode((current) => otherMode(current))
        step += 1
        if (step >= count) {
          done()
          return
        }
        flipTimer = setTimeout(tick, TIMING.microStutterStepMs)
      }
      tick()
    }

    const loop = () => {
      flipTimer = setTimeout(() => {
        if (cancelled) return
        burst(loop)
      }, nextFlipDelay(tuning))
    }
    loop()

    return () => {
      cancelled = true
      clearTimeout(flipTimer)
      clearTimeout(tearTimer)
      root.classList.remove('is-tearing')
    }
  }, [active, tuning])

  // Signal loss: a rare full inversion flash.
  //
  // `tuning` is a dependency for the same reason it is on the flip loop, and it
  // arrived for the same reason: the gap became a knob. Leaving it off would be
  // invisible on the page that tunes it — you would drag "Flash every" down to
  // five seconds, and nothing would happen until the *old* gap expired, which for
  // a thirty-to-sixty-second timer is long enough to conclude the slider is
  // broken and go looking in the database.
  //
  // Restarting the countdown on every knob move does mean a drag can push the next
  // flash further out. That is the honest behaviour rather than a bug: the numbers
  // changed, so the schedule drawn from them is redrawn. The flash is rare by
  // design and the panel says so.
  useEffect(() => {
    if (!active) return undefined

    const root = document.documentElement
    let timer
    let flashTimer
    let cancelled = false

    const schedule = () => {
      timer = setTimeout(() => {
        if (cancelled) return
        root.classList.add('is-signal-loss')
        flashTimer = setTimeout(
          () => root.classList.remove('is-signal-loss'),
          TIMING.signalLossFlashMs,
        )
        schedule()
      }, nextSignalLossDelay(tuning))
    }
    schedule()

    return () => {
      cancelled = true
      clearTimeout(timer)
      clearTimeout(flashTimer)
      root.classList.remove('is-signal-loss')
    }
  }, [active, tuning])

  const flip = useCallback(() => setMode((current) => otherMode(current)), [])

  /**
   * The tuning setter the panel writes through — exposed as `setTuning` so a
   * caller sees an ordinary state setter, including the functional form.
   *
   * It is a wrapper for one reason: every edit has to be able to say "someone has
   * touched this", and the only way to guarantee that is to make the marking and
   * the setting the same call. A separate `markTouched()` next to `setTuning()`
   * would be correct exactly until the first time someone added a call site and
   * remembered one of the two.
   */
  const applyTuning = useCallback((next) => {
    touched.current = true
    setTuning(next)
  }, [])

  const value = useMemo(
    () => ({
      mode: effectiveMode,
      setMode,
      flip,
      reducedMotion,
      paused: hidden,
      active,
      hold,
      tuning,
      setTuning: applyTuning,
    }),
    [effectiveMode, flip, reducedMotion, hidden, active, hold, tuning, applyTuning],
  )

  return <GlitchContext.Provider value={value}>{children}</GlitchContext.Provider>
}
