/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BUILD_ID: string | undefined;
  readonly VITE_ASSET_BASE: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
