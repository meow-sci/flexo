# problem

i want to build flexo  

flexo will be a Part editor for the KSA game, but run in a browser

this should have a full screen 3d workspace (maybe built with three.js?  or whatever the best / most appropriate UI library would be)

- use our AGENTS.md info for high-level repo awareness, 
- use the @thirdparty/space-tape/ and @thirdparty/space-tape.lib/ folders as reference for a working in-game KSA game mod for a Part editor that arranges SubPart's into Part's and serializes the output to game XML files on disk (the game must be restarted to pickup new SubPart's defined in XML)
- use the @thirdparty/ksa/ folder as a reference for all KSA game DLLs decompiled C# sources as reference
- use the @thirdparty/ksa/Content/Core/ folder as a reference for the games built-in "Core" mod which has the default set of SubPart, Part's and much more

the existing space-tape KSA game mod is a good reference for the basics of what I want to accomplish in the custom web based part editor

as an initial pass for features i want to cover the basics:

- 3d workspace that renders the game model files (untextured would be acceptable, textured if possible as a stretch goal)
- ui widgets to pick SubPart's to add to th workspace
- 3d workspace controls to move SubParts around (translate, rotate, scale) with both in-3d-space gizmos and input based UIs to enter data manually (should all share the same data, so updating one updates the other live, same backing data)
- export to KSA Part XML (can be to clipboard only for now to get started, or just display the XML data in a popup)


# output

build out a plan into @plans/FLEXO_INITIAL_PLAN.md 

this must be a COMPREHENSIVE plan for implementing the initial flexo project with detailed phases and steps in each phase on what to do

these tasks must have fine unambiguous detail so that future coding agent sessions can utilize it to implement the tasks without any ambiguity with all information they will need to competently accurately and correctly implement the tasks