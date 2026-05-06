import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  tip: string;
  href?: string;
  hrefLabel?: string;
  /** Position preference: 'top' (default) flips to bottom if near viewport top */
  position?: 'top' | 'bottom';
  dark?: boolean;
  children: React.ReactNode;
}

/**
 * Hover/click tooltip that renders in document.body via a portal so it
 * escapes any overflow:hidden ancestor. Moving the mouse from the trigger
 * to the tooltip keeps it open (150 ms close-delay). Links are clickable.
 *
 * Desktop: opens on mouseenter, closes 150 ms after mouseleave.
 * Mobile:  toggles on click, dismisses on outside-click or Escape.
 */
export default function InfoTooltip({
  tip, href, hrefLabel = 'Learn more →', position = 'top', dark, children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  const openTooltip = () => {
    cancelClose();
    if (triggerRef.current) setAnchorRect(triggerRef.current.getBoundingClientRect());
    setOpen(true);
  };

  // Cleanup timer on unmount
  useEffect(() => () => { cancelClose(); }, []);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Outside click (for mobile tap-away)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        tooltipRef.current && !tooltipRef.current.contains(target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const bg       = dark ? 'bg-slate-900 border-slate-700' : 'bg-surface-900 border-surface-700';
  const textCls  = dark ? 'text-slate-200' : 'text-white';
  const indicator = dark ? 'text-slate-600' : 'text-surface-300';

  // Flip above/below based on available viewport space
  const showAbove = position !== 'bottom' && (anchorRect?.top ?? 200) > 130;
  const tipTop  = anchorRect
    ? showAbove ? anchorRect.top - 8 : anchorRect.bottom + 8
    : -9999;
  const tipLeft = anchorRect ? anchorRect.left + anchorRect.width / 2 : -9999;

  return (
    <span
      ref={triggerRef}
      className="inline-flex items-baseline gap-0.5 cursor-pointer"
      onMouseEnter={openTooltip}
      onMouseLeave={scheduleClose}
      onClick={() => (open ? setOpen(false) : openTooltip())}
    >
      {children}
      <span className={`text-[9px] leading-none select-none ${indicator}`} aria-hidden="true">ⓘ</span>

      {open && createPortal(
        <span
          ref={tooltipRef}
          style={{
            position: 'fixed',
            left: tipLeft,
            top: tipTop,
            transform: showAbove ? 'translate(-50%, -100%)' : 'translateX(-50%)',
            zIndex: 9999,
          }}
          className={`w-56 rounded-lg border shadow-xl px-3 py-2.5 pointer-events-auto ${bg}`}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onClick={(e) => e.stopPropagation()}
        >
          <span className={`text-xs leading-relaxed block ${textCls}`}>{tip}</span>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs mt-2 block text-indigo-300 hover:text-indigo-200"
              onClick={(e) => e.stopPropagation()}
            >
              {hrefLabel}
            </a>
          )}
        </span>,
        document.body,
      )}
    </span>
  );
}
