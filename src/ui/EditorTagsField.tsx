import { useState } from 'react';
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
} from './kit';
import { EDITOR_TAG_DEFS, KNOWN_EDITOR_TAGS } from '../ksa/types';

/** Tag id → `NotaCategory` flag (true ⇒ a functional tag, not a part-picker category). */
const TAG_IS_FUNCTIONAL = new Map(EDITOR_TAG_DEFS.map((d) => [d.id, d.notaCategory]));

/**
 * Editor-tag combobox for the Part Data dialog: removable tag chips plus a
 * popover with a search field over the KSA {@link KNOWN_EDITOR_TAGS}. The filter
 * doubles as free-form entry — text matching no known tag can still be added
 * verbatim. Selecting keeps the popover open so several tags can be added in a row.
 *
 * Suggestions are split into "Categories" (the part-picker buttons) and "Functional"
 * tags (face-snap / diameter-filter / visibility behavior), mirroring the game's
 * `<EditorTagDef NotaCategory>` registry flag (see {@link EDITOR_TAG_DEFS}).
 */
export function EditorTagsField({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [query, setQuery] = useState('');

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setQuery('');
  };
  const removeTags = (keys: Set<React.Key>) => onChange(tags.filter((t) => !keys.has(t)));

  const q = query.trim().toLowerCase();
  const suggestions = KNOWN_EDITOR_TAGS.filter(
    (t) => !tags.includes(t) && (q === '' || t.toLowerCase().includes(q)),
  );
  const categoryTags = suggestions.filter((t) => !TAG_IS_FUNCTIONAL.get(t));
  const functionalTags = suggestions.filter((t) => TAG_IS_FUNCTIONAL.get(t));
  const showCustom =
    q !== '' &&
    !tags.some((t) => t.toLowerCase() === q) &&
    !KNOWN_EDITOR_TAGS.some((t) => t.toLowerCase() === q);

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
                <Button
                  size="sm"
                  variant="ghost"
                  className="justify-start"
                  onPress={() => addTag(query)}
                >
                  Add “{query.trim()}”
                </Button>
              )}
              {suggestions.length === 0 && !showCustom && (
                <span className="px-2 py-1.5 text-sm text-fg-subtle">No matches</span>
              )}
              {categoryTags.length > 0 && (
                <SectionTitle className="px-1 pt-1 text-fg-subtle">Categories</SectionTitle>
              )}
              {categoryTags.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant="ghost"
                  className="justify-start"
                  onPress={() => addTag(t)}
                >
                  {t}
                </Button>
              ))}
              {functionalTags.length > 0 && (
                <SectionTitle className="px-1 pt-1 text-fg-subtle">Functional</SectionTitle>
              )}
              {functionalTags.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant="ghost"
                  className="justify-start"
                  onPress={() => addTag(t)}
                >
                  {t}
                </Button>
              ))}
            </div>
          </PopoverDialog>
        </Popover>
      </DialogTrigger>
    </div>
  );
}
