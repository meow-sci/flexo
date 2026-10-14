/**
 * Editable mass shapes authored by Core @ 2026.10.10.5554. Their dimensions and
 * volumes follow KSA's *MassTemplate classes and MassGeometry.cs. This model
 * describes explicit mass definitions, not a part's tank walls or stored fuel.
 */
import type { EditingPart, EulerXYZ, RawXmlNode, Vec3 } from './types';

export const MASS_SHAPES = [
  'CustomMass',
  'SolidCuboidMass',
  'SolidSphereMass',
  'SolidCylinderMass',
  'HollowOpenCylinderMass',
  'HollowOpenTruncatedConeMass',
  'HollowOpenSemiEllipsoidMass',
  'HollowOpenOgiveMass',
] as const;

export type MassShape = (typeof MASS_SHAPES)[number];

export const MASS_DIMENSIONS = [
  'lengthXM',
  'lengthYM',
  'lengthZM',
  'lengthM',
  'radiusM',
  'outerRadiusM',
  'wallThicknessM',
  'heightM',
  'radiusBaseM',
  'radiusTopM',
] as const;

export type MassDimension = (typeof MASS_DIMENSIONS)[number];

export interface MassSpecificInertia {
  ixx: number;
  iyy: number;
  izz: number;
}

export interface MassDefinition {
  /** Editor identity, never serialized as a KSA attribute. */
  id: string;
  shape: MassShape;
  /** These can coexist in XML; geometric masses resolve Material > Density > Mass. */
  massKg: number | null;
  densityKgM3: number | null;
  materialId: string | null;
  /** Every authored dimension is stored in metres. */
  dimensions: Partial<Record<MassDimension, number>>;
  /** A missing Sweep means one full turn; stored radians match RadianReference. */
  sweepRad: number | null;
  locationAsmb: Vec3;
  paf2Asmb: EulerXYZ;
  /** CustomMass only: KSA's InertiaTemplate contains the three principal moments. */
  massSpecificInertia: MassSpecificInertia | null;
  unknownAttrs: Record<string, string>;
  unknownChildren: RawXmlNode[];
}

export interface MassDimensionField {
  key: MassDimension;
  xmlTag: string;
  label: string;
  defaultM: number;
}

interface MassShapeDefinition {
  label: string;
  dimensions: readonly MassDimensionField[];
  revolved: boolean;
}

const LENGTH: MassDimensionField = {
  key: 'lengthM',
  xmlTag: 'Length',
  label: 'Length',
  defaultM: 1,
};
const RADIUS: MassDimensionField = {
  key: 'radiusM',
  xmlTag: 'Radius',
  label: 'Radius',
  defaultM: 0.5,
};
const HEIGHT: MassDimensionField = {
  key: 'heightM',
  xmlTag: 'Height',
  label: 'Height',
  defaultM: 1,
};
const WALL: MassDimensionField = {
  key: 'wallThicknessM',
  xmlTag: 'WallThickness',
  label: 'Wall thickness',
  defaultM: 0.006,
};

