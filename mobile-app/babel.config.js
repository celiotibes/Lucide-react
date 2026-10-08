module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@': './src',
            '@screens': './src/screens',
            '@components': './src/components',
            '@hooks': './src/hooks',
            '@services': './src/services',
            '@api': './src/api',
            '@types': './src/types',
            '@utils': './src/utils',
            '@store': './src/store',
            '@db': './src/db',
            '@constants': './src/constants',
          },
        },
      ],
    ],
  };
};
