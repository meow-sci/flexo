// The mod folder grant lives in this DB — it's a machine-level capability
// (not project data) so global reset preserves it by default.
const FS_GRANT_DBS = new Set(['flexo-fs']);

export interface NukeOptions {
  /** Also delete File System Access grant databases (default: false). */
  resetFsGrants?: boolean;
}

export async function nukeAndReload(opts: NukeOptions = {}): Promise<void> {
  try {
    localStorage.clear();
    sessionStorage.clear();
    // indexedDB.databases() is supported in Chromium/WebKit; some older Firefox
    // builds lack it, in which case we can't enumerate — localStorage is still
    // cleared and the page still reloads.
    if (typeof indexedDB !== 'undefined' && 'databases' in indexedDB) {
      const dbs = await indexedDB.databases();
      await Promise.all(
        dbs.map((db) =>
          db.name && (opts.resetFsGrants || !FS_GRANT_DBS.has(db.name))
            ? new Promise<void>((resolve) => {
                const req = indexedDB.deleteDatabase(db.name!);
                req.onsuccess = req.onerror = req.onblocked = () => resolve();
              })
            : Promise.resolve(),
        ),
      );
    }
  } finally {
    window.location.reload();
  }
}
