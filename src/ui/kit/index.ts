// Centralized react-aria + Tailwind component kit. Import UI primitives from
// here (not from react-aria-components directly) so styling stays in one place.

export { cn, composeTw, focusRing } from './styles'

export { Button, button, type ButtonKitProps } from './Button'
export { ToggleButton, ToggleButtonGroup, type ToggleButtonKitProps } from './ToggleButton'
export { Toolbar, ToolbarSeparator, ToolbarButton } from './Toolbar'

export {
  Label,
  Description,
  FieldError,
  FieldGroup,
  SectionTitle,
  inputStyles,
} from './Field'
export { TextField, type TextFieldKitProps } from './TextField'
export { SearchField, type SearchFieldKitProps } from './SearchField'
export { Select, type SelectKitProps } from './Select'
export { ListBox, ListBoxItem } from './ListBox'

export {
  Menu,
  MenuItem,
  MenuSection,
  MenuHeader,
  MenuSeparator,
  type MenuItemKitProps,
} from './Menu'
export { Popover, PopoverDialog } from './Popover'
export { Modal, Dialog, DialogHeader } from './Modal'
export { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog'

export { DisclosureSection } from './Disclosure'
export { Checkbox } from './Checkbox'
export { Switch } from './Switch'
export { Slider } from './Slider'
export { Tooltip, type TooltipKitProps } from './Tooltip'
export { TagGroup, TagList, Tag, Chip } from './Tag'

export { GlobalToastRegion, toast, toastQueue, type ToastMessage } from './Toast'

export { useIsPhone } from './useIsPhone'

// Triggers / collection pieces that don't need styling are re-exported verbatim
// so call sites only ever import from the kit.
export {
  DialogTrigger,
  MenuTrigger,
  SubmenuTrigger,
  Heading,
  Header,
} from 'react-aria-components'
