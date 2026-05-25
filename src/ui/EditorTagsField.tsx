import { useState } from 'react'
import {
  Button,
  Chip,
  CloseIcon,
  List,
  ListButton,
  ListItem,
  Popover,
  PopoverRoot,
  PopoverTrigger,
  SearchField,
  SectionTitle,
} from '@cladd-ui/react'
import { KNOWN_EDITOR_TAGS } from '../ksa/types'

/**
 * Editor-tag combobox for the Part Data dialog: a trigger button opens a Popover
 * with a SearchField over the KSA {@link KNOWN_EDITOR_TAGS}. Removable chips show
 * the current tags. The filter doubles as free-form entry — if the typed text
 * matches no known tag it can still be added verbatim (KSA accepts arbitrary tag
 * strings). Selecting keeps the popover open so several tags can be added in a row.
 */
export function EditorTagsField({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [query, setQuery] = useState('')

  const addTag = (raw: string) => {
    const tag = raw.trim()
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setQuery('')
  }
  const removeTag = (tag: string) => onChange(tags.filter((t) => t !== tag))

  const q = query.trim().toLowerCase()
  const suggestions = KNOWN_EDITOR_TAGS.filter(
    (t) => !tags.includes(t) && (q === '' || t.toLowerCase().includes(q)),
  )
  const showCustom =
    q !== '' &&
    !tags.some((t) => t.toLowerCase() === q) &&
    !KNOWN_EDITOR_TAGS.some((t) => t.toLowerCase() === q)

  return (
    <div className="mt-2 flex flex-col gap-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Chip
              key={tag}
              size="sm"
              as="button"
              clickable
              icon={CloseIcon}
              onClick={() => removeTag(tag)}
              title={`Remove ${tag}`}
            >
              {tag}
            </Chip>
          ))}
        </div>
      )}

      <PopoverRoot onOpenChange={(open) => !open && setQuery('')}>
        <PopoverTrigger>
          <Button size="sm" className="w-full">
            Add tag…
          </Button>
        </PopoverTrigger>
        <Popover className="w-64 rounded-lg" offset={8} position="bottom-start">
          <SectionTitle className="px-4 pt-4">Editor Tags</SectionTitle>
          <SearchField
            size="sm"
            value={query}
            onChange={setQuery}
            placeholder="Filter or add a tag"
            className="mx-2 mt-2 w-auto"
          />
          <List>
            {showCustom && (
              <ListButton size="sm" onClick={() => addTag(query)}>
                Add “{query.trim()}”
              </ListButton>
            )}
            {suggestions.length === 0 && !showCustom ? (
              <ListItem className="text-cladd-fg-softer">No matches</ListItem>
            ) : (
              suggestions.map((t) => (
                <ListButton key={t} size="sm" onClick={() => addTag(t)}>
                  {t}
                </ListButton>
              ))
            )}
          </List>
        </Popover>
      </PopoverRoot>
    </div>
  )
}
