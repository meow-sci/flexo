# Flexo

Flexo is a browser-based Part editor and viewer for the game [Kitten Space Agency](https://ahwoo.com/app/100000/kitten-space-agency)

- uses [three.js](https://threejs.org/) to create a 3D workspace to render the KSA game asset meshes and textures
- bespoke editor UI focused on Part/SubPart editing based on [react-aria](https://react-aria.adobe.com/) 

### Kitten Space Agency Part/SubPart information

KSA is designed with the idea of SubParts and Parts, where SubParts are the actual meshes and textures and Parts are arrangements of SubParts defined with data and serialized to XML.

Parts contain references to SubParts and can reference any number of them and position, rotate and scale them as well as define other types of game related metadata like tank attributes, mass, lighting settings and animation data.

KSA's rendering pipeline has been optimized for mesh and texture [Geometry instancing](https://en.wikipedia.org/wiki/Geometry_instancing) for extremely high performance with SubPart reuse, allowing for the game to remain performant while using thousands of SubParts.

The way KSA is attempting to manifest this is by creating a careful curation of SubPart meshes and textures which are highly reusable to build other Part's out of.

In theory, if executed well, this will allow KSA players to create their own custom Part's out of the built-in catalog of SubPart's without needing any kind of modeling, graphics arts or programming skills - they will simply be using a WYSIWYG 3D editing workspace to arrange SubParts and save them as a Part.

In the futureThis will be possible to do in real-time in-game