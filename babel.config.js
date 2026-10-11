/** @type {import('@babel/core').ConfigFunction} */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Inlines drizzle SQL migrations as strings (see src/db/bundled-migrations.ts).
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