export const MASS_SHAPE_DEFS: Record<MassShape, MassShapeDefinition> = {
  CustomMass: { label: 'Custom mass', dimensions: [], revolved: false },
  SolidCuboidMass: {
    label: 'Solid cuboid',
    dimensions: [
      { key: 'lengthXM', xmlTag: 'LengthX', label: 'Length X', defaultM: 1 },
      { key: 'lengthYM', xmlTag: 'LengthY', label: 'Length Y', defaultM: 1 },
      { key: 'lengthZM', xmlTag: 'LengthZ', label: 'Length Z', defaultM: 1 },
    ],
    revolved: false,
  },
  SolidSphereMass: { label: 'Solid sphere', dimensions: [RADIUS], revolved: true },
  SolidCylinderMass: {
    label: 'Solid cylinder',
    dimensions: [LENGTH, RADIUS],
    revolved: true,
  },
  HollowOpenCylinderMass: {
    label: 'Open hollow cylinder',
    dimensions: [
      LENGTH,
      { key: 'outerRadiusM', xmlTag: 'OuterRadius', label: 'Outer radius', defaultM: 0.5 },
      WALL,
    ],
    revolved: true,
  },
  HollowOpenTruncatedConeMass: {
    label: 'Open hollow truncated cone',
    dimensions: [
      HEIGHT,
      { key: 'radiusBaseM', xmlTag: 'RadiusBase', label: 'Base radius', defaultM: 0.5 },
      { key: 'radiusTopM', xmlTag: 'RadiusTop', label: 'Top radius', defaultM: 0.25 },
      WALL,
    ],
    revolved: true,
  },
  HollowOpenSemiEllipsoidMass: {
    label: 'Open hollow semi-ellipsoid',
    dimensions: [LENGTH, RADIUS, WALL],
    revolved: true,
  },
  HollowOpenOgiveMass: {
    label: 'Open hollow ogive',
    dimensions: [HEIGHT, RADIUS, WALL],
    revolved: true,
  },
};

/** A valid authoring starting point with an explicit 1 kg mass. */
export function createMassDefinition(shape: MassShape, id: string): MassDefinition {
  return {
    id,
    shape,
    massKg: 1,
    densityKgM3: null,
    materialId: null,
    dimensions: Object.fromEntries(
      MASS_SHAPE_DEFS[shape].dimensions.map((field) => [field.key, field.defaultM]),
    ),
    sweepRad: null,
    locationAsmb: { x: 0, y: 0, z: 0 },
    paf2Asmb: { x: 0, y: 0, z: 0 },
    massSpecificInertia: shape === 'CustomMass' ? { ixx: 1, iyy: 1, izz: 1 } : null,
    unknownAttrs: {},
    unknownChildren: [],
  };
}

const FULL_TURN = 2 * Math.PI;
const GEOMETRY_EPSILON = 1.1920929e-7;

/** MassGeometry's zero-volume threshold also applies when subtracting inner shells. */
function shellVolume(outer: number, inner: number): number {
  const volume = outer - inner;
  return Math.abs(volume) <= GEOMETRY_EPSILON ? 0 : volume;
}

function cylinderVolume(length: number, radius: number, sweep: number): number {
  return 0.5 * sweep * Math.max(radius, 0) ** 2 * Math.max(length, 0);
}

function truncatedConeVolume(
  height: number,
  radiusBase: number,
  radiusTop: number,
  sweep: number,
): number {
  radiusTop = Math.max(radiusTop, 0);
  radiusBase = Math.max(radiusBase, radiusTop);
  height = Math.max(height, 0);
  return (0.5 * sweep * height * (radiusBase ** 2 + radiusBase * radiusTop + radiusTop ** 2)) / 3;
}

function semiEllipsoidVolume(height: number, radius: number, sweep: number): number {
  return (sweep * Math.max(radius, 0) ** 2 * Math.max(height, 0)) / 3;
}

/** The profile integral in MassGeometry.ComputeSolidOgive, limited to its volume. */
function ogiveVolume(height: number, radius: number, sweep: number): number {
  radius = Math.max(radius, 0);
  height = Math.max(height, radius);
  const arcRadius = radius > 0 ? (radius * radius + height * height) / (2 * radius) : 0;
  const arcOffset = arcRadius - radius;
  const arcRadiusSq = arcRadius * arcRadius;
  const arcOffsetSq = arcOffset * arcOffset;
  const angle = arcRadius > 0 ? Math.asin(Math.min(height / arcRadius, 1)) : 0;
  const radiusIntegral = (height * arcOffset + arcRadiusSq * angle) / 2;
  const radiusSquaredIntegral =
    arcRadiusSq * height - height ** 3 / 3 + arcOffsetSq * height - 2 * arcOffset * radiusIntegral;
  return radiusSquaredIntegral <= 0 ? 0 : 0.5 * sweep * radiusSquaredIntegral;
}

