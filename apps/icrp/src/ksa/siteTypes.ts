/** Launch-site and terrain-decal authoring types for ICRP. */

export interface DecalSpec {
  /** `<Radius Value>` — half-size of the square decal footprint, metres (L7). */
  radiusM: number;
  /** Terrain height in metres, exported as kilometres. */
  terrainHeightM: number;
  /** `<SmoothFactor Value>` — edge feather; Core uses 0.69 at every site. */
  smoothFactor: number;
  /** `<Rotation Degrees>` — in-plane decal rotation; Core always 0. */
  rotationDeg: number;
  /** `Biomes` keys — comma list of biome aliases the decal applies to. */
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
   * The exported `<Landmark Key>` — the display name in the launch menu.
   * Unique per body; Core uses spaces and non-ASCII ("Māhia LC-1A").
   */
  landmarkId: string;
  /** The celestial the site lives on (a body Id, e.g. "Earth"). */
  bodyId: string;
  latDeg: number;
  lonDeg: number;
  /** `<StaticObject Ref>` — the `<StaticObject Id>` rendered/collided at the site. */
  staticObjectId: string;
  /** Terrain decal, or null for no flattening (site sits on raw terrain). */
  decal: DecalSpec | null;
}
