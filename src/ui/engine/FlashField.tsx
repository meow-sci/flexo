import { cn } from '../kit';
import { useFieldFlash } from './editorKit';

/**
 * Wraps a field so the ISSUES click-through can point at it. `fieldKey` is one of the keys
 * `engineStore`'s `FIELD_ADDRESSABLE` table emits (`mixtureRatio`, `exhaustDirection`,
 * `defaultPressure`, `reactionId`).
 */
export function FlashField({
  fieldKey,
  children,
}: {
  fieldKey: string;
  children: React.ReactNode;
}) {
  const flashing = useFieldFlash(fieldKey);
  return (
    <div className={cn('flex flex-col gap-1 rounded-md', flashing && 'row-flash')}>{children}</div>
  );
}

/** The small stacked label the Vec3 rows use (kit `Field` wraps a single control). */
export function VecLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-fg-subtle">{children}</span>;
}
