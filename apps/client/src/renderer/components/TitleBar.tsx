import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { cn } from '../lib/cn.js';

type Props = {
  /** Page-specific content rendered to the LEFT of the window-control buttons. */
  children?: React.ReactNode;
  className?: string;
};

const dragStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

/** Apply to any interactive element placed inside <TitleBar>'s children
 *  so it remains clickable instead of inheriting the drag region. */
export const titleBarNoDrag = noDragStyle;

export function TitleBar({ children, className }: Props) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.api.window.isMaximized().then((m) => {
      if (!cancelled) setMaximized(m);
    });
    const off = window.api.window.onMaximizedChange(setMaximized);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  return (
    <header
      className={cn(
        'flex h-9 w-full shrink-0 items-stretch border-b border-border bg-bg',
        className,
      )}
      style={dragStyle}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3">{children}</div>

      <div className="flex items-stretch" style={noDragStyle}>
        <CtrlButton
          label="Свернуть"
          onClick={() => window.api.window.minimize()}
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
        </CtrlButton>
        <CtrlButton
          label={maximized ? 'Свернуть в окно' : 'Развернуть'}
          onClick={() => window.api.window.toggleMaximize()}
        >
          {maximized ? (
            <Copy className="h-3 w-3" strokeWidth={1.5} />
          ) : (
            <Square className="h-3 w-3" strokeWidth={1.5} />
          )}
        </CtrlButton>
        <CtrlButton
          label="Закрыть"
          onClick={() => window.api.window.close()}
          danger
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </CtrlButton>
      </div>
    </header>
  );
}

function CtrlButton({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-full w-11 items-center justify-center text-fg-muted transition-colors',
        danger ? 'hover:bg-destructive hover:text-fg' : 'hover:bg-bg-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}