/** Port of the volume terms of KSA MassGeometry, including its shell clamping. */
export function massDefinitionVolumeM3(definition: MassDefinition): number {
  const d = (key: MassDimension): number => definition.dimensions[key] ?? Number.NaN;
  const sweep = Math.min(FULL_TURN, Math.max(0, definition.sweepRad ?? FULL_TURN));
  switch (definition.shape) {
    case 'CustomMass':
      return 0;
    case 'SolidCuboidMass':
      return Math.max(d('lengthXM'), 0) * Math.max(d('lengthYM'), 0) * Math.max(d('lengthZM'), 0);
    case 'SolidSphereMass':
      return (2 * sweep * Math.max(d('radiusM'), 0) ** 3) / 3;
    case 'SolidCylinderMass':
      return cylinderVolume(d('lengthM'), d('radiusM'), sweep);
    case 'HollowOpenCylinderMass': {
      const radius = Math.max(d('outerRadiusM'), 0);
      const innerRadius = radius - Math.min(radius, Math.max(d('wallThicknessM'), 0));
      return shellVolume(
        cylinderVolume(d('lengthM'), radius, sweep),
        cylinderVolume(d('lengthM'), innerRadius, sweep),
      );
    }
    case 'HollowOpenTruncatedConeMass': {
      const wall = Math.max(d('wallThicknessM'), 0);
      const height = Math.max(d('heightM'), 0);
      const radiusTop = Math.max(d('radiusTopM'), 0);
      const radiusBase = Math.max(d('radiusBaseM'), radiusTop);
      const slope = radiusBase - radiusTop;
      const offset =
        height > 0 ? (wall * Math.sqrt(height * height + slope * slope)) / height : wall;
      const outerTop = Math.max(radiusTop, offset);
      const outerBase = Math.max(radiusBase, outerTop);
      return shellVolume(
        truncatedConeVolume(height, outerBase, outerTop, sweep),
        truncatedConeVolume(height, outerBase - offset, outerTop - offset, sweep),
      );
    }
    case 'HollowOpenSemiEllipsoidMass': {
      const wall = Math.max(d('wallThicknessM'), 0);
      const height = Math.max(d('lengthM'), 0);
      const radius = Math.max(d('radiusM'), 0);
      const surfaceArea =
        FULL_TURN *
        ((Math.pow(radius * radius, 1.6075) + 2 * Math.pow(radius * height, 1.6075)) / 3) **
          0.622084;
      const offsetSurfaceArea = (FULL_TURN / 3) * (radius * radius + 2 * radius * height);
      const offset = offsetSurfaceArea > 0 ? (wall * surfaceArea) / offsetSurfaceArea : wall;
      const outerHeight = Math.max(height, offset);
      const outerRadius = Math.max(radius, offset);
      return shellVolume(
        semiEllipsoidVolume(outerHeight, outerRadius, sweep),
        semiEllipsoidVolume(outerHeight - offset, outerRadius - offset, sweep),
      );
    }
    case 'HollowOpenOgiveMass': {
      const wall = Math.max(d('wallThicknessM'), 0);
      const radius = Math.max(d('radiusM'), wall);
      const height = Math.max(d('heightM'), radius);
      const arcRadius = (radius * radius + height * height) / (2 * radius);
      const arcOffset = arcRadius - radius;
      const innerArcRadius = Math.max(arcRadius - wall, arcOffset);
      const innerRadius = innerArcRadius - arcOffset;
      const innerHeight = Math.sqrt(innerArcRadius * innerArcRadius - arcOffset * arcOffset);
      return shellVolume(
        ogiveVolume(height, radius, sweep),
        ogiveVolume(innerHeight, innerRadius, sweep),
      );
    }
  }
}

