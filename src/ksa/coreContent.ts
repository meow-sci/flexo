import { resolveContent, type ResolvedContent } from './contentXml';
import { fetchXmlFile } from './catalog';

import { CORE_CONTENT_FILES } from './coreFiles';
export { CORE_CONTENT_FILES } from './coreFiles';

let cached: Promise<ResolvedContent> | undefined;
export function loadCoreContent(): Promise<ResolvedContent> {
  return (cached ??= Promise.all(
    CORE_CONTENT_FILES.map(async (file) => ({ file, result: await fetchXmlFile(file) })),
  ).then((results) =>
    resolveContent(
      results.flatMap(({ file, result }) =>
        result.kind === 'ok' ? [{ file, doc: result.doc }] : [],
      ),
    ),
  ));
}
