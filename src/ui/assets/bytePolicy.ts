/**
 * **The deletion & byte policy** (design: design-surface-assets.md D3 + §5.1/§5.2;
 * foundation §14.3 tier 3 "always confirm, with the irreversibility stated explicitly").
 *
 * flexo's asset binaries live in IndexedDB, OUTSIDE the undoable document: every delete or
 * overwrite drops the bytes immediately, and undo brings back only the descriptor. v1 said
 * so for import removal and stayed silent for plain textures (census pain #10) — so a user
 * who deleted a texture and pressed ⌘Z got the row back and untextured faces.
 *
 * These are the ONLY spellings of that sentence in the app. Every byte-backed confirm
 * imports {@link BYTE_DELETE_WARNING} (import removal also appends
 * {@link IMPORT_REMOVAL_APPENDIX}); a second literal would be a second contract.
 *
 * The confirm matrix these strings serve (§5.1), implemented by the Asset Manager and the
 * Surface sidebar:
 *
 * | Action                  | Confirm                                                    |
 * |-------------------------|------------------------------------------------------------|
 * | Delete texture          | ALWAYS — usage counts + the warning                        |
 * | Replace texture image   | ALWAYS — {@link REPLACE_IMAGE_WARNING}                     |
 * | Remove import           | ALWAYS — full inventory + warning + appendix               |
 * | Delete all unused       | ALWAYS — every item named + the warning                    |
 * | Delete material         | >0 uses → inline strip with the count; else none + `[Undo]` |
 * | Delete mesh             | >5 placements → confirm with counts; else none + `[Undo]`   |
 */

/** The one byte-loss sentence, used by every byte-backed confirm (design §5.2, verbatim). */
export const BYTE_DELETE_WARNING =
  'This deletes the stored file bytes from this browser. Undo restores the entry, not ' +
  'the bytes — anything using it will render untextured until re-uploaded.';

/** Appended for an import batch: its geometry has no regenerable source (design §5.2). */
export const IMPORT_REMOVAL_APPENDIX =
  'Imported geometry has no other copy and cannot be recreated.';

/** Overwrite-in-place wording (design §2.2 "Replace image…", tier 3). */
export const REPLACE_IMAGE_WARNING =
  'Replaces the stored image bytes. Undo cannot restore the old image.';

/**
 * The no-confirm threshold for an undoable, descriptor-only delete (foundation §14.3:
 * "≤5 entities → no confirm; status flash with an inline [Undo]").
 */
export const CONFIRM_FREE_PLACEMENTS = 5;
