import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

interface ResizeHandleProps {
  side: 'left' | 'right';
  onResize: (width: number) => void;
}

/**
 * A thin drag handle between the center workspace and a side rail. CSS grid columns
 * are driven by CSS variables (`--left-rail-width` / `--right-rail-width`), so this
 * component only calls `onResize` with the new pixel width.
 */
export function ResizeHandle({ side, onResize }: ResizeHandleProps) {
  const draggingRef = useRef(false);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      draggingRef.current = true;
      const startX = event.clientX;
      const element = event.currentTarget;
      element.setPointerCapture(event.pointerId);
      const layout = element.parentElement;
      if (!layout) return;

      const onMove = (moveEvent: globalThis.PointerEvent) => {
        if (!draggingRef.current) return;
        const rect = layout.getBoundingClientRect();
        const width = side === 'left' ? moveEvent.clientX - rect.left : rect.right - moveEvent.clientX;
        onResize(Math.round(width));
      };

      const onUp = (upEvent: globalThis.PointerEvent) => {
        draggingRef.current = false;
        element.releasePointerCapture?.(upEvent.pointerId);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [onResize, side],
  );

  return (
    <div
      className={`resize-handle resize-handle-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side === 'left' ? 'task palette rail' : 'inspector rail'}`}
      onPointerDown={handlePointerDown}
      onDoubleClick={() => onResize(side === 'left' ? 246 : 340)}
    />
  );
}
