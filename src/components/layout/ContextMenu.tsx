import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  icon?: string;
  onSelect: () => void;
}

export interface ContextMenuRequest {
  x: number;
  y: number;
  items: ContextMenuItem[];
  /** Optional heading shown above the menu items. */
  title?: string;
}

interface ContextMenuProps {
  request: ContextMenuRequest | null;
  onClose: () => void;
}

export function ContextMenu({ request, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!request) return;
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(request.x, window.innerWidth - rect.width - margin);
    const top = Math.min(request.y, window.innerHeight - rect.height - margin);
    setPosition({ left: Math.max(margin, left), top: Math.max(margin, top) });
  }, [request]);

  useEffect(() => {
    if (!request) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && menuRef.current?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleScrollOrResize = () => onClose();
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [request, onClose]);

  if (!request) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {request.title && <div className="context-menu-title">{request.title}</div>}
      {request.items.map((item) => (
        <button
          type="button"
          role="menuitem"
          key={item.id}
          className={`context-menu-item ${item.danger ? 'danger' : ''}`}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          <span className="context-menu-icon">{item.icon || ''}</span>
          <span className="context-menu-label">{item.label}</span>
          {item.hint && <span className="context-menu-hint">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
}
