# feature

need a project export that will export all project level data that covers all the project workspace stuff like

- meshes
- layers
- animations

all their positions, etc.

for phase 1 lets disable export if the project has custom assets uploaded and keep this a data only JSON export

it will also need an import which lets you paste in a project XML and it will take the provided project JSON and add all of it's content to the workspace

i want the import to let it be additive to the current workspace

it should add new layers for all meshes added (and reuse the built-in connectors and kittens layers as per usual)