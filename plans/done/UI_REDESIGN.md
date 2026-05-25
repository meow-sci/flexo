# problem

I want the UI to have minimal elements visible depending on the current context.

- the top center surface should contain buttons which open popovers or dialogs for functionality like adding a subpart, so that we minimize how much UI is displayed by default
- right now the subpart list to add subparts has issues: it's very long (and always will be), in both the number of entries AND the names, so we will change it
    - add a "+ SubPart" button to the main surface buttons which opens the new Popup
    - change to a Popup so it can have more rich functionality
    - i want a side-by-side split view where there is a list of subparts that can be searched and selected (selection SHOULD NOT automatically add the subpart to the project)
    - when selected, the right-side should be a three.js render of the subpart that can be rotated and zoomed like the main viewport, but, limit it to this functiaonlity only as a preview of the subpart
    - when selected, enable a button to "Add SubPart to Project" which is disabled by default. adding the subpart SHOULD NOT auto close the dialog, so the end-user can quickly add multiple sub parts.
    - a cancel/close button to dismiss the dialog
- change the  "PART" surface with the part id input into it's own "Part Data" button on the main surface which opens a Popup with the part id field.  in the future we will add more data here, for now thats it.

