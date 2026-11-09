/** KSA 5801 content prepass. Input files must be supplied in manifest order. */
export interface ContentFile {
  file: string;
  doc: Document;
}
export interface ResolvedContent {
  doc: Document;
  sourceById: Map<string, string>;
}

const children = (e: Element): Element[] =>
  Array.from(e.childNodes).filter((n): n is Element => n.nodeType === 1);
const key = (tag: string, id: string) => `${tag}\0${id.toLowerCase()}`;
const lower = (s: string | null) => (s ?? '').toLowerCase();

interface Entry {
  row: Element;
  file: string;
  steps: { row: Element; verb: string }[];
  removed: boolean;
  flat?: Element;
  active?: boolean;
  abstract?: boolean;
}

function fresh(e: Element): Element {
  const copy = e.cloneNode(true) as Element;
  const clean = (node: Element) => {
    node.removeAttribute('Modify');
    for (const child of children(node)) clean(child);
  };
  clean(copy);
  return copy;
}

function mergeAttributes(target: Element, patch: Element, row: boolean, matched?: string): void {
  for (const attr of Array.from(patch.attributes)) {
    if (
      attr.name === 'Modify' ||
      attr.name === matched ||
      (row && ['Id', 'Parent', 'Abstract'].includes(attr.name))
    )
      continue;
    target.setAttribute(attr.name, attr.value);
  }
}

function patchInto(target: Element, patch: Element, matched?: string): void {
  mergeAttributes(target, patch, false, matched);
  if (children(patch).length) applyRecord(target, patch);
  else if ((patch.textContent ?? '').trim()) target.textContent = patch.textContent;
}

function extendInto(target: Element, patch: Element, matched?: string): void {
  mergeAttributes(target, patch, false, matched);
  for (const item of children(patch)) {
    const verb = lower(item.getAttribute('Modify'));
    if (!verb) {
      const itemKey = item.getAttribute('Key');
      if (itemKey && children(target).some((e) => lower(e.getAttribute('Key')) === lower(itemKey)))
        throw new Error(`Duplicate Key ${itemKey}`);
      target.appendChild(fresh(item));
      continue;
    }
    const attr = item.getAttribute('Key') ? 'Key' : 'Ref';
    const value = item.getAttribute(attr);
    if (!value) throw new Error(`Missing selector in ${item.tagName}`);
    const matches = children(target).filter(
      (e) =>
        !(attr === 'Ref' && e.getAttribute('Key')) && lower(e.getAttribute(attr)) === lower(value),
    );
    if (matches.length !== 1) throw new Error(`Missing or ambiguous ${attr} ${value}`);
    const existing = matches[0];
    if ((verb === 'patch' || verb === 'extend') && existing.tagName !== item.tagName)
      throw new Error(`Mismatched item ${value}`);
    if (verb === 'patch') patchInto(existing, item, attr);
    else if (verb === 'extend') extendInto(existing, item, attr);
    else if (verb === 'remove') target.removeChild(existing);
    else if (verb === 'replace') {
      const replacement = fresh(item);
      replacement.setAttribute(attr, existing.getAttribute(attr)!);
      target.replaceChild(replacement, existing);
    } else throw new Error(`Unknown child verb ${verb}`);
  }
}

function applyRecord(target: Element, patch: Element): void {
  const seen = new Set<string>();
  for (const child of children(patch)) {
    if (seen.has(child.tagName)) throw new Error(`Duplicate patch child ${child.tagName}`);
    seen.add(child.tagName);
    const matches = children(target).filter((e) => e.tagName === child.tagName);
    if (matches.length > 1) throw new Error(`Ambiguous child ${child.tagName}`);
    const existing = matches[0];
    const verb = lower(child.getAttribute('Modify'));
    if (verb === 'extend') {
      const container =
        existing ?? target.appendChild(target.ownerDocument!.createElement(child.tagName));
      extendInto(container, child);
    } else if (!verb || verb === 'replace') {
      if (verb && !existing) throw new Error(`Missing child ${child.tagName}`);
      if (existing) target.replaceChild(fresh(child), existing);
      else target.appendChild(fresh(child));
    } else if (verb === 'patch') {
      if (!existing) throw new Error(`Missing child ${child.tagName}`);
      patchInto(existing, child);
    } else if (verb === 'remove') {
      if (!existing) throw new Error(`Missing child ${child.tagName}`);
      target.removeChild(existing);
    } else throw new Error(`Unknown child verb ${verb}`);
  }
}

