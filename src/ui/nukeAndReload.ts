export async function nukeAndReload(): Promise<void> {
  try {
    localStorage.clear()
    sessionStorage.clear()
    // indexedDB.databases() is supported in Chromium/WebKit; some older Firefox
    // builds lack it, in which case we can't enumerate — localStorage is still
    // cleared and the page still reloads.
    if (typeof indexedDB !== 'undefined' && 'databases' in indexedDB) {
      const dbs = await indexedDB.databases()
      await Promise.all(
        dbs.map((db) =>
          db.name
            ? new Promise<void>((resolve) => {
                const req = indexedDB.deleteDatabase(db.name!)
                req.onsuccess = req.onerror = req.onblocked = () => resolve()
              })
            : Promise.resolve(),
        ),
      )
    }
  } finally {
    window.location.reload()
  }
}
