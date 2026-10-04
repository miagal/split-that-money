// Wraps explicitly scrollable content with OverlayScrollbars while preserving its layout width.
import type { ComponentPropsWithoutRef } from 'react'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react'
import 'overlayscrollbars/overlayscrollbars.css'

type OverlayScrollAreaProps = ComponentPropsWithoutRef<'div'>

/**
 * Renders an intentional scroll region with stable scrollbar gutter space.
 *
 * @param props - Native div properties and content for a dialog body or explicit scroll region.
 * @returns The enhanced scrollable container.
 */
export function OverlayScrollArea({
  className,
  style,
  ...props
}: OverlayScrollAreaProps) {
  return (
    <OverlayScrollbarsComponent
      className={className}
      options={{ overflow: { x: 'hidden', y: 'scroll' } }}
      defer
      style={{ ...style, scrollbarGutter: 'stable' }}
      {...props}
    />
  )
}
