import { useStore } from '@nanostores/react'
import { MoreHorizontal, Redo, Undo } from 'lucide-react'
import {
  DialogTrigger,
  Popover,
  PopoverDialog,
  Toolbar,
  ToolbarSeparator,
  ToolbarButton,
  toast,
} from './kit'
import { $canRedo, $canUndo, redo, undo } from '../state/editorStore'
import { AddButton } from './AddButton'
import { ProjectButton } from './ProjectButton'
import { PartDataButton } from './PartDataButton'
import { ExportButton } from './ExportButton'
import { ViewButton } from './ViewButton'
import { MeasureButton } from './MeasureButton'
import { HistoryButton } from './HistoryButton'
import { SettingsButton } from './SettingsButton'

/**
 * Phone-only top toolbar: full-width compact bar with the primary actions
 * (Project, Add, Undo/Redo) and an overflow popover ("⋯") holding the secondary
 * actions whose own buttons still drive their own popovers/modals. Nested
 * overlays are supported by react-aria so each secondary button keeps working
 * unchanged.
 */
export function MobileTopBar() {
  const canUndo = useStore($canUndo)
  const canRedo = useStore($canRedo)

  return (
    <Toolbar
      aria-label="Editor actions"
      className="rounded-none border-x-0 border-t-0 px-2"
    >
      <ProjectButton />

      <div className="flex-1" />

      <AddButton />

      <ToolbarSeparator />

      <ToolbarButton
        isDisabled={!canUndo}
        aria-label="Undo"
        onPress={() => {
          const d = undo()
          if (d) toast({ title: `Undo: ${d}` }, { timeout: 1500 })
        }}
      >
        <Undo size={16} />
      </ToolbarButton>
      <ToolbarButton
        isDisabled={!canRedo}
        aria-label="Redo"
        onPress={() => {
          const d = redo()
          if (d) toast({ title: `Redo: ${d}` }, { timeout: 1500 })
        }}
      >
        <Redo size={16} />
      </ToolbarButton>

      <DialogTrigger>
        <ToolbarButton aria-label="More actions">
          <MoreHorizontal size={16} />
        </ToolbarButton>
        <Popover placement="bottom end" className="w-56">
          <PopoverDialog className="flex flex-col gap-0.5 p-1 [&_button]:w-full [&_button]:justify-start">
            <PartDataButton />
            <ExportButton />
            <ViewButton />
            <MeasureButton />
            <HistoryButton />
            <SettingsButton />
          </PopoverDialog>
        </Popover>
      </DialogTrigger>
    </Toolbar>
  )
}
