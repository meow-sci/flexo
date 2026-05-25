// File System Access API surface not yet in the bundled lib.dom typings: the
// per-handle permission methods and window.showDirectoryPicker.
export {}

declare global {
  interface FileSystemHandle {
    queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
    requestPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  }

  interface Window {
    showDirectoryPicker?(options?: {
      id?: string
      mode?: 'read' | 'readwrite'
      startIn?: string | FileSystemHandle
    }): Promise<FileSystemDirectoryHandle>
  }
}
