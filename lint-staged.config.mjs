export default {
  "*.{js,ts,jsx,tsx}": () => {
    return ["pnpm oxlint --fix"];
  },
  "*.{js,jsx,ts,tsx,json}": () => {
    return ["pnpm oxfmt --write"];
  },
};
