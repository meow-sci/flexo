# feature

this is a big feature. it will require a major deep dive and thorough exhaustive plan to be comprehensive and effect everything.

we already have a undo/redo stack, which is great.

however, i want the editing experience to be "project" based, and this should encompass all the ephemeral data of the current work space, such as:

- add a new "project name" input which names this project so we can have a project manager with multiple projects
- part data (part id, editor tags)
- the working set of subparts
- the working set of connectors
- the working set of layers, visibility settings, lock settings etc on layers
- NOT camera location/position, this can be ephemeral data only
- the undo/redo stack
- any other "project" level working set data i may not be thinking of

i want this data to be serialized to localStorage every time it updates (probably same update granularity as when we make undo/redo stack updates?  just guessing)

when the web page loads, it should auto load the "current" project so it restores what we were working on.  the camera would be reset in this scenario.

do this intelligently so all data needed is pre-computed before rendering the react app so that we dont have multiple visual refreshes.

the localStorage should have some kind of convention of project data storage so that we can have multiple projects.  probably a convention based local storage key like "project.[name]", pick something sensible.

have another local storage key like "current.project" which has a json data structure which has the current project name (so on page load we can look for this, find the project name, then load the project from the local storage entry for that project)

add a top-level toolbar "project" button which shows a popover which lets the end-user select a "load project" button which shows a dialog which lets them pick from the list of saved projects, and when selecting, load that project into the workspace

this should be a comprehensive change that encompasses all project data, be thorough and accurate