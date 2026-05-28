import {
  SearchField as AriaSearchField,
  Input,
  type SearchFieldProps,
} from 'react-aria-components'
import { Search, X } from 'lucide-react'
import { type VariantProps } from 'tailwind-variants'
import { inputStyles } from './Field'
import { composeTw } from './styles'
import { Button } from './Button'

export interface SearchFieldKitProps
  extends Omit<SearchFieldProps, 'children'>,
    VariantProps<typeof inputStyles> {
  placeholder?: string
}

export function SearchField({ size = 'md', placeholder, className, ...props }: SearchFieldKitProps) {
  return (
    <AriaSearchField
      {...props}
      aria-label={props['aria-label'] ?? 'Search'}
      className={composeTw('group relative flex items-center', className)}
    >
      <Search
        className="pointer-events-none absolute left-2 text-fg-subtle"
        size={size === 'sm' ? 14 : 16}
      />
      <Input
        placeholder={placeholder}
        className={inputStyles({
          size,
          className: 'pl-7 pr-7 [&::-webkit-search-cancel-button]:hidden',
        })}
      />
      <Button
        slot="clear"
        variant="ghost"
        size="sm"
        iconOnly
        // Hidden until there's a query (react-aria sets group data-empty).
        className="absolute right-0.5 size-6 group-data-[empty]:hidden"
        aria-label="Clear search"
      >
        <X size={14} />
      </Button>
    </AriaSearchField>
  )
}
