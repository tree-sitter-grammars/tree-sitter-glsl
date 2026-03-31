import treesitter from 'eslint-config-treesitter';

export default [
  {
    ignores: [
      'bindings/**',
      'builtin.js',
      'specification/**',
      'src/**',
    ],
  },
  ...treesitter,
];
