/** Mesh ids in a bundle's <ConvexHull> resolve through its host-only collision atlas. */
export function collisionMeshAtlasPaths(doc: Document): Map<string, string> {
  const atlas = Array.from(doc.getElementsByTagName('MeshAtlas')).find(
    (el) => el.getAttribute('HostOnly')?.toLowerCase() === 'true',
  );
  const path = atlas?.getAttribute('Path');
  const out = new Map<string, string>();
  if (!path) return out;
  for (const hull of Array.from(doc.getElementsByTagName('ConvexHull'))) {
    const mesh = Array.from(hull.childNodes).find(
      (node) => node.nodeType === 1 && (node as Element).tagName === 'Mesh',
    ) as Element | undefined;
    const id = mesh?.getAttribute('Id');
    if (id) out.set(id, path);
  }
  return out;
}
