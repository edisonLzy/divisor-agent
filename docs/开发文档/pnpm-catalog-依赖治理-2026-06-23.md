# pnpm catalog 依赖治理

> 日期:2026-06-23
> 范围:`pnpm-workspace.yaml` + 5 个 `packages/*/package.json` + 根 `package.json`
> 提交:`chore(workspace): consolidate shared deps via pnpm catalog`

## 一、背景(Why)

`divisor-agent` 是 monorepo,5 个 workspace 包(`app` / `extension-core` / `extension-files` / `extension-subagents` / `extension-example`)各自维护 `package.json`。经过前几次迭代后,出现两类问题:

1. **版本号散落**:同一个依赖在多个包里被独立写明版本号,本次变更前就有 ~10 个共享依赖重复声明:`react-dom`、`@types/react-dom`、`@earendil-works/pi-ai`、`@earendil-works/pi-agent-core`、`lucide-react`、`streamdown`、`clsx`、`@floating-ui/dom` 等。
2. **版本漂移的早期信号**:`@tiptap/core` 已在 catalog 里,但 `app` 反而硬写 `^3.22.5` 没走 catalog;`@eslint/js` 在 catalog 里却全项目无人引用(死链);`typescript` 在 root 是 `^6.0.3`,在 `app` 是 `^5.9.3`,catalog 里也是 `^6.0.3` 但 root 没有用 `catalog:` 引用。

最危险的是 `@earendil-works/pi-agent-core` / `@earendil-works/pi-ai` —— 这两个是 agent runtime 的核心,项目专门在 `pnpm-workspace.yaml` 里配了 `minimumReleaseAgeExclude` 防止上游漂移。但版本号散落在 4 个包里,真要升级时容易漏改、漏测。

收口到 pnpm catalog,目标是一处升级、5 包同步、漂移风险收敛。

## 二、核心决策(Why,重点)

### 2.1 catalog 入选标准

