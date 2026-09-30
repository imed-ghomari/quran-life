// Empty stub for Node built-ins referenced only inside env-guarded branches
// (sql.js Emscripten: `if (ENVIRONMENT_IS_NODE) require("node:fs")`).
// Obsidian never runs those branches — the wasm binary is passed in-memory —
// so stubbing removes the static Node require without changing behavior.
export default {};
