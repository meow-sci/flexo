/**
 * The flexo-style top row: kit MenuBar (File/Add/Edit/Arrange/View) + the tool
 * buttons + undo/redo. Every menu action dispatches the same mutators the
 * hotkeys use.
 */
import { useStore } from '@nanostores/react';
import {
  Grid3x3,
  Magnet,
  MousePointer2,
  Move,
  Redo2,
  RotateCw,
  Scaling,
  Circle,
} from 'lucide-react';
import {
  Button,
  Kbd,
  Menu,
  MenuBar,
  MenuItem,
  MenuSeparator,
  Popover,
  ToggleButton,
  type MenuBarMenu,
} from '../../../../src/ui/kit';
import {
  $historyDepth,
  $selection,
  addLayer,
  addObject,
  addSite,
  duplicatePlacements,
  redo,
  removePlacements,
  resetProject,
  selectAllVisible,
  undo,
} from '../state/docStore';
import {
  $groundLock,
  $keepGrounded,
  $overlaysVisible,
  $snap,
  $tool,
  setTool,
  toggleSnap,
  type Tool,
} from '../state/toolStore';
import { $addOpen, $exportOpen } from '../state/uiStore';
import { getScene } from '../three/sceneHandle';

/** A menu row with an optional trailing shortcut chip. */
function Row(props: {
  label: string;
  keys?: string[];
  onAction: () => void;
  disabled?: boolean;
  checked?: boolean;
}) {
  return (
    <MenuItem density="dense" isDisabled={props.disabled} onAction={props.onAction}>
      <span className="flex w-full items-center">
        {props.checked !== undefined && (
          <span className="w-4 text-accent">{props.checked ? '✓' : ''}</span>
        )}
        {props.label}
        {props.keys && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5 pl-4">
            {props.keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </span>
        )}
      </span>
    </MenuItem>
  );
}

function wrap(children: React.ReactNode) {
  return (
    <Popover>
      <Menu aria-label="menu">{children}</Menu>
    </Popover>
  );
}

function buildMenus(): MenuBarMenu[] {
  return [
    {
      id: 'file',
      label: 'File',
      renderMenu: () =>
        wrap(
          <>
            <Row
              label="New project…"
              onAction={() => {
                if (confirm('Start a fresh project? The current one is autosaved until then.')) {
                  resetProject();
                }
              }}
            />
            <MenuSeparator />
            <Row label="Export mod…" keys={['⌘', 'E']} onAction={() => $exportOpen.set(true)} />
          </>,
        ),
    },
    {
      id: 'add',
      label: 'Add',
      renderMenu: () =>
        wrap(
          <>
            <Row label="Piece / part…" keys={['A']} onAction={() => $addOpen.set(true)} />
            <MenuSeparator />
            <Row label="New object" onAction={() => addObject()} />
            <Row label="New layer" onAction={() => addLayer('Layer')} />
            <Row label="New launch site" onAction={() => addSite('Earth')} />
          </>,
        ),
    },
    {
      id: 'edit',
      label: 'Edit',
      renderMenu: () => {
        const depth = $historyDepth.get();
        const selection = $selection.get();
        return wrap(
          <>
            <Row label="Undo" keys={['⌘', 'Z']} disabled={depth.undo === 0} onAction={undo} />
            <Row label="Redo" keys={['⇧', '⌘', 'Z']} disabled={depth.redo === 0} onAction={redo} />
            <MenuSeparator />
            <Row
              label="Duplicate"
              keys={['⌘', 'D']}
              disabled={selection.length === 0}
              onAction={() => duplicatePlacements($selection.get())}
            />
            <Row
              label="Delete"
              keys={['⌫']}
              disabled={selection.length === 0}
              onAction={() => removePlacements($selection.get())}
            />
            <MenuSeparator />
            <Row label="Select all" keys={['⌘', 'A']} onAction={() => selectAllVisible()} />
            <Row label="Deselect" keys={['Esc']} onAction={() => $selection.set([])} />
          </>,
        );
      },
    },
    {
      id: 'arrange',
      label: 'Arrange',
      renderMenu: () => {
        const selection = $selection.get();
        const none = selection.length === 0;
        return wrap(
          <>
            <Row
              label="Drop to ground"
              keys={['⌘', '↓']}
              disabled={none}
              onAction={() => getScene()?.dropToGround($selection.get())}
            />
            <Row
              label="Rest on top"
              keys={['⇧', '⌘', '↓']}
              disabled={none}
              onAction={() => getScene()?.restOnTop($selection.get())}
            />
            <MenuSeparator />
            <Row
              label="Keep grounded after scaling"
              checked={$keepGrounded.get()}
              onAction={() => $keepGrounded.set(!$keepGrounded.get())}
            />
          </>,
        );
      },
    },
    {
      id: 'view',
      label: 'View',
      renderMenu: () =>
        wrap(
          <>
            <Row
              label="Frame selection"
              keys={['F']}
              onAction={() => getScene()?.frameSelection()}
            />
            <Row label="Frame all" keys={['⇧', 'F']} onAction={() => getScene()?.frameAll()} />
            <MenuSeparator />
            <Row label="Snap" checked={$snap.get().enabled} onAction={() => toggleSnap()} />
            <Row
              label="Ground-locked rotation"
              keys={['G']}
              checked={$groundLock.get()}
              onAction={() => $groundLock.set(!$groundLock.get())}
            />
            <Row
              label="Site overlays"
              checked={$overlaysVisible.get()}
              onAction={() => $overlaysVisible.set(!$overlaysVisible.get())}
            />
          </>,
        ),
    },
  ];
}

