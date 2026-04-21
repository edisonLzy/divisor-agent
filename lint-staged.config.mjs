export default {
  '*.{js,ts}': () => {
    return ['bun eslint --fix'];
  },
};
