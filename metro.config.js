const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle SQL migrations are imported as modules (see babel.config.js).
config.resolver.sourceExts.push('sql');

module.exports = config;
