const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle SQL migrations are imported as modules (see babel.config.js).
config.resolver.sourceExts.push('sql');

module.exports = config;
// TEMP-U2-WEB-EXPORT: stubs for the web screenshot export only. Restored after the export.
config.resolver.assetExts.push('wasm');
const u2Stubs = {
  '@/app-shell/db-provider': require('path').join(__dirname, '.u2-web-stubs/db-provider.tsx'),
  '@/features/pipeline/pipeline-provider': require('path').join(__dirname, '.u2-web-stubs/pipeline-provider.tsx'),
};
const u2Original = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (u2Stubs[moduleName]) return { type: 'sourceFile', filePath: u2Stubs[moduleName] };
  return u2Original ? u2Original(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
