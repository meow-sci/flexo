# feature

Kittens are first-class Vehicles in KSA right now, they are not parts.

They cannot be used in vehicle building or attached to Part connectors etc.

In this flexo app, we have figured out where the kitten meshes and textures are and render them in flexo and figured out how the position/rotations are defined (which is different then existing part/subpart data), they are special one-off items in KSA right now.

I would like to be able to reuse the kitten meshes and textures as defined SubPart's and then arrange them as a Part so that we can part-ify them for use in vehicle building in-game.  These would just be kitten meshes, not the actual KittenEva vehicles, and thats fine, it would be a visual thing only, not a functional thing.

Explore if we can define our own kitten SubPart/Part's and add a "Add > Make Kitten Mesh > Hunter / Polaris / Banjo" button for each, and when pressed, adds everything into a new layer e.v. "[Kitten Name] Mesh" with all meshes placed properly.

When the export feature is used, it should serialize the XML as SubPart/Part data to make them behave as regular SubPart/Parts