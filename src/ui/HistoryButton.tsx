import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { GridList, GridListItem } from 'react-aria-components'
import { History, MoveRight } from 'lucide-react'
import {
  DialogTrigger,
  Popover,
  PopoverDialog,
  Modal,
  Dialog,
  DialogHeader,
  ToolbarButton,
  toast,
} from './kit'
import { $historyList, jumpToHistory, type HistoryListItem } from '../state/editorStore'

interface HistoryContentProps {
  className?: string
  onJump: (item: HistoryListItem) => void
}

function HistoryContent({ className, onJump }: HistoryContentProps) {
  const historyList = useStore($historyList)
  const redoItems = historyList.filter((item) => item.stepsFromCurrent > 0)
  const undoItems = historyList.filter((item) => item.stepsFromCurrent < 0)

  return (
    <div className={className}>
      {redoItems.length > 0 && (
        <GridList
          aria-label="Redo history"
          selectionMode="none"
          className="flex flex-col gap-0.5 pb-0.5 outline-none"
        >
          {redoItems.map((item) => (
            <HistoryRow key={item.stepsFromCurrent} item={item} label="Redo" onPress={onJump} />
          ))}
        </GridList>
      )}

      <div className="flex items-center gap-1.5 px-2 py-1.5 text-accent">
        <MoveRight size={13} className="shrink-0" />
        <span className="text-xs font-semibold">current</span>
        <span className="h-px flex-1 bg-accent opacity-30" />
      </div>

      {undoItems.length > 0 && (
        <GridList
          aria-label="Undo history"
          selectionMode="none"
          className="flex flex-col gap-0.5 pt-0.5 outline-none"
        >
          {undoItems.map((item) => (
            <HistoryRow key={item.stepsFromCurrent} item={item} label="Undo" onPress={onJump} />
          ))}
        </GridList>
      )}
    </div>
  )
}

interface HistoryButtonProps {
  isOpen?: boolean
  onOpenChange?: (v: boolean) => void
}

/**
 * History panel: undo/redo stack with jump-to support.
 * Desktop: opens as a positioned popover. Mobile menu: opens as a bottom sheet.
 */
export function HistoryButton({ isOpen: externalOpen, onOpenChange: externalOnChange }: HistoryButtonProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const historyList = useStore($historyList)
  const isControlled = externalOpen !== undefined
  const open = isControlled ? externalOpen! : internalOpen
  const setOpen = isControlled ? (v: boolean) => externalOnChange?.(v) : setInternalOpen

  const redoItems = historyList.filter((item) => item.stepsFromCurrent > 0)
  const undoItems = historyList.filter((item) => item.stepsFromCurrent < 0)
  const hasHistory = redoItems.length > 0 || undoItems.length > 0

  const handleJump = (item: HistoryListItem) => {
    if (item.stepsFromCurrent === 0) return
    const label = jumpToHistory(item.stepsFromCurrent)
    const prefix = item.stepsFromCurrent < 0 ? 'Undo' : 'Redo'
    toast({ title: `${prefix}: ${label}` }, { timeout: 1500 })
    setOpen(false)
  }

  if (isControlled) {
    return (
      <Modal isOpen={open} onOpenChange={setOpen} isDismissable variant="sheet">
        <Dialog>
          <DialogHeader title="History" onClose={() => setOpen(false)} />
          <HistoryContent className="flex flex-col overflow-auto p-1" onJump={handleJump} />
        </Dialog>
      </Modal>
    )
  }

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <ToolbarButton aria-label="History" isDisabled={!hasHistory}>
        <History size={16} />
        {/* Label visible only on phone (overflow menu); desktop toolbar stays icon-only. */}
        <span className="sm:hidden">History</span>
      </ToolbarButton>
      <Popover placement="bottom end" className="w-56">
        <PopoverDialog>
          <HistoryContent className="flex max-h-80 flex-col overflow-auto p-1" onJump={handleJump} />
        </PopoverDialog>
      </Popover>
    </DialogTrigger>
  )
}

function HistoryRow({
  item,
  label,
  onPress,
}: {
  item: HistoryListItem
  label: 'Undo' | 'Redo'
  onPress: (item: HistoryListItem) => void
}) {
  const textValue = item.detail ? `${label}: ${item.description} · ${item.detail}` : `${label}: ${item.description}`
  return (
    <GridListItem
      id={String(item.stepsFromCurrent)}
      textValue={textValue}
      onAction={() => onPress(item)}
      className={({ isFocusVisible }) =>
        [
          'flex cursor-default select-none flex-col gap-0.5 rounded-md px-2 py-1.5 outline-none hover:bg-white/[0.06]',
          isFocusVisible ? 'ring-1 ring-inset ring-accent' : '',
        ].join(' ')
      }
    >
      <span className="text-xs font-semibold text-fg">{label}</span>
      <span className="truncate text-xs text-fg-subtle">
        {item.description}
        {item.detail ? ` · ${item.detail}` : ''}
      </span>
    </GridListItem>
  )
}