function validate(row: Element, rowPatch: boolean): void {
  const walk = (parent: Element, parentVerb: string, inNew: boolean) => {
    const names = new Set<string>();
    const verbed = new Set<string>();
    const keys = new Set<string>();
    for (const child of children(parent)) {
      for (const attr of ['Id', 'Parent', 'Abstract'])
        if (child.hasAttribute(attr)) throw new Error(`Nested ${attr} on ${child.tagName}`);
      const verb = lower(child.getAttribute('Modify'));
      if (!['', 'patch', 'extend', 'replace', 'remove'].includes(verb))
        throw new Error(`Unknown child verb ${verb}`);
      if (parentVerb === 'patch' && names.has(child.tagName))
        throw new Error(`Duplicate patch child ${child.tagName}`);
      names.add(child.tagName);
      const selector = child.getAttribute('Key') ? 'Key' : 'Ref';
      const value = child.getAttribute(selector);
      if (parentVerb === 'extend' && verb) {
        if (!value) throw new Error(`Missing selector in ${child.tagName}`);
        const identity = `${selector}:${value.toLowerCase()}`;
        if (verbed.has(identity)) throw new Error(`Duplicate selector ${value}`);
        verbed.add(identity);
      }
      if (inNew && verb && (verb !== 'extend' || parentVerb === 'extend'))
        throw new Error(`Modify ${verb} in new content`);
      if (verb === 'remove') {
        const allowed = new Set(parentVerb === 'extend' ? ['Modify', 'Key', 'Ref'] : ['Modify']);
        if (
          Array.from(child.attributes).some((a) => !allowed.has(a.name)) ||
          children(child).length ||
          (child.textContent ?? '').trim()
        )
          throw new Error(`Remove with content on ${child.tagName}`);
      }
      const itemKey = child.getAttribute('Key');
      if (inNew && itemKey) {
        if (keys.has(itemKey.toLowerCase())) throw new Error(`Duplicate Key ${itemKey}`);
        keys.add(itemKey.toLowerCase());
      }
      const freshContent = inNew || verb === '' || verb === 'replace';
      walk(child, verb === 'patch' || verb === 'extend' ? verb : '', freshContent);
    }
  };
  walk(row, rowPatch ? 'patch' : '', !rowPatch);
}

/** Flatten definitions after collecting all patches, so derived rows see their parent's final state. */
export function resolveContent(files: ContentFile[]): ResolvedContent {
  if (!files.length) throw new Error('No content files');
  const entries = new Map<string, Entry>();
  for (const { file, doc } of files) {
    if (doc.documentElement?.tagName !== 'Assets')
      throw new Error(`Invalid Assets root in ${file}`);
    for (const row of children(doc.documentElement)) {
      const id = row.getAttribute('Id');
      if (!id) throw new Error(`Missing Id on ${row.tagName} in ${file}`);
      const k = key(row.tagName, id);
      const verb = lower(row.getAttribute('Modify'));
      const existing = entries.get(k);
      if (!verb) {
        if (existing && !existing.removed) throw new Error(`Duplicate ${row.tagName} ${id}`);
        entries.set(k, { row, file, steps: [], removed: false });
        continue;
      }
      const ifExists = verb.endsWith('ifexists');
      const action = verb.replace(/ifexists$/, '');
      if (!['patch', 'replace', 'remove'].includes(action))
        throw new Error(`Unknown row verb ${verb}`);
      if (!existing || existing.removed) {
        if (ifExists) continue;
        throw new Error(`Missing ${row.tagName} ${id} for ${verb}`);
      }
      if (action === 'patch' && (row.hasAttribute('Parent') || row.hasAttribute('Abstract')))
        throw new Error('Parent/Abstract on Patch row');
      if (
        action === 'remove' &&
        (Array.from(row.attributes).some((a) => !['Id', 'Modify'].includes(a.name)) ||
          children(row).length ||
          (row.textContent ?? '').trim())
      )
        throw new Error('Remove row with content');
      if (action === 'remove') existing.removed = true;
      else existing.steps.push({ row, verb: action });
    }
  }
  const flatten = (entry: Entry): Element => {
    if (entry.flat) return entry.flat;
    if (entry.active) throw new Error(`Inheritance cycle at ${entry.row.getAttribute('Id')}`);
    entry.active = true;
    const build = (row: Element): Element => {
      const parent = row.getAttribute('Parent');
      const abstract = row.getAttribute('Abstract');
      if (abstract !== null && !['true', 'false'].includes(abstract.toLowerCase()))
        throw new Error(`Invalid Abstract ${abstract}`);
      validate(row, !!parent);
      let result: Element;
      if (parent) {
        const base = entries.get(key(row.tagName, parent));
        if (!base || base.removed) throw new Error(`Missing parent ${row.tagName} ${parent}`);
        result = flatten(base).cloneNode(true) as Element;
        mergeAttributes(result, row, true);
        applyRecord(result, row);
        result.setAttribute('Id', entry.row.getAttribute('Id')!);
      } else result = fresh(row);
      result.removeAttribute('Parent');
      result.removeAttribute('Abstract');
      result.removeAttribute('Modify');
      return result;
    };
    let flat = build(entry.row);
    entry.abstract = lower(entry.row.getAttribute('Abstract')) === 'true';
    for (const step of entry.steps) {
      if (step.verb === 'replace') {
        flat = build(step.row);
        entry.abstract = lower(step.row.getAttribute('Abstract')) === 'true';
      } else {
        validate(step.row, true);
        mergeAttributes(flat, step.row, true);
        applyRecord(flat, step.row);
      }
    }
    entry.active = false;
    entry.flat = flat;
    return flat;
  };
  const doc = files[0].doc.implementation.createDocument(null, 'Assets', null);
  const sourceById = new Map<string, string>();
  for (const [k, entry] of entries) {
    if (entry.removed) continue;
    const flat = flatten(entry);
    if (entry.abstract) continue;
    doc.documentElement.appendChild(doc.importNode(flat, true));
    sourceById.set(k, entry.file);
  }
  return { doc, sourceById };
}

export function contentSource(content: ResolvedContent, tag: string, id: string): string {
  return content.sourceById.get(key(tag, id)) ?? '';
}
