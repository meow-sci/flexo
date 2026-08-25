/**
 * The flexo-style top row: kit MenuBar (File/Add/Edit/Arrange/View), the
 * centered workspace-MODE switcher (flexo's ModeSwitcher pattern — segmented
 * chips, labels drop on narrow widths, native `title` spans because the group's
 * children must stay ToggleButtons for roving focus), the tool buttons and the
 * view toggles. Every icon control carries a kit Tooltip and grows a text label
 * on wide screens ("blatantly obvious" pass); on phones the bar scrolls
 * horizontally and the far-right buttons open the sidebar drawers.
 */
import { useStore } from '@nanostores/react';
import {
  Blocks,
  Box,
  Grid3x3,
  Magnet,
  MapPin,
  MousePointer2,
  Move,
  PanelLeft,
  PanelRight,
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
  ToggleButtonGroup,
  Tooltip,
  type MenuBarMenu,
} from '../../../../src/ui/kit';
import { useIsPhone } from '../../../../src/ui/kit/useIsPhone';
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
  $collidersVisible,
  $groundLock,
  $keepGrounded,
  $overlaysVisible,
  $snap,
  $tool,
  setTool,
  toggleSnap,
  type Tool,
} from '../state/toolStore';
import { $mode, MODES, setMode, type WorkspaceMode } from '../state/modeStore';
import { $addOpen, $exportOpen, $leftPanelOpen, $rightPanelOpen } from '../state/uiStore';
import { getScene } from '../three/sceneHandle';

const MODE_ICONS: Record<WorkspaceMode, typeof Blocks> = {
  build: Blocks,
  colliders: Box,
  sites: MapPin,
};

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
            <Row
              label="New launch site"
              onAction={() => {
                addSite('Earth');
                setMode('sites');
              }}
            />
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
            {MODES.map((mode, i) => (
              <Row
                key={mode.id}
                label={`${mode.label} mode`}
                keys={[String(i + 1)]}
                checked={$mode.get() === mode.id}
                onAction={() => setMode(mode.id)}
              />
            ))}
            <MenuSeparator />
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
            <Row
              label="Colliders"
              keys={['C']}
              checked={$collidersVisible.get()}
              onAction={() => $collidersVisible.set(!$collidersVisible.get())}
            />
          </>,
        ),
    },
  ];
}

/** Centered workspace-mode chips (Build / Colliders / Sites). */
function ModeSwitcher() {
  const current = useStore($mode);
  return (
    <ToggleButtonGroup
      size="xs"
      selectionMode="single"
      disallowEmptySelection
      aria-label="Workspace mode"
      className="w-auto shrink-0"
      selectedKeys={new Set([current])}
      onSelectionChange={(keys) => {
        const [id] = [...keys];
        if (typeof id === 'string') setMode(id as WorkspaceMode);
      }}
    >
      {MODES.map((mode) => {
        const Icon = MODE_ICONS[mode.id];
        return (
          <ToggleButton
            key={mode.id}
            id={mode.id}
            size="xs"
            aria-label={mode.label}
            className="flex-none px-2"
          >
            {/* Native `title` rather than a kit Tooltip: the group's children
                must stay ToggleButtons for react-aria's roving focus. */}
            <span className="flex items-center justify-center" title={mode.hint}>
              <Icon size={13} />
            </span>
            <span className="hidden min-[1100px]:inline">{mode.label}</span>
          </ToggleButton>
        );
      })}
    </ToggleButtonGroup>
  );
}

function ToolButton(props: { tool: Tool; icon: React.ReactNode; label: string; hint: string }) {
  const tool = useStore($tool);
  return (
    <Tooltip content={props.hint}>
      <ToggleButton
        size="sm"
        className="shrink-0"
        aria-label={props.label}
        isSelected={tool === props.tool}
        onChange={() => setTool(props.tool)}
      >
        {props.icon}
        <span className="hidden whitespace-nowrap min-[1400px]:inline">{props.label}</span>
      </ToggleButton>
    </Tooltip>
  );
}

