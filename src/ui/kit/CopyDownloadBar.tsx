import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { Button } from './Button';
import { toast } from '../toast';

/**
 * The one copy-with-✓ + download pair (foundation §10.1; design-system-services §7.5),
 * replacing the hand-rolled clipboard/download clusters (export XML tabs, share link,
 * project archive export) as those surfaces are rebuilt.
 *
 * The payload is produced lazily by `getText` so a dialog with several tabs only
 * serializes the tab the user actually acts on (foundation §10.6).
 */
export function CopyDownloadBar({
  getText,
  filename,
  mime = 'text/plain',
  copyLabel = 'Copy',
  downloadLabel = 'Download',
  size = 'sm',
}: {
  /** Lazily produce the payload; may be async. */
  getText: () => string | Promise<string>;
  /** Download name, e.g. `part.xml`. */
  filename: string;
  mime?: string;
  copyLabel?: string;
  downloadLabel?: string;
  size?: 'xs' | 'sm';
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const iconSize = size === 'xs' ? 12 : 14;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(await getText());
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn('clipboard write failed', err);
      toast({ title: 'Copy failed', variant: 'danger' });
    }
  };

  const download = async () => {
    const url = URL.createObjectURL(new Blob([await getText()], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex gap-(--density-gap)">
      <Button
        size={size}
        variant="secondary"
        className={size === 'xs' ? 'px-2' : ''}
        onPress={copy}
      >
        {copied ? <Check size={iconSize} /> : <Copy size={iconSize} />}
        {copied ? 'Copied' : copyLabel}
      </Button>
      <Button
        size={size}
        variant="secondary"
        className={size === 'xs' ? 'px-2' : ''}
        onPress={download}
      >
        <Download size={iconSize} />
        {downloadLabel}
      </Button>
    </div>
  );
}
