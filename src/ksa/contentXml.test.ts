import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { resolveContent } from './contentXml';

const parse = (xml: string) =>
  new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
const rows = (doc: Document) =>
  Array.from(doc.documentElement.childNodes).filter((n): n is Element => n.nodeType === 1);

describe('current content prepass', () => {
  it('inherits the final patched parent, replaces unmarked arrays, and applies keyed and ref selectors', () => {
    const content = resolveContent([
      {
        file: 'a',
        doc: parse(`<Assets>
      <Part Id="child" Parent="Base"><Items><Item Key="child"/></Items></Part>
      <Part Id="Base" Abstract="true"><Items><Item Key="one"><Value>old</Value><Keep/></Item><Item Ref="two"/></Items><Nested><A/><B/></Nested></Part>
      <Part Id="Base" Modify="Patch"><Items Modify="Extend"><Item Key="ONE" Modify="Patch"><Value>new</Value></Item><Item Ref="two" Modify="Remove"/><Item Key="three"/></Items><Nested Modify="Patch"><A><Changed/></A></Nested></Part>
      <Part Id="child" Modify="Patch"><Items Modify="Extend"><Item Key="child" Modify="Patch"><Value>derived</Value></Item></Items></Part>
    </Assets>`),
      },
    ]);
    expect(rows(content.doc)).toHaveLength(1);
    const child = rows(content.doc)[0];
    expect(child.getAttribute('Parent')).toBeNull();
    expect(child.getElementsByTagName('Item')).toHaveLength(1);
    expect(child.getElementsByTagName('Value')[0].textContent).toBe('derived');
    expect(child.getElementsByTagName('Changed')).toHaveLength(1);
    expect(child.getElementsByTagName('B')).toHaveLength(1);
  });
  it('supports row replace, remove and IfExists in manifest order', () => {
    const content = resolveContent([
      {
        file: 'a',
        doc: parse(
          `<Assets><Part Id="a"><X/></Part><Part Id="a" Modify="Replace"><Y/></Part><Part Id="absent" Modify="PatchIfExists"/><Part Id="z"/><Part Id="z" Modify="Remove"/></Assets>`,
        ),
      },
    ]);
    expect(rows(content.doc).map((r) => r.getAttribute('Id'))).toEqual(['a']);
    expect(content.doc.getElementsByTagName('Y')).toHaveLength(1);
  });
  it('rejects missing strict targets and missing array selectors', () => {
    expect(() =>
      resolveContent([{ file: 'a', doc: parse('<Assets><Part Id="x" Modify="Patch"/></Assets>') }]),
    ).toThrow('Missing');
    expect(() =>
      resolveContent([
        {
          file: 'a',
          doc: parse(
            '<Assets><Part Id="x"/><Part Id="x" Modify="Patch"><Items Modify="Extend"><Item Modify="Patch"/></Items></Part></Assets>',
          ),
        },
      ]),
    ).toThrow('Missing selector');
  });
  it('rejects malformed roots, rows, and nested directives', () => {
    for (const xml of [
      '<Wrong/>',
      '<Assets><Part/></Assets>',
      '<Assets><Part Id="x"><Items><Item Modify="Patch" Key="x"/></Items></Part></Assets>',
      '<Assets><Part Id="x"><Items><Item Id="nested"/></Items></Part></Assets>',
      '<Assets><Part Id="x"/><Part Id="x" Modify="Remove" Name="bad"/></Assets>',
    ])
      expect(() => resolveContent([{ file: 'a', doc: parse(xml) }])).toThrow();
  });
});
