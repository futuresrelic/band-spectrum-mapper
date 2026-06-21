import { useState, useRef, useEffect } from 'react';

interface Props {
  content: string;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export default function HelpTooltip({ content, className = '', side = 'top' }: Props) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setVisible(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [visible]);

  const positions: Record<string, string> = {
    top:    'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left:   'right-full mr-2 top-1/2 -translate-y-1/2',
    right:  'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  return (
    <div ref={ref} className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="w-4 h-4 rounded-full border border-current text-current opacity-40 hover:opacity-80 text-xs font-bold leading-none flex items-center justify-center transition-opacity"
        aria-label="Help"
      >
        ?
      </button>
      {visible && (
        <div className={`absolute z-50 w-64 rounded-xl bg-gray-900 border border-gray-700 text-white text-xs p-3 leading-relaxed shadow-xl ${positions[side]}`}>
          {content}
        </div>
      )}
    </div>
  );
}
