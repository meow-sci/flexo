import { useState } from 'react';
import { Modal, Dialog, DialogHeader, Button, Switch } from './kit';
import { PreciseNumberInput } from './PreciseNumberInput';
import { scaleEverything } from '../state/editorStore';
import { toast } from './toast';

/**
 * "Scale Everything" — multiplies the whole workspace (every part, connector,
 * kitten), every animation keyframe, every parametric propellant container
 * (`<Tank>` / `<SolidGrainSegment>`) AND the VAB `<Diameter>` size classes by per-axis
 * factors around the origin, in one undoable step. The animation-safe alternative to a multi-select resize, which
 * can't reach animation offsets and breaks animated parts when scaled.
 *
 * Root-hosted by `DialogRoot` under the dialog id `'scale-everything'`.
 */
export function ScaleEverythingDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [x, setX] = useState(1);
  const [y, setY] = useState(1);
  const [z, setZ] = useState(1);
  // When linked, the single X value drives all three axes (the common case).
  const [linked, setLinked] = useState(true);

  const reset = (): void => {
    setX(1);
    setY(1);
    setZ(1);
  };

  const close = (): void => {
    onOpenChange(false);
    reset();
  };

  const setAxisX = (v: number): void => {
    setX(v);
    if (linked) {
      setY(v);
      setZ(v);
    }
  };

  const noop = x === 1 && y === 1 && z === 1;

  const apply = (): void => {
    scaleEverything({ x, y, z });
    toast({ title: `Scaled everything ${x}×${y}×${z}` });
    close();
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      isDismissable
      variant="center"
    >
      <Dialog>
        <DialogHeader title="Scale Everything" onClose={close} />
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-fg-muted">
            Multiplies the whole workspace — every part, connector, kitten, all animation keyframes,
            and the tank / grain-segment dimensions in Part Data — by these factors, around the
            origin. Diameter size classes follow, snapped to the nearest 0.5 m. A single undoable
            step.
          </p>

          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-fg-muted">Link axes (uniform)</span>
            <Switch
              aria-label="Scale all axes uniformly"
              isSelected={linked}
              onChange={(on) => {
                setLinked(on);
                if (on) {
                  // Re-linking collapses every axis onto the current X factor.
                  setY(x);
                  setZ(x);
                }
              }}
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <AxisField label="X" value={x} onCommit={setAxisX} />
            <AxisField label="Y" value={y} onCommit={setY} isDisabled={linked} />
            <AxisField label="Z" value={z} onCommit={setZ} isDisabled={linked} />
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <Button variant="secondary" onPress={close}>
              Cancel
            </Button>
            <Button variant="primary" isDisabled={noop} onPress={apply}>
              Apply
            </Button>
          </div>
        </div>
      </Dialog>
    </Modal>
  );
}

function AxisField({
  label,
  value,
  onCommit,
  isDisabled,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  isDisabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-fg-subtle">{label}</span>
      <PreciseNumberInput
        aria-label={`Scale ${label}`}
        className="w-full"
        min={0.0001}
        value={value}
        onCommit={onCommit}
        isDisabled={isDisabled}
      />
    </label>
  );
}