function ToolButton(props: { tool: Tool; icon: React.ReactNode; label: string }) {
  const tool = useStore($tool);
  return (
    <ToggleButton
      size="sm"
      aria-label={props.label}
      isSelected={tool === props.tool}
      onChange={() => setTool(props.tool)}
    >
      {props.icon}
    </ToggleButton>
  );
}

export function TopBar() {
  const depth = useStore($historyDepth);
  const snap = useStore($snap);
  const groundLock = useStore($groundLock);
  const overlays = useStore($overlaysVisible);
  // Menus re-evaluate enabled/checked on open (kit contract); these subscriptions
  // keep the toolbar toggles live.
  return (
    <div className="flex items-center gap-1.5 border-b border-border bg-panel px-2 py-0.5">
      <span className="mr-1 text-sm font-semibold text-fg">ICRP</span>
      <MenuBar menus={buildMenus()} />
      <div className="mx-1 h-4 w-px bg-border" />
      <ToolButton tool="select" icon={<MousePointer2 size={14} />} label="Select" />
      <ToolButton tool="translate" icon={<Move size={14} />} label="Move" />
      <ToolButton tool="rotate" icon={<RotateCw size={14} />} label="Rotate" />
      <ToolButton tool="scale" icon={<Scaling size={14} />} label="Scale" />
      <div className="mx-1 h-4 w-px bg-border" />
      <ToggleButton size="sm" aria-label="Snap" isSelected={snap.enabled} onChange={toggleSnap}>
        <Magnet size={14} />
      </ToggleButton>
      <ToggleButton
        size="sm"
        aria-label="Ground-locked rotation"
        isSelected={groundLock}
        onChange={() => $groundLock.set(!groundLock)}
      >
        <Grid3x3 size={14} />
      </ToggleButton>
      <ToggleButton
        size="sm"
        aria-label="Site overlays"
        isSelected={overlays}
        onChange={() => $overlaysVisible.set(!overlays)}
      >
        <Circle size={14} />
      </ToggleButton>
      <div className="flex-1" />
      <Button
        size="sm"
        variant="ghost"
        aria-label="Undo"
        isDisabled={depth.undo === 0}
        onPress={() => undo()}
      >
        <Redo2 size={14} className="-scale-x-100" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Redo"
        isDisabled={depth.redo === 0}
        onPress={() => redo()}
      >
        <Redo2 size={14} />
      </Button>
      <Button size="sm" onPress={() => $exportOpen.set(true)}>
        Export mod…
      </Button>
    </div>
  );
}