function ViewToggle(props: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  selected: boolean;
  onChange: () => void;
}) {
  return (
    <Tooltip content={props.hint}>
      <ToggleButton
        size="sm"
        className="shrink-0"
        aria-label={props.label}
        isSelected={props.selected}
        onChange={props.onChange}
      >
        {props.icon}
        <span className="hidden whitespace-nowrap min-[1400px]:inline">{props.label}</span>
      </ToggleButton>
    </Tooltip>
  );
}

export function TopBar() {
  const depth = useStore($historyDepth);
  const snap = useStore($snap);
  const groundLock = useStore($groundLock);
  const overlays = useStore($overlaysVisible);
  const colliders = useStore($collidersVisible);
  const mode = useStore($mode);
  const isPhone = useIsPhone();
  // Menus re-evaluate enabled/checked on open (kit contract); these subscriptions
  // keep the toolbar toggles live.
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border bg-panel px-2 py-0.5 [scrollbar-width:thin]">
      <span className="mr-1 shrink-0 text-sm font-semibold text-fg">ICRP</span>
      <MenuBar menus={buildMenus()} />
      <div className="mx-1 h-4 w-px shrink-0 bg-border" />
      <ModeSwitcher />
      <div className="mx-1 h-4 w-px shrink-0 bg-border" />
      <ToolButton
        tool="select"
        icon={<MousePointer2 size={14} />}
        label="Select"
        hint="Select pieces — click, or drag a box (Q)"
      />
      <ToolButton
        tool="translate"
        icon={<Move size={14} />}
        label="Move"
        hint="Move the selection — drag the gizmo or grab a piece (W)"
      />
      <ToolButton
        tool="rotate"
        icon={<RotateCw size={14} />}
        label="Rotate"
        hint="Rotate the selection (E)"
      />
      <ToolButton
        tool="scale"
        icon={<Scaling size={14} />}
        label="Scale"
        hint="Scale the selection — resizes a selected collider too (R)"
      />
      <div className="mx-1 h-4 w-px shrink-0 bg-border" />
      <ViewToggle
        icon={<Magnet size={14} />}
        label="Snap"
        hint={`Snap moves to ${snap.translateM} m and rotations to ${snap.rotateDeg}°`}
        selected={snap.enabled}
        onChange={toggleSnap}
      />
      <ViewToggle
        icon={<Grid3x3 size={14} />}
        label="Ground lock"
        hint="Limit rotation to spinning flat on the ground (G)"
        selected={groundLock}
        onChange={() => $groundLock.set(!groundLock)}
      />
      <ViewToggle
        icon={<Circle size={14} />}
        label="Overlays"
        hint="Show the pad footprint and surface rings (always on in Sites mode)"
        selected={overlays || mode === 'sites'}
        onChange={() => $overlaysVisible.set(!overlays)}
      />
      <ViewToggle
        icon={<Box size={14} />}
        label="Colliders"
        hint="Show collider wireframes (always on in Colliders mode) (C)"
        selected={colliders || mode === 'colliders'}
        onChange={() => $collidersVisible.set(!colliders)}
      />
      <div className="min-w-2 flex-1" />
      <Tooltip content="Undo (⌘Z)">
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0"
          aria-label="Undo"
          isDisabled={depth.undo === 0}
          onPress={() => undo()}
        >
          <Redo2 size={14} className="-scale-x-100" />
        </Button>
      </Tooltip>
      <Tooltip content="Redo (⇧⌘Z)">
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0"
          aria-label="Redo"
          isDisabled={depth.redo === 0}
          onPress={() => redo()}
        >
          <Redo2 size={14} />
        </Button>
      </Tooltip>
      {!isPhone && (
        <Button size="sm" className="shrink-0" onPress={() => $exportOpen.set(true)}>
          Export mod…
        </Button>
      )}
      {isPhone && (
        <>
          <Tooltip content="Open the details panel">
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              aria-label="Toggle left panel"
              onPress={() => $leftPanelOpen.set(!$leftPanelOpen.get())}
            >
              <PanelLeft size={14} />
            </Button>
          </Tooltip>
          <Tooltip content="Open the layers / lists panel">
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              aria-label="Toggle right panel"
              onPress={() => $rightPanelOpen.set(!$rightPanelOpen.get())}
            >
              <PanelRight size={14} />
            </Button>
          </Tooltip>
        </>
      )}
    </div>
  );
}
