// Centralized react-aria + Tailwind component kit. Import UI primitives from
// here (not from react-aria-components directly) so styling stays in one place.

export {
  cn,
  composeTw,
  dangerBox,
  focusRing,
  gridRowClass,
  monoTextarea,
  monoTextareaFill,
  noteBox,
  panelChrome,
  warningBox,
} from './styles';

export { Button, button, type ButtonKitProps } from './Button';
export { ToggleButton, ToggleButtonGroup, type ToggleButtonKitProps } from './ToggleButton';
export { Toolbar, ToolbarSeparator, ToolbarButton } from './Toolbar';

export { Label, Description, FieldError, FieldGroup, SectionTitle, inputStyles } from './Field';
export { TextField, type TextFieldKitProps } from './TextField';
export { SearchField, type SearchFieldKitProps } from './SearchField';
export { Select, type SelectKitProps } from './Select';
export { ListBox, ListBoxItem, GridList, GridListItem } from './ListBox';

export {
  Menu,
  MenuItem,
  MenuSection,
  MenuHeader,
  MenuSeparator,
  type MenuItemKitProps,
} from './Menu';
export { MenuBar, MenuShortcut, type MenuBarMenu, type MenuBarProps } from './MenuBar';
export { Popover, PopoverDialog } from './Popover';
export { Modal, Dialog, DialogHeader } from './Modal';
export { Sheet, type SheetProps } from './Sheet';
export { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';
export {
  DialogViewStack,
  useDialogViewStack,
  type DialogView,
  type DialogViewStackApi,
} from './DialogViewStack';
export { InlineConfirmStrip } from './InlineConfirmStrip';
export { CopyDownloadBar } from './CopyDownloadBar';
export { ColorField } from './ColorField';

export { DisclosureSection } from './Disclosure';
export { Checkbox } from './Checkbox';
export { Switch } from './Switch';
export { Slider } from './Slider';
export { Tooltip, type TooltipKitProps } from './Tooltip';
export { TagGroup, TagList, Tag, Chip } from './Tag';

export { GlobalToastRegion, toast, toastQueue, type ToastMessage } from './Toast';

export { Kbd } from './Kbd';
export { IS_APPLE, keyLabel } from './keyDisplay';

export { useIsPhone } from './useIsPhone';
export { usePointerDrag, type PointerDragOptions } from './usePointerDrag';
export { ResizeHandle, type ResizeHandleProps } from './ResizeHandle';
export { FloatingWindow, type FloatingWindowProps } from './FloatingWindow';
export { clampFloatPos, resolveAnchor, type FloatAnchor, type Rect } from './floatClamp';

/** The one stacking scale — never write a literal z-index (foundation §1.3). */
export { z } from './zIndex';

// Triggers / collection pieces that don't need styling are re-exported verbatim
// so call sites only ever import from the kit.
export { DialogTrigger, MenuTrigger, SubmenuTrigger, Heading, Header } from 'react-aria-components';
