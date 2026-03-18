export default {
  '*.{js,ts}': () => {
    return ['pnpm eslint --fix'];
  },
};
