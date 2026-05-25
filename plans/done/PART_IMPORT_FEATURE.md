# problem

i want a feature similar to our existing space-tape.lib/ mod which allows the end-user to import exisitng Part's.

what this means is:

- a new "+ Part" button the top level surface which opens a Popup which lets the end-user search a list of Part's and have a split preview (simlar to our add SubPart popup now)
- the popup will have a "Add Part to Project" button that is enabled when there is a Part selected
- if possible show some details about the part in a panel below the preview with pertinent info like number of subparts, a list of subparts, etc.  any other meta we might be able to trivially derive from the data we have available.  be sure to lay this out to make it user friendly.
- when the Part is added it should just add all the SubParts to our project with the same position/rotation/scale as the original Part, such that afterwards its just a bunch of pre-placed parts in the current project
