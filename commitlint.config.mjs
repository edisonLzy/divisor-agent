import config from '@commitlint/config-conventional';

export default {
  parserPreset: config.parserPreset,
  rules: {
    ...config.rules,
    'header-max-length': [0, 'always'],
    'body-max-line-length': [0, 'always'],
  },
};
