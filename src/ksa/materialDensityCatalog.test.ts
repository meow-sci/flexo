import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { parseMaterialDensities } from './materialDensityCatalog';

function doc(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
}

describe('mass material densities', () => {
  it('indexes incompressible substance phase ids using current additive DensityReference units', () => {
    const densities = new Map<string, number>();
    parseMaterialDensities(
      doc(`<Assets>
      <Substance Id="Aluminum.2014"><Solid><StorageDensity KgPerM3="2800"/></Solid></Substance>
      <Substance Id="Water"><Liquid><StorageDensity GPerCm3="1" KgPerM3="20"/></Liquid><Solid><StorageDensity TonnePerM3="0.92"/></Solid></Substance>
      <Substance Id="Gas"><Gas><StorageDensity KgPerM3="4"/></Gas></Substance>
    </Assets>`),
      densities,
    );
    expect([...densities]).toEqual([
      ['Aluminum.2014(s)', 2800],
      ['Water(s)', 920],
      ['Water(l)', 1020],
    ]);
  });

  it('leaves missing, invalid, and unsupported phases unresolved while retaining other libraries', () => {
    const densities = new Map([['Existing(s)', 8000]]);
    parseMaterialDensities(
      doc(`<Assets>
      <Substance><Solid><StorageDensity KgPerM3="1"/></Solid></Substance>
      <Substance Id="Empty"><Solid/></Substance>
      <Substance Id="Zero"><Solid><StorageDensity KgPerM3="0"/></Solid></Substance>
      <Substance Id="Invalid"><Liquid><StorageDensity KgPerM3="NaN"/></Liquid></Substance>
    </Assets>`),
      densities,
    );
    expect([...densities]).toEqual([['Existing(s)', 8000]]);
  });
});
