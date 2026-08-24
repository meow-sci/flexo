/**
 * ICRP launch-site domain types (plans/ICRP_PLAN.md P7.02/P7.03).
 *
 * A `Site` becomes, inside the exported `<System>` scenario's inline body
 * (systemXml.ts):
 *  - a `<Landmark Id IsLaunchPad="true" StaticObject>` location row
 *    (`decomp/KSA/LandmarkReference.cs` + `LocationReference.cs`), and
 *  - optionally a `<Modifier Type="Decal">` terrain flattener
 *    (`decomp/KSA/DecalModifierReference.cs`), built by landmarkXml.ts.
 */

/**
 * The terrain-flattening decal under a site (plan P7.03; schema
 * `decomp/KSA/DecalModifierReference.cs:11-37`, golden shape
 * Core Astronomicals.xml:752-768).
 */
export interface DecalSpec {
  /** `<Radius Value>` — half-size of the square decal footprint, metres (L7). */
  radiusM: number;
  /**
   * `<AltitudeOffset Km>` — the local terrain height the pad is flattened TO.
   * METRES despite the attribute name (plan fact L7): the game's height buffer
   * is metres, so Core writes `Km="225"` for Vandenberg's 225 m mesa.
   */
  terrainHeightM: number;
  /** `<SmoothFactor Value>` — edge feather; Core uses 0.69 at every site. */
  smoothFactor: number;
  /** `<Rotation Degrees>` — in-plane decal rotation; Core always 0. */
  rotationDeg: number;
  /** `Biomes=` attribute — comma list of biome aliases the decal applies to. */
  biomes: string;
}

/** Core's launch-site decal defaults (Astronomicals.xml:733-824; radius mid-range). */
export function defaultDecal(): DecalSpec {
  return {
    radiusM: 300,
    terrainHeightM: 0,
    smoothFactor: 0.69,
    rotationDeg: 0,
    biomes: 'Grass,Beach',
  };
}

/** One ICRP launch site (plan P7.02). */
export interface Site {
  /** Editor id (never exported). */
  id: string;
  /**
   * The exported `<Landmark Id>` — the display name in the launch menu.
   * Unique per body; Core uses spaces and non-ASCII ("Māhia LC-1A").
   */
  landmarkId: string;
  /** The celestial the site lives on (a body Id, e.g. "Earth"). */
  bodyId: string;
  latDeg: number;
  lonDeg: number;
  /** `StaticObject=` — the `<StaticObject Id>` rendered/collided at the site. */
  staticObjectId: string;
  /** Terrain decal, or null for no flattening (site sits on raw terrain). */
  decal: DecalSpec | null;
}
