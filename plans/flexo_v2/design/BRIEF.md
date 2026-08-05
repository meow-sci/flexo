# flexo v2 UI refactor — user brief (verbatim intent)

The feature set is good, works well, is solid. MUST retain ALL current features. MUST minimize refactors of business features when possible, but allowed if necessary for a better new end state.

flexo has outgrown its original UI decisions. Current problems the v2 design MUST fix:

- Project management features are unclear — too much functionality behind a simple button + text box. Must become a full-featured overlay dialog with project lists, descriptions, part/subpart count metadata, etc.
- Custom meshes and textures are difficult to discover and manage.
- Part data popup is dense and hard to see all the data easily.
- The top floating bar has a confusing feature split between the Add and Settings menus.
- Contextual floating bars (gizmo selection, animation playback, duplicate, etc.) are inconsistent and sometimes overlap.
- The viewport is centered on the whole browser frame while the right sidebar floats over it, making rotations awkward.
- Too many tabs/features overloaded into the right sidebar.
- Animations are incredibly difficult to work with; the UX to build and manage them is very bad. Selecting many subparts and assigning them to joints is difficult — need popups that make it easy to select sets of subparts from layers, or searching; must be flexible (show/hide layers, fuzzy search filter, etc.).

## Required new UI/UX

- A "mode" concept: subpart/mesh mode (placements — THE DEFAULT), animation mode, data mode, etc. The mode changes the rest of the UI to be focused on that mode — less clutter, better focus.
- Top menu bar like a traditional desktop app menubar.
- Right sidebar for contextual details of what the current mode needs.
- Left sidebar for temporary contextual actions/data/items — e.g. click a subpart → its position/size data; select multiple → multi-part transform and actions.
- Bottom status bar:
  - Toast messages land here, overwriting previous ones, with a notification-center popup behind a bell icon showing a count since last read.
  - Temporary status messages for long-running operations.
  - Contextual modifier hints — e.g. holding alt/option while hovering in part mode shows "[⌥ key icon] Duplicate part".
- Right sidebar resizable AND collapsible to the right. Left sidebar resizable AND collapsible to the left.
- Top menubar and status bar very slim: ~0.125rem padding above/below the font size.
- Sidebars dense: padding/margin for separation, but small padding amounts.
- Menus reorganized to be cohesive and aligned with what they do.
- Rich one-off feature sets (like project management) open overlay dialogs.
- Avoid floating action bars in general; where they earn their place (e.g. gizmo quick switcher) they MUST have drag handles, be movable, always on top of everything (even sidebars), but never above/below the top menubar or status bar; screen left/right edges are the horizontal bounds.
- Think like a flexo USER. Must be user friendly. Subpart mode is the default (place + arrange meshes).
- Animation UX rethought to be dramatically easier: work with parts and layers to manage joint membership; capabilities specific to animation mode so moving meshes over the life of animation poses is much simpler, with richer capabilities designed for animation (not just the regular movement gizmos); easier multi-axis movement over the life of a clip; more pivot/anchor options.
- Data mode: focused on both global part data AND subpart-specific data. Right side shows a list of subparts, highlighting ones which support subpart data; ones which don't are shown disabled-style.
