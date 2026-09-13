/// <reference types="vite/client" />

// vite/client doesn't know the `.hdr` extension (Vite has no built-in
// asset-type mapping for it) — the explicit `?url` import still resolves it
// to a URL at build time regardless, this just types that result.
declare module '*.hdr?url' {
  const src: string
  export default src
}
