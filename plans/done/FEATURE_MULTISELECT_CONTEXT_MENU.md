when multiple parts or connectors are selected, add a new floating toolbar beneath the move/rotate/scale/duplicate/delete one

this toolbar is for multi-select specific features

for now add a "Change Layer" button which when clicked is a popover with the list of layers and when clicking one moves them to that layer.  this should also change the layer to the picked layer and retain the selection after switching if possible.

do this with a clean design and architecture, i know this kind of data management can be hard in a ui react space so do it in a well designed clean manner that will be repeatable for other patterns in the future

also add a "Delete All (N)" button to this toolbar where N is the subpart count, when clicked show a confirm dialog, and when confirmed delete all the selected subparts/connectors.  After deletion the selection should be cleared.