/** Unknown materials stay unresolved; KSA never falls back from an authored Material. */
export function resolveMassDefinitionKg(
  definition: MassDefinition,
  materialDensities: ReadonlyMap<string, number>,
): number | null {
  if (definition.shape === 'CustomMass') {
    return definition.massKg != null && Number.isFinite(definition.massKg) && definition.massKg > 0
      ? definition.massKg
      : null;
  }
  const volume = massDefinitionVolumeM3(definition);
  if (!Number.isFinite(volume)) return null;
  let mass: number;
  if (definition.materialId) {
    const density = materialDensities.get(definition.materialId);
    if (density == null) return null;
    mass = density * volume;
  } else if (definition.densityKgM3 != null && definition.densityKgM3 > 0) {
    mass = definition.densityKgM3 * volume;
  } else if (definition.massKg != null && definition.massKg > 0) {
    mass = definition.massKg;
  } else {
    return null;
  }
  return Number.isFinite(mass) ? mass : null;
}

export interface MassDefinitionIssue {
  code: string;
  severity: 'block' | 'warn';
  message: string;
}

/** Advisory checks shared by Data mode and export for authored shape data. */
export function massDefinitionIssues(
  definition: MassDefinition,
  materialDensities: ReadonlyMap<string, number>,
): MassDefinitionIssue[] {
  const issues: MassDefinitionIssue[] = [];
  const shape = MASS_SHAPE_DEFS[definition.shape];
  // AsmbVolumetricMassTemplate.GetMassFromVolume: Material wins, then valid Density,
  // then valid Mass. CustomMassTemplate.GetMassPropertiesPaf always uses Mass.
  const positiveMass =
    definition.massKg != null && Number.isFinite(definition.massKg) && definition.massKg > 0;
  const positiveDensity =
    definition.densityKgM3 != null &&
    Number.isFinite(definition.densityKgM3) &&
    definition.densityKgM3 > 0;
  if (
    definition.shape === 'CustomMass'
      ? !positiveMass
      : !definition.materialId && !positiveDensity && !positiveMass
  ) {
    issues.push({
      code: 'mass-source-missing',
      severity: 'block',
      message:
        definition.shape === 'CustomMass'
          ? 'Custom mass requires a positive finite mass in kg.'
          : 'Choose a material, a positive density, or a positive mass for this definition.',
    });
  }
  if (
    definition.shape !== 'CustomMass' &&
    definition.materialId &&
    !materialDensities.has(definition.materialId)
  ) {
    issues.push({
      code: 'mass-material-unresolved',
      severity: 'warn',
      message: `Material "${definition.materialId}" is unavailable in the loaded catalog, so its mass cannot be calculated. KSA must provide this solid or liquid phase.`,
    });
  }
  for (const field of shape.dimensions) {
    const value = definition.dimensions[field.key];
    const zeroAllowed = field.key === 'radiusTopM';
    if (value == null || !Number.isFinite(value) || (zeroAllowed ? value < 0 : value <= 0)) {
      issues.push({
        code: 'mass-dimension-invalid',
        severity: 'block',
        message: `${field.label} must be a finite ${zeroAllowed ? 'non-negative' : 'positive'} distance in metres.`,
      });
    }
  }
  if (definition.shape === 'CustomMass' && definition.massSpecificInertia) {
    const values = Object.values(definition.massSpecificInertia);
    if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
      issues.push({
        code: 'mass-inertia-invalid',
        severity: values.some((value) => !Number.isFinite(value)) ? 'block' : 'warn',
        message:
          'Custom mass principal moments must be positive and finite. KSA replaces non-positive moments with 1.',
      });
    }
  }
  if (
    [...Object.values(definition.locationAsmb), ...Object.values(definition.paf2Asmb)].some(
      (value) => !Number.isFinite(value),
    )
  ) {
    issues.push({
      code: 'mass-frame-invalid',
      severity: 'block',
      message: 'Mass position and orientation must contain finite values.',
    });
  }
  if (shape.revolved && definition.sweepRad != null && !Number.isFinite(definition.sweepRad)) {
    issues.push({
      code: 'mass-sweep-invalid',
      severity: 'block',
      message: 'Mass sweep must be a finite angle.',
    });
  }
  if (
    definition.shape !== 'CustomMass' &&
    massDefinitionVolumeM3(definition) === 0 &&
    !issues.some((issue) => issue.code === 'mass-dimension-invalid')
  ) {
    issues.push({
      code: 'mass-volume-zero',
      severity: 'warn',
      message:
        'This definition has zero geometric volume. Density and material sources produce zero mass.',
    });
  }
  return issues;
}

