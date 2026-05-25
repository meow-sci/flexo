# problem

the game has connectors which in the space-tape.lib/ KSA mod we rendered as a simple untextured box with a vector arrow pointing out of it to indicate the direction that the connector is facing (the arrow was like an arrow from a position gizmo arrow)

we need the same thing in flexo

- render the connector as a cube that is 0.25 m on all sides
- add a "+ Connector" button to the main surface, when pressed, add a connector at the origin
- allow the connector to be selected, select it by default
- when a connector is selected, show a inspector surface above the "PLACED" surface (same area as the other details inspector for SubParts)
- allow the connector to have its position, scale and rotation changed
- render an arrow like one from a position gizmo to show the direction the connector is facing, it should be sticking out of the size of the cube that it's facing, and be 0.5 m long
- add a global settings button on the main surface, put a cog icon button on the right as the last button which opens a full screen Popup
    - add a "Connectors Settings" section with the settings so the user can change them :
        - connector size (0.25 m)
        - connector arrow size (0.5m)
- serialize this to the exported XML properly with position, scale, rotation, and flags (see the existing part XMLs for references)
    - the <Transform> with position, scale and rotation is part of the <Part> XML
    - the <Flags> is set on the <PartGameData> XML
- requires fixing our export to have a tabbed interface which shows Part XML and GameData XML as separate things


# example XMLs

```xml
<PartGameData Id="CorePropulsionB_Prefab_RCSASmallC">
    <EditorTag Value="RCS" />
    <SolidSphereMass>
        <Mass Kg="5" />
        <Radius M=".1" />
    </SolidSphereMass>
    <Connector Id="_connector14">
        <Flags>ToSurface</Flags>
    </Connector>
</PartGameData>

<PartGameData Id="CoreStructuralA_Prefab_RadialDecouplerLargeA">
    <EditorTag Value="Structural" />
    <Connector Id="_connector28">
        <Flags>ToSurface</Flags>
    </Connector>
    <Connector Id="_connector29">
        <Flags>FromSurface</Flags>
    </Connector>
</PartGameData>

<Part Id="CoreFuelTankA_Prefab_LF2W2HA">
    <EditorTag Value="Fuel Tanks"/>
    <SubPart Id="CoreFuelTankA_Subpart_EndcapLF2WA" InstanceOf="CoreFuelTankA_Subpart_EndcapLF2WA">
        <Transform>
            <Position X="0.85200"/>
        </Transform>
    </SubPart>
    <SubPart Id="CoreFuelTankA_Subpart_Skin2W2HA" InstanceOf="CoreFuelTankA_Subpart_Skin2W2HA">
    </SubPart>
    <Connector Id="_connector21">
        <Transform>
            <Position X="1.00000"/>
            <Scale X="2.00000" Y="2.00000" Z="2.00000"/>
        </Transform>
    </Connector>
    <SubPart Id="CoreFuelTankA_Subpart_EndcapLF2WA3" InstanceOf="CoreFuelTankA_Subpart_EndcapLF2WA">
        <Transform>
            <Position X="-0.85200"/>
            <Rotation X="3.14159" Z="3.14159"/>
        </Transform>
    </SubPart>
    <Connector Id="_connector22">
        <Transform>
            <Position X="-1.00000"/>
            <Rotation X="3.14159" Z="3.14159"/>
            <Scale X="2.00000" Y="2.00000" Z="2.00000"/>
        </Transform>
    </Connector>
    <Connector Id="_connector45">
        <Transform>
            <Position X="0.91792"/>
        </Transform>
    </Connector>
    <Connector Id="_connector46">
        <Transform>
            <Position X="-0.91790"/>
            <Rotation X="3.14159" Z="3.14159"/>
        </Transform>
    </Connector>
</Part>

<PartGameData Id="CoreFuelTankA_Prefab_LF2W1HB">
    <EditorTag Value="Tanks"/>
    <Connector Id="_connector43">
        <Flags>Internal</Flags>
    </Connector>
    <Connector Id="_connector44">
        <Flags>Internal</Flags>
    </Connector>
</PartGameData>

```

# followups

- change the connector mesh from its current cube + directional arrow
    - remove the directional arrow
    - change the mesh to be a square (what is there now) and a cone pointing in the direction it faces instead of the directional arrow.  the cone should have a diameter that matches the cube size width setting, and length that is 1.5x that
- there is some kind of odd UI bug where when a connector is selected, clicking on blank space in the editor is NOT deselecting it like what happens with SubPart selections.  it should behave like SubPart meshes, if you click outside, it should be deselected.  it should only become selected if its mesh is directly selected or it's selected in the side bar