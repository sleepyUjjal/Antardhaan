'use client'

import { useEffect, useState } from 'react'
import { GLYPH_POOL } from '@/lib/glitch'

/**
 * Resolves `text` out of a pool of glyphs over `durationMs`.
 *
 * Initial state is the real text, not a scrambled string: a random initial
 * value would differ between server and client and hydration would mismatch.
 * The scramble begins on the first tick instead, which reads as the text
 * "settling" rather than arriving broken.
 *
 * Pass `enabled: false` under reduced motion.
 */
export function useScramble(text, { durationMs = 700, tickMs = 40, enabled = true } = {}) {
  const [display, setDisplay] = useState(text)

  useEffect(() => {
    if (!enabled) return undefined

    const totalTicks = Math.max(1, Math.ceil(durationMs / tickMs))
    let tick = 0

    const id = setInterval(() => {
      tick += 1
      const revealed = Math.floor((tick / totalTicks) * text.length)

      if (tick >= totalTicks) {
        clearInterval(id)
        setDisplay(text)
        return
      }

      setDisplay(
        text
          .split('')
          .map((char, index) => {
            if (char === ' ' || index < revealed) return char
            return GLYPH_POOL[Math.floor(Math.random() * GLYPH_POOL.length)]
          })
          .join(''),
      )
    }, tickMs)

    return () => clearInterval(id)
  }, [text, durationMs, tickMs, enabled])

  return display
}
