# problem

- the main center surface currently has a "Grid" and "Rot" widget that I think don't do anything at all, these can be removed
- move the "move"/"rotate"/"scale" gizmo selectors into their own floating centered surface below the main one which only appears when a subpart is selected.  this surface can contain buttons and actions specific to the selected subpart.
- on the main surface, add a "View" button which does a Popover which has the following controls:
    - Camera Snap (when these buttons are pressed snap the camera to these orientations, keep camera zoom level same)
        - left / right
        - front / back
        - top / bottom
    - Grids (these should be checkboxes for each X/Y/Z to enable a grid. the spacing number is in meters and should render a grid on that plane with that spacing)
        - X [checkbox] [spacing number input]
        - Y [checkbox] [spacing number input]
        - Z [checkbox] [spacing number input]