export interface MassSummary {
  /** Sum of resolved contributions; incomplete whenever unresolvedCount is nonzero. */
  massKg: number;
  unresolvedCount: number;
  definitionCount: number;
}

const MASS_XML_TAGS = new Set<string>([
  ...MASS_SHAPES,
  'HollowSphereMass',
  'SolidOgiveMass',
  'SolidConeMass',
  'HollowOpenConeMass',
  'SolidTruncatedConeMass',
  'HollowCuboidMass',
]);

function preservedMassCount(nodes: readonly RawXmlNode[]): number {
  return nodes.filter((node) => MASS_XML_TAGS.has(node.tag)).length;
}

export function sumMassDefinitions(
  definitions: readonly MassDefinition[],
  materialDensities: ReadonlyMap<string, number>,
): MassSummary {
  let massKg = 0;
  let unresolvedCount = 0;
  for (const definition of definitions) {
    const mass = resolveMassDefinitionKg(definition, materialDensities);
    if (mass == null) unresolvedCount++;
    else massKg += mass;
  }
  return { massKg, unresolvedCount, definitionCount: definitions.length };
}

/**
 * Explicit definitions across this Part and every placed template instance. KSA
 * ScaleFactors uses the largest scale axis and cubes it for inert mass. A saved
 * template entry with massDefinitionsOverride replaces the catalog copy, matching
 * flexo's exported variants. Existing opaque mass XML remains unresolved.
 * Tank/grain-module walls and contents are separate contributions, excluded here.
 */
export function combinedMassSummary(
  part: EditingPart,
  materialDensities: ReadonlyMap<string, number>,
  templateDefinitions: ReadonlyMap<string, readonly MassDefinition[]> = new Map(),
): MassSummary {
  const summary = sumMassDefinitions(part.gameData.massDefinitions, materialDensities);
  const preservedPartMasses = preservedMassCount(part.gameData.unknownChildren);
  summary.definitionCount += preservedPartMasses;
  summary.unresolvedCount += preservedPartMasses;
  if (part.gameData.customMass != null) {
    summary.definitionCount++;
    if (Number.isFinite(part.gameData.customMass) && part.gameData.customMass > 0) {
      summary.massKg += part.gameData.customMass;
    } else summary.unresolvedCount++;
  }
  const byTemplate = new Map(part.subPartGameData.map((data) => [data.subPartTemplateId, data]));
  for (const placement of part.placements) {
    const data = byTemplate.get(placement.subPartTemplateId);
    const preservedTemplateMasses = preservedMassCount(data?.unknownChildren ?? []);
    const hasPreservedStockMass = data?.unknownChildren.some((node) =>
      (MASS_SHAPES as readonly string[]).includes(node.tag),
    );
    const definitions = data?.massDefinitionsOverride
      ? data.massDefinitions
      : hasPreservedStockMass
        ? []
        : (templateDefinitions.get(placement.subPartTemplateId) ?? []);
    const contribution = sumMassDefinitions(definitions, materialDensities);
    const scale = Math.max(placement.scale.x, placement.scale.y, placement.scale.z);
    summary.massKg += contribution.massKg * scale ** 3;
    summary.definitionCount += contribution.definitionCount + preservedTemplateMasses;
    summary.unresolvedCount += contribution.unresolvedCount + preservedTemplateMasses;
  }
  return summary;
}
