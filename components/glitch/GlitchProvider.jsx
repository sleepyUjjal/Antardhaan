'use client'

import { usePathname } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  TIMING,
  TUNING_DEFAULTS,
  isStillRoute,
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
 */
export function GlitchProvider({ children, initialMode = 'bad', tuning: tuningProp }) {
  const [mode, setMode] = useState(initialMode)
  const [tuning, setTuning] = useState(tuningProp ?? TUNING_DEFAULTS)

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getFalseOnServer,
  )
  const hidden = useSyncExternalStore(subscribeVisibility, getHidden, getFalseOnServer)

  // The route is the fourth input, alongside reduced motion and tab visibility.
  // It is read here rather than passed down because the provider lives in the
  // root layout, which has no per-route props — and because a second provider
  // nested under this one would not work: both would write `data-mode` onto
  // <html> and they would fight over it every few seconds.
  //
  // `usePathname` returns the pathname during SSR as well, so the server and the
  // first client render agree and this does not cause a hydration mismatch.
  const pathname = usePathname()
  const still = isStillRoute(pathname)

  const active = !reducedMotion && !hidden && !still
  // Derived, not set from an effect. Reduced motion locks the page to 'bad', and
  // a held oscillator does the same — see isStillRoute for why bad is the frame
  // a page with no flip loop should freeze on.
  const effectiveMode = reducedMotion || still ? 'bad' : mode

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
      }, nextSignalLossDelay())
    }
    schedule()

    return () => {
      cancelled = true
      clearTimeout(timer)
      clearTimeout(flashTimer)
      root.classList.remove('is-signal-loss')
    }
  }, [active])

  const flip = useCallback(() => setMode((current) => otherMode(current)), [])

  const value = useMemo(
    () => ({
      mode: effectiveMode,
      setMode,
      flip,
      reducedMotion,
      paused: hidden,
      active,
      tuning,
      setTuning,
    }),
    [effectiveMode, flip, reducedMotion, hidden, active, tuning],
  )

  return <GlitchContext.Provider value={value}>{children}</GlitchContext.Provider>
}
