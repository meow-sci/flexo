import {
  Disclosure as AriaDisclosure,
  DisclosurePanel as AriaDisclosurePanel,
  Button as AriaButton,
  Heading,
  type DisclosureProps,
} from 'react-aria-components'
import { ChevronRight } from 'lucide-react'
import { focusRing } from './styles'
import { cn } from './styles'

/**
 * A single collapsible section: a full-width header button (chevron + title +
 * optional trailing badge) over a panel of content. Thin wrapper over
 * react-aria-components' Disclosure so styling stays in the kit. Works the same
 * on desktop and mobile (it's just a button + region), so callers can stack
 * several in a scrollable dialog body.
 */
export function DisclosureSection({
  title,
  badge,
  defaultExpanded,
  children,
  ...props
}: {
  title: React.ReactNode
  /** Optional trailing hint, e.g. an item count ("2") shown in the header. */
  badge?: React.ReactNode
  defaultExpanded?: boolean
  children: React.ReactNode
} & Omit<DisclosureProps, 'children'>) {
  return (
    <AriaDisclosure
      {...props}
      defaultExpanded={defaultExpanded}
      className="group shrink-0 overflow-hidden rounded-lg border border-border bg-panel"
    >
      <Heading>
        <AriaButton
          slot="trigger"
          className={cn(
            focusRing(),
            'flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-fg hover:bg-white/5',
          )}
        >
          <ChevronRight
            size={14}
            className="shrink-0 text-fg-subtle transition-transform group-data-[expanded]:rotate-90"
          />
          <span className="flex-1">{title}</span>
          {badge != null && badge !== '' && (
            <span className="shrink-0 rounded bg-panel-sunken px-1.5 py-0.5 text-xs text-fg-subtle">
              {badge}
            </span>
          )}
        </AriaButton>
      </Heading>
      <AriaDisclosurePanel className="flex flex-col gap-3 border-t border-border px-3 py-3">
        {children}
      </AriaDisclosurePanel>
    </AriaDisclosure>
  )
}
