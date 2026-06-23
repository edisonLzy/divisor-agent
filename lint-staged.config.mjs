export default {
  // 把 staged 文件名拼到命令尾部,避免 oxlint/oxfmt 在 monorepo 根目录执行时
  // 把全仓所有文件顺手格式化一遍、却只把原本 staged 的子集 re-add 回 commit。
  "*.{js,jsx,ts,tsx}": (filenames) => [
    `pnpm oxlint --fix ${filenames.join(" ")}`,
    `pnpm oxfmt --write ${filenames.join(" ")}`,
  ],
  "*.{json}": (filenames) => [`pnpm oxfmt --write ${filenames.join(" ")}`],
};
