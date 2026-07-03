// Shared "nothing here yet" row for dark-theme list/card contexts. Every
// empty state should explain why it's empty and, where possible, offer a
// way to change that — never just a blank space.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  message: string;
  cta?: { label: string; to: string; accentClassName?: string };
  className?: string;
  children?: ReactNode;
}

export default function DarkEmptyRow({ message, cta, className = '', children }: Props) {
  return (
    <div className={`text-center py-10 px-4 ${className}`}>
      <p className="text-sm text-gray-600">
        {message}
        {cta && (
          <>
            {' — '}
            <Link
              to={cta.to}
              className={`hover:underline ${cta.accentClassName ?? 'text-indigo-400'}`}
            >
              {cta.label}
            </Link>
          </>
        )}
      </p>
      {children}
    </div>
  );
}
