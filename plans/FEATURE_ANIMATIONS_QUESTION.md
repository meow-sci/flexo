# feature to explore 

## background

KSA has a built-in animation system that is complex.  

it requires data embedded in glb files, defined in the asset XML files and potentially supporting in-game code to make it work.

I had previously had an analysis of the animation system done and can be found in @plans/analysis/ANIMATION_SYSTEM_ANALYSIS.md

The game has also had updates since then, the latest KSA decompiled sources are available at @thirdparty/ksa/ and the built-in Core mod with built-in assets defined in XML, glbs etc is available at @thirdparty/ksa/Content/Core/

The built-in Parts which have animations are:

- CoreElectricalA_Prefab_LightSmallA
- CoreElectricalA_Prefab_LightSmallB
- CoreElectricalA_Prefab_SolarPanelB
- CoreLandingA_Prefab_MediumLandingLegA

I believe the data is associated with Part's (not SubParts) via PartGameData XML nodes, for example

```xml
<PartGameData Id="CoreLandingA_Prefab_MediumLandingLegA">
    <EditorTag Value="Landing" />
    <KeyframeAnimationModule Id="LandingLegAnimation" ShowDeployRetract="true">
        <KeyframeAnimation Path="Animations/CoreLandingA_Prefab_MediumLandingLegA_Anim.glb" Id="CoreLandingA_Prefab_MediumLandingLegA_Anim" />
    </KeyframeAnimationModule>
</PartGameData>
```

Note that some of the `<KeyframeAnimationModule>` nodes have a `ShowDeployRetract` XML attribute which will make a button available in-game to trigger the animation, and some do not have this like:

```xml
<KeyframeAnimationModule Id="CoreElectricalA_Prefab_LightSmallA_Anim">
    <KeyframeAnimation Path="Animations/CoreElectricalA_Prefab_LightSmallA_Anim.glb" Id="CoreElectricalA_Prefab_LightSmallA_Anim" />
</KeyframeAnimationModule>
```

In-game the light part popup details window has a "Actuate" drag float slider that goes from 0-1 and when it changes it triggers the animation to run to that part of the animation (e.g. 0-100% of the animation), letting the end-user effectively position the rotation of the light part by choosing the percentage and an animation plays to move it to that location.  I don't see how this is defined in XML at all, might need to research it in the decompiled game code

## what i want

Given this, I would like to make it possible to either:

- preferably define custom animations in flexo that DONT require any game code changes that can be provided solely by XML and glb data (flexo's remit is to try and not require modifying the KSA game code and using the built-in asset-only mod capabilities)
- if we need game code changes, that is possible, but i'd like to make a generic code based mod that would enable any animations we build in flexo to be supported

do a deep dive of the built-in parts, their animation and the decompiled sources to determine if it is practical to implement custom animations in flexo

as a concrete example, something I would like to do is be able to make a "walking" rover with jointed legs like spider legs

or have a cylindrical rocket bay with doors that open

or have a chair that can spin

do a very deep dive and make a detailed plan and write it to @plans/FEATURE_ANIMATIONS_PLAN.md to be implemented later
