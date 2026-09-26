// Ambient declaration for the inlined sql.js wasm (see src/plugin/sqlWasmBundle.ts).
// Kept in its own global-script d.ts (no imports/exports) so registration is
// unconditional. Imported only from plugin-only modules.
declare module 'quranlife-sql-wasm.wasm' {
    const url: string;
    export default url;
}
