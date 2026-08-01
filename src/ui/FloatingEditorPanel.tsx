import type { ReactNode } from 'react';
import { Lock, Unlock, X } from 'lucide-react';
import { Button, cn, useIsPhone } from './kit';

const CHROME =
  'rounded-xl border border-border bg-panel/95 p-3 text-fg shadow-popover backdrop-blur-md';

/**
 * Floating editor shell shared by the active-container and active-measurement editors.
 * Desktop: a left-pinned, vertically-centered card. Phone: a full-width sheet pinned above
 * the mobile inspector FAB. Renders the title + lock/unlock + close header; `children` is the
 * locked/unlocked body.
 */
export function FloatingEditorPanel({
  title,
  width,
  locked,
  onToggleLock,
  onClose,
  children,
}: {
  title: ReactNode;
  /** Desktop card width utility, e.g. 'w-64' (phone ignores it — full-width sheet). */
  width: string;
  locked: boolean;
  onToggleLock: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const isPhone = useIsPhone();
  const containerClass = isPhone
    ? cn('absolute inset-x-2 bottom-20 z-10', CHROME)
    : cn('absolute left-3 top-1/2 z-10 -translate-y-1/2', width, CHROME);

  return (
    <div className={containerClass}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-fg-subtle">{title}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" aria-label={locked ? 'Unlock' : 'Lock'} onPress={onToggleLock}>
            {locked ? <Lock size={14} /> : <Unlock size={14} />}
          </Button>
          <Button size="sm" aria-label="Close" onPress={onClose}>
            <X size={14} />
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}
