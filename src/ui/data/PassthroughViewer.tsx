import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CopyDownloadBar, SectionTitle } from '../kit';
import { DataSection } from './DataSection';
import type { SectionMeta } from './sectionMeta';
import type { RawXmlNode } from '../../ksa/types';

/**
 * **Passthrough XML** (decision D2) — the read-only view of the XML flexo preserves but does
 * not model.
 *
 * flexo's `<PartGameData>` / `<SubPartGameData>` round-trip is allow-list driven: anything
 * outside the modeled set is captured as a `RawXmlNode` tree and re-emitted verbatim, which
 * is what lets you import a Core part and export it without silently dropping half of it.
 * Until now there was no way to SEE that data, so a user editing an imported part could not
 * tell it existed at all (census pain 7).
 *
 * **Strictly read-only, by design.** A viewer is a trust win; an editor would invite
 * hand-authoring XML that flexo has deliberately chosen not to model, and would put a second
 * (unvalidated) authoring path next to every modeled field. Copy is the escape hatch.
 *
 * Import remapping (`remapRawConnectorRefs`) and the allow-lists themselves are untouched by
 * this surface — census invariant 1.
 *
 * **Undo enrollment: NONE.** Nothing here mutates.
 */
export function PassthroughViewer({
  rootTag,
  unknownAttrs,
  unknownChildren,
  customMassExtras,
  meta,
}: {
  /** The element the preserved attributes sit on: `PartGameData` / `SubPartGameData`. */
  rootTag: string;
  unknownAttrs: Readonly<Record<string, string>>;
  unknownChildren: readonly RawXmlNode[];
  /** Part scope only: the nodes re-nested inside `<CustomMass>`. */
  customMassExtras?: readonly RawXmlNode[];
  meta: SectionMeta;
}) {
  const attrNames = Object.keys(unknownAttrs);
  const extras = customMassExtras ?? [];
  const empty = attrNames.length === 0 && unknownChildren.length === 0 && extras.length === 0;

  return (
    <DataSection sectionId="passthrough" count={meta.count} issue={meta.issue}>
      <p className="text-xs text-fg-subtle">
        flexo preserves XML it doesn&rsquo;t model and re-exports it verbatim. Read-only by design.
      </p>

      {empty ? (
        <span className="text-xs text-fg-subtle">
          No preserved XML — everything on this part is modeled.
        </span>
      ) : (
        <>
          {attrNames.length > 0 && (
            <div className="flex flex-col gap-1">
              <SectionTitle>Attributes</SectionTitle>
              <div className="font-mono text-[11px] leading-snug text-fg-muted">
                {`<${rootTag} ${attrNames.map((n) => `${n}="${unknownAttrs[n]}"`).join(' ')}>`}
              </div>
            </div>
          )}

          {unknownChildren.length > 0 && (
            <div className="flex flex-col gap-1">
              <SectionTitle>Elements</SectionTitle>
              {unknownChildren.map((node, i) => (
                <RawNodeRow key={`${node.tag}:${i}`} node={node} depth={0} />
              ))}
            </div>
          )}

          {extras.length > 0 && (
            <div className="flex flex-col gap-1">
              <SectionTitle>inside &lt;CustomMass&gt;</SectionTitle>
              {extras.map((node, i) => (
                <RawNodeRow key={`mass:${node.tag}:${i}`} node={node} depth={0} />
              ))}
            </div>
          )}

          <CopyDownloadBar
            size="xs"
            copyLabel="Copy XML"
            filename={`${rootTag}-passthrough.xml`}
            mime="application/xml"
            getText={() => passthroughXml(rootTag, unknownAttrs, unknownChildren, extras)}
          />
        </>
      )}
    </DataSection>
  );
}

/** One element of the preserved tree: `<TagName attr="v">`, indented by depth, collapsible. */
function RawNodeRow({ node, depth }: { node: RawXmlNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const attrs = Object.entries(node.attrs)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join('');
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex flex-col" style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      <div className="flex min-w-0 items-start gap-1">
        {hasChildren ? (
          <button
            type="button"
            className="mt-0.5 shrink-0 cursor-pointer text-fg-subtle"
            aria-label={open ? `Collapse ${node.tag}` : `Expand ${node.tag}`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        ) : (
          <span className="w-[11px] shrink-0" />
        )}
        <span className="min-w-0 break-all font-mono text-[11px] leading-snug text-fg-muted">
          {`<${node.tag}${attrs}${hasChildren ? '>' : node.text !== undefined ? '>' : '/>'}`}
          {!hasChildren && node.text !== undefined && (
            <span className="text-fg">{`${node.text}</${node.tag}>`}</span>
          )}
        </span>
      </div>
      {hasChildren && open && (
        <div className="flex flex-col">
          {node.children.map((child, i) => (
            <RawNodeRow key={`${child.tag}:${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Serializes the preserved nodes back to XML for the Copy button.
 *
 * A local ~15-line builder over the built-in DOM APIs (project convention: no third-party XML
 * lib), NOT a re-export of the serializer's private `buildRawNode` — `src/ksa/` stays
 * untouched by this phase, which is the whole point of asserting byte-identical export.
 */
function passthroughXml(
  rootTag: string,
  attrs: Readonly<Record<string, string>>,
  children: readonly RawXmlNode[],
  massExtras: readonly RawXmlNode[],
): string {
  const doc = document.implementation.createDocument(null, null, null);
  const root = doc.createElement(rootTag);
  for (const [name, value] of Object.entries(attrs)) root.setAttribute(name, value);
  for (const child of children) root.appendChild(buildElement(doc, child));
  if (massExtras.length > 0) {
    const customMass = doc.createElement('CustomMass');
    for (const node of massExtras) customMass.appendChild(buildElement(doc, node));
    root.appendChild(customMass);
  }
  return new XMLSerializer().serializeToString(root);
}

function buildElement(doc: XMLDocument, node: RawXmlNode): Element {
  const el = doc.createElement(node.tag);
  for (const [name, value] of Object.entries(node.attrs)) el.setAttribute(name, value);
  if (node.children.length === 0 && node.text !== undefined) el.textContent = node.text;
  for (const child of node.children) el.appendChild(buildElement(doc, child));
  return el;
}
