/// <reference types="vite/client" />

// Zenv holds no server-side secrets, so the app declares no VITE_* variables.
// `ImportMetaEnv` is intentionally left at the Vite default: adding a
// `VITE_GEMINI_API_KEY` declaration here is what allowed a real API key to be
// inlined into the client bundle. A secret in this interface is a bug.
interface ImportMetaEnv {
  readonly [key: `VITE_${string}`]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}