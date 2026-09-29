/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by vite.config.ts `define` at build time. */
declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;
