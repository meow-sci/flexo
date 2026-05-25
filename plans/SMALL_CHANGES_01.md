# small changes

- the camera snaps (top/bottom/left/right/front/back) should ALSO snap the origin to be in the center of the viewport, so that when snapping, it's look directly on that axis
- make the UI state that the end-user effects persistent using @nanostores/persistent to localStorage, use the nanostores skill as reference, such as:
    - the inspector toggle
    - the global settings such as Connector Settings
    - the grid spacing size
- the show/hide inspector icon button has different positioning depending on the mode, it moves a tiny bit.  it should have the same position in both 
modes.
- the inspector area and "placed" subparts list need to be more feature rich
    - change this area to be a single surface
    - each section we need to render (selected item inspector, subpart list) should be a sub-surface
    - the main surface needs to be horizontally resizable.  we'll need a drag handle when we hover the left edge that allows for a resize.  when resized, it should change the horizontal size to match the mouse drag.  save this in a nanostores
- make the subpart list and connectors be above the dynamically shown/hidden inspector (show below), make the subpart / connector list have a overflow scroll so that the inspector panel renders its natural full height since that is the main focus when active
