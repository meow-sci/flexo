import type { PrimitiveKind } from '../ksa/types';

/**
 * The editable numeric fields of each primitive kind (keys match the param interfaces in
 * `ksa/types.ts`).
 *
 * ONE dataset (foundation Law 4): `CreateMeshDialog` renders it at creation time and Surface
 * mode's Identity section renders it for the SAME params afterwards (census §1.9 — the closed
 * UI gap), so the two can never offer different fields for one shape.
 *
 * Its own module rather than an export from the dialog, so importing the table never drags a
 * component in (and Fast Refresh keeps working for both files).
 */
export interface ParamField {
  key: string;
  label: string;
}

export const PARAM_FIELDS: Record<PrimitiveKind, ParamField[]> = {
  box: [
    { key: 'width', label: 'Width (m)' },
    { key: 'height', label: 'Height (m)' },
    { key: 'depth', label: 'Depth (m)' },
  ],
  cylinder: [
    { key: 'radius', label: 'Radius (m)' },
    { key: 'height', label: 'Height (m)' },
    { key: 'radialSegments', label: 'Segments' },
  ],
  sphere: [
    { key: 'radius', label: 'Radius (m)' },
    { key: 'segments', label: 'Segments' },
  ],
  plane: [
    { key: 'width', label: 'Width (m)' },
    { key: 'height', label: 'Height (m)' },
  ],
};
