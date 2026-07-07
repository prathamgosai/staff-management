import base from "./eslint.base.mjs";

// Root flat config — the shared base. Each workspace extends this in its own
// eslint.config.mjs; running eslint from the repo root uses this directly.
export default base;
