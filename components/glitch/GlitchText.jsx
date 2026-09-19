'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * Headings that carry a permanent maroon fringe and tear apart on press.
 *
 * Deliberately tap-triggered, not hover-triggered: on a phone hover either
 * never fires or fires on tap and sticks. `data-text` feeds the ::before/::after
 * clones in globals.css — they are `content: attr(data-text)`, so the text must
 * be a plain string and must not contain markup.
 *
 * Falls through to a plain element for non-string children.
 */
export function GlitchText({ as: Tag = 'span', children, className, ...props }) {
  const [pressed, setPressed] = useState(false)

  if (typeof children !== 'string') {
    return (
      <Tag className={className} {...props}>
        {children}
      </Tag>
    )
  }

  return (
    <Tag
      data-text={children}
      className={cn('glitch-text', pressed && 'is-glitching', className)}
      onPointerDown={() => setPressed(true)}
      // animationend bubbles from the pseudo-elements, so this fires once the
      // slice animation finishes and clears itself.
      onAnimationEnd={() => setPressed(false)}
      {...props}
    >
      {children}
    </Tag>
  )
}
