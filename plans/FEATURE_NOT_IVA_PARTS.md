# problem

there is a set of SubPart's for "IVA" mode in KSA which is a code name used for parts rendered
for the interior of spacecraft.

in XML they are `<SubPart>` XML nodes with `<Internal>true</Internal>` set under its `<PartModel>`, for example:

```xml
<SubPart Id="CoreIVAPropA_Subpart_ChairA">
    <PartModel Id="CoreIVAPropA_Subpart_ChairA_Model">
        <Internal>true</Internal>
        <Mesh Id="CoreIVAPropA_Subpart_ChairA" />
        <Material Id="CoreIVAPropA_Material" />
        <RayTracing>Enabled</RayTracing>
    </PartModel>
</SubPart>
```

these are treated specially in KSA where the camera must be in "IVA" mode (to view interiors) to render and have ray tracing enabled.

the issue is they DO NOT render otherwise, and i want to fix that.

i want to redefine any SubPart that has Internal true and suffix "_NotIVA" at the end, so the above snippet
would become something like this:

```xml
<SubPart Id="CoreIVAPropA_Subpart_ChairA_NotIVA">
    <PartModel Id="CoreIVAPropA_Subpart_ChairA_Model">
        <Internal>true</Internal>
        <Mesh Id="CoreIVAPropA_Subpart_ChairA" />
        <Material Id="CoreIVAPropA_Material" />
        <RayTracing>Enabled</RayTracing>
    </PartModel>
</SubPart>
```

i want these to be treated as first-class meshes in flexo just like any other, and when we generate the mod export XML we create a project-specific variant of the SubPart with a unique Id so that there are no collisions between flexo part mods that might use reuse the same IVA based part. 

there is very little overhead/cost since this is just data and reusing the PartModel with the mesh, so defining a new SubPart for each IVA part on export for each project is fine for simplicity.

Note that we should OMIT the `<Internal>` AND `<RayTracing>` XML nodes on our new variants we export