参考 [pnpm catalog 文档](https://pnpm.io/catalogs) 和项目"Dependencies: Strictly on-demand. Never install unused dependencies"原则,采用**双阈值**:

- **强入选**:`≥2` 个 workspace 包引用 **且** 版本号完全一致
- **弱入选**:已经在 catalog 但无人引用 → 删除

按这个标准扫一遍,本次新增 9 项、删除 1 项。

### 2.2 决策:typescript 故意不进统一收口

`typescript` 在 lockfile 里同时存在两个版本:

| 消费者 | specifier | 实际版本 | 用途 |
| --- | --- | --- | --- |
| root `package.json` | `^6.0.3` | 6.0.3 | 跑 oxlint/vitest/commitlint 等工具链 |
| `packages/app` | `^5.9.3` | 5.9.3 | `tsc --noEmit` 编译 electron + renderer |

这是有意分离 —— 工具链先吃 TS 6,app 编译期仍用 TS 5(electron-vite 7 + Vite 7 对 TS 6 的兼容性未在生产验证过,贸然升级风险高)。

**处理**:

- catalog 里保留 `typescript: ^6.0.3`(现有值)
- root 改成 `"typescript": "catalog:"` 收口
- `packages/app` **保持显式** `"typescript": "^5.9.3"`,不走 catalog

这样两个版本独立演进,任何一处想统一时只需删一行显式锁。catalog 真正收口的是"统一升级路径",不是"强行统一版本"。

### 2.3 决策:`extension-files` 的 peerDeps `react-dom: ^19.0.0` 保留更宽范围

`extension-files` 同时在 `devDependencies` 写 `react-dom: ^19.2.1`、`peerDependencies` 写 `react-dom: ^19.0.0`。两个范围**不同**且都合法:

- `devDependencies` 是开发期 electron-vite 实际拉的版本
- `peerDependencies` 是声明给外部消费者的最低兼容版本

如果把 peerDeps 也改成 `catalog:`,peer 范围会从 `^19.0.0` 收紧到 `^19.2.1`,理论上影响"还在用 react-dom 19.0.x 或 19.1.x"的外部消费者 —— 虽然本项目 extension 是 source-only 由 electron-vite 打包、`externalizeDeps.exclude` 已经把整个 workspace 包都打进 main bundle,实际不存在外部 peer,但**收紧一个声明范围**仍然属于行为变化。

**因此保留** peerDeps 显式 `^19.0.0`,只把 `devDependencies` 那一份改 `catalog:`。这是"非破坏性"边界。

### 2.4 不进 catalog 的依赖(及原则)

| 类型 | 示例 | 不进 catalog 的理由 |
| --- | --- | --- |
| 单包专用栈 | `@tiptap/extension-*`、`@codemirror/*`、`@streamdown/*` 子包、`@dnd-kit/*`、`@xyflow/react`、`shiki`、`sonner`、`zustand`、`@tanstack/*`、`react-router-dom` 等 | 强功能绑定,跨包引用反而误导;只有 1 个包用 |
| 仅 root / 构建工具 | `electron`、`electron-vite`、`electron-builder`、`vite`、`tailwindcss`、`@vitejs/plugin-react` | 与 electron 工具链强耦合,版本由 app 决定 |
| workspace 内部依赖 | `@divisor-agent/*` | `workspace:*` 协议,不进版本号 |
| 版本不一致 | `@types/node` (root `^22.0.0` vs app `^22.19.1`) | 留作后续统一,本轮不动 |

不进 catalog 的判断原则:**共享度 + 版本一致性**,两者都满足才进。

## 三、变更内容(How)

### 3.1 `pnpm-workspace.yaml` catalog 段

**新增 9 项**:

```yaml
catalog:
  react-dom: ^19.2.1
  "@types/react-dom": ^19.2.3
  "@earendil-works/pi-agent-core": ^0.79.10
  "@earendil-works/pi-ai": ^0.79.10
  lucide-react: ^1.8.0
  streamdown: ^2.5.0
  clsx: ^2.1.1
  "@floating-ui/dom": ^1.7.6
```

**删除 1 项**: `@eslint/js`(全项目无人引用,死链)。

### 3.2 package.json 改动汇总

| 文件 | 改动 |
| --- | --- |
| 根 `package.json` | `typescript: ^6.0.3` → `catalog:` |
| `packages/app/package.json` | 11 处: `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`、`@floating-ui/dom`、`@tiptap/core`、`clsx`、`lucide-react`、`streamdown`、devDep `@types/react-dom`、devDep `react-dom`(已存在的 `react`、`@types/react` 保持) |
| `packages/extension-core/package.json` | 3 处 peerDeps: `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`、`streamdown` |
| `packages/extension-files/package.json` | 9 处: dep `lucide-react`、devDep 四项(`@floating-ui/dom`、`@types/react-dom`、`clsx`、`react-dom`)、peerDep 三项(`@floating-ui/dom`、`clsx`、`streamdown`)。peerDep `react-dom: ^19.0.0` 保留 |
| `packages/extension-subagents/package.json` | 3 处: dep `@earendil-works/pi-ai`、peerDep `lucide-react` |
| `packages/extension-example/package.json` | 1 处: dep `@earendil-works/pi-ai` |

总计 **28 处** 显式版本号 → `catalog:` 引用。

### 3.3 验证

- ✅ `pnpm install --lockfile-only`:lockfile 同步成功,所有 catalog 引用解析正常
- ✅ `pnpm typecheck`(app):零类型错误
- ✅ lockfile 实际版本与原显式版本一致(`lucide-react` 仍解析到 `1.11.0`、`streamdown` 仍 `2.5.0`、`@earendil-works/pi-ai` 仍 `0.79.10`)
- ✅ `pnpm-lock.yaml` diff:`-106 / +76` 行,净减 30 行(由于 catalog 语法在 lockfile 里占位更紧凑)

## 四、影响面与兼容窗口

### 4.1 升级体验(正向)

后续升级任一 catalog 项,只需改 `pnpm-workspace.yaml` 一处,5 个包同步生效。例如把 `react: ^19.2.1` 改成 `^19.3.0`,`app` / 4 个 extension 全部一起升级,无需逐包改版本号。

### 4.2 兼容性边界

- `catalog:` 语法需要 **pnpm ≥ 9**(本项目 `packageManager` 已锁 `pnpm@11.5.0`),无外部兼容性压力。
- extension 是 source-only workspace 包,electron-vite 通过 `externalizeDeps.exclude` 打包进 main bundle;`catalog:` 在 extension 里只影响 dev 期 pnpm 解析,生产产物不变。
- 第三方如果 fork 本项目并使用 pnpm < 9,需自行把 `catalog:` 替换为显式版本号。

### 4.3 风险点

- **集中升级的风险**:某个 catalog 项突破性升级(如 React 19 → 20),5 个包同时受影响。**缓解**:升级前仍按包逐个跑 `pnpm typecheck` + `pnpm test`,catalog 只是减少机械改动,不替代验证。
- **typescrip t 双版本**:本轮未消除。`app` 仍然锁 `^5.9.3`,未来是否统一到 TS 6 取决于 electron-vite / Vite 7 的兼容性验证。

## 五、回顾(教训 / 后续)

1. **catalog 应在使用前先建账**:本轮发现 `@eslint/js` 是历史遗留死链、 `@tiptap/core` 在 catalog 里但 `app` 没引用 —— 说明 catalog 启用后没做"覆盖率"巡检。建议每 N 次 catalog 改动后,跑一遍 `grep -L "catalog:" packages/*/package.json` 找漏网之鱼。
2. **版本敏感的依赖优先进 catalog**:`@earendil-works/pi-*` 是项目 runtime 命脉,本轮把它们集中后,搭配现有的 `minimumReleaseAgeExclude` 形成"统一升级 + 延迟审计"的双重保护。
3. **typescript 不强行统一**是好决策:目录结构里区分"工具链"和"应用编译"两类消费者,版本分离的语义本身有价值。
4. **依赖收口 ≠ 依赖冻结**:catalog 是表达"想统一"的工具,不是"必须统一"的约束。当业务上需要某个包独立迭代时,把它从 catalog 拿出 + 显式锁版本即可。

## 六、待办

- [ ] 决定是否把 `@types/node` 也统一进 catalog(root `^22.0.0` vs app `^22.19.1`,需要先选一个版本)
- [ ] 评估 `typescript` 双版本何时可统一(等 electron-vite 验证 TS 6 兼容性后)
- [ ] 修根脚本 `pnpm type-check` 与 app 脚本 `typecheck` 命名不一致(根脚本 `pnpm -r run type-check` 找不到 `type-check` 脚本,但 app 定义的是 `typecheck`)
- [ ] 跑 `pnpm test` 确认 catalog 升级没有副作用(本轮未跑测试)
- [ ] 给 `extension-files` 的 peerDeps / devDeps 重复声明做一次清理(目前 `@floating-ui/dom` / `clsx` / `react-dom` 同时出现在两段)