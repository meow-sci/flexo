import { useState } from 'react'
import {
  DialogTrigger,
  Popover,
  PopoverDialog,
  Button,
  SearchField,
  SectionTitle,
  TagGroup,
  TagList,
  Tag,
} from './kit'
import { KNOWN_EDITOR_TAGS } from '../ksa/types'

/**
 * Editor-tag combobox for the Part Data dialog: removable tag chips plus a
 * popover with a search field over the KSA {@link KNOWN_EDITOR_TAGS}. The filter
 * doubles as free-form entry — text matching no known tag can still be added
 * verbatim. Selecting keeps the popover open so several tags can be added in a row.
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
  const removeTags = (keys: Set<React.Key>) =>
    onChange(tags.filter((t) => !keys.has(t)))

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
        <TagGroup aria-label="Editor tags" onRemove={removeTags}>
          <TagList items={tags.map((id) => ({ id }))}>
            {(item) => <Tag id={item.id}>{item.id}</Tag>}
          </TagList>
        </TagGroup>
      )}

      <DialogTrigger onOpenChange={(open) => !open && setQuery('')}>
        <Button size="sm" className="w-full">
          Add tag…
        </Button>
        <Popover placement="bottom start" className="w-64">
          <PopoverDialog className="flex flex-col gap-2 p-2">
            <SectionTitle className="px-1">Editor Tags</SectionTitle>
            <SearchField
              size="sm"
              aria-label="Filter or add a tag"
              value={query}
              onChange={setQuery}
              placeholder="Filter or add a tag"
            />
            <div className="flex max-h-60 flex-col gap-0.5 overflow-auto">
              {showCustom && (
                <Button size="sm" variant="ghost" className="justify-start" onPress={() => addTag(query)}>
                  Add “{query.trim()}”
                </Button>
              )}
              {suggestions.length === 0 && !showCustom ? (
                <span className="px-2 py-1.5 text-sm text-fg-subtle">No matches</span>
              ) : (
                suggestions.map((t) => (
                  <Button key={t} size="sm" variant="ghost" className="justify-start" onPress={() => addTag(t)}>
                    {t}
                  </Button>
                ))
              )}
            </div>
          </PopoverDialog>
        </Popover>
      </DialogTrigger>
    </div>
  )
}
