// Metro config for the pnpm (hoisted) monorepo.
// Expo's default config (SDK 52+) already watches the workspace root and resolves hoisted node_modules,
// and package "exports" are enabled by default, so the built @pricora/* packages resolve as-is.
//
// React version note: the monorepo uses one React (19.3.1, shared with apps/web + packages/ui).
// Expo SDK 58 lists react 19.3.0; we deliberately use 19.3.1 (excluded in package.json `expo.install.exclude`)
// because pinning 19.3.0 here made pnpm nest a second React under shared deps (e.g. @radix-ui/react-slot),
// which would break the web bundle. RN 0.88's renderer has no strict React patch check.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
