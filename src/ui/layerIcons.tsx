import {
  Blend,
  Eye,
  EyeOff,
  GripVertical,
  List,
  ListX,
  Lock,
  LockOpen,
  Pencil,
  Save,
  Scan,
  Trash2,
} from 'lucide-react'

export function EyeIcon() {
  return <Eye className="size-4" />
}
export function EyeOffIcon() {
  return <EyeOff className="size-4" />
}
export function LockIcon() {
  return <Lock className="size-4" />
}
export function UnlockIcon() {
  return <LockOpen className="size-4" />
}

/** Layer's entities appear in the Assets list. */
export function ListedIcon() {
  return <List className="size-4" />
}
/** Layer's entities are hidden from the Assets list. */
export function UnlistedIcon() {
  return <ListX className="size-4" />
}

/** Crosshair-style "select all in layer" affordance. */
export function SelectAllIcon() {
  return <Scan className="size-4" />
}

/** Layer opacity / fade affordance. */
export function BlendIcon() {
  return <Blend className="size-4" />
}

export function TrashIcon() {
  return <Trash2 className="size-4" />
}

export function PencilIcon() {
  return <Pencil className="size-4" />
}

export function SaveIcon() {
  return <Save className="size-4" />
}

export function GripVerticalIcon() {
  return <GripVertical className="size-3.5" />
}
