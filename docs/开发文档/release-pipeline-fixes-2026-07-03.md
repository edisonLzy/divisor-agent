# Release pipeline packaging 调试记录 — 2026-07-03

## 背景

切到 `pnpm test` 接通 release pipeline（PR #40）后，validate 阶段首次跑通了，
暴露原本藏在 validate 后面、`feat: add automated releases and app updates`
(98f2f13) 引入但从未被发现的 packaging 配置问题。

下面 5 个 PR 全是顺着这条 debug 链下来的；目前 `master` 状态对应到 PR #45。

## 各次尝试的结果

| PR      | 内容                                                  | macOS       | Linux      |
| ------- | ----------------------------------------------------- | ----------- | ---------- |
| #40     | `pnpm test` 接进 release                              | ✓ 验证OK    | ✓ 验证OK   |
| #41     | `identity: "-"` + artifactName 固定 Linux/Mac         | ❌ same     | ✓ 验证OK   |
| #42     | `cd packages/app` 替代 `pnpm --filter ... exec`       | ❌ same     | ✓         |
| #43     | version 改用 package.json 而非 `--config.extraMetadata` | ❌ same     | ✓         |
| #44     | macOS 用 ad-hoc signing                               | ❌ same     | ✓         |
| #45     | electron-builder 26.8.1 → 26.15.6                    | ❌ same     | ❌ 新错    |

错误形态始终是：

```
empty password will be used for code signing  reason=CSC_KEY_PASSWORD is not defined
⨯ /Users/runner/work/divisor-agent/divisor-agent/packages/app not a file
```

## 各尝试的判断与下条线索

- **`identity: "-"`**：v26.8.1 没让它走到 ad-hoc codesign，看日志确认它走的是
  `empty password` 分支。
- **`cd packages/app`**：electron-builder 的 cwd 一直在 `packages/app`，但
  log 里持续出现 `searching for node modules ... packages/app` 之后 1 秒内
  codesign 阶段崩。cwd 修了不解决问题。
- **去掉 `--config.extraMetadata.version`**：v26 在没这 flag 时也会崩。
- **升 26.15.6**：codesign path 没修，反而引入了新错
  `executableName contains characters ... @divisor-agentapp`
  (Linux AppImage 阶段)。

## 仍未解决的问题

### 1. macOS packaging

**症状**：codesign 阶段报 `packages/app not a file`。
**触发条件**：`CSC_LINK` / `CSC_KEY_PASSWORD` secrets 都为空。
**根因（推测）**：electron-builder v26.x 在 mac 空签名环境里，把 `appDir`
（= `/…/packages/app`）当成 codesign 的 input path 找不到。

**已试、失败**：
- 26.8.1 (原始) ❌
- 26.15.6 (latest 26.x) ❌
- `identity: "-"` ❌（仍走 empty-password 分支）
- `cd packages/app` ❌
- 改用 package.json 控 version ❌

**未试、可能有效**：
- 升到 v27 (latest)，看是否修复 input resolution。
- 用 `iconutil` + 系统 `hdiutil` 自定义 macOS 打包脚本，绕开
  electron-builder 的 mac 打包路径。
- 把 package name 从 `@divisor-agent/app` 改成不带 `@scope`（破坏 workspace
  协议，仅作为 escape hatch）。

### 2. Linux `executableName @-character`

**症状**：`@divisor-agentapp` 在 v26.15.6 的 AppImage 构建里被校验失败。
**根因**：package 名称 `@divisor-agent/app` 在 electron-builder 内部
拼接成 `executableName = @divisor-agentapp`（去 `.`、去 `/`），超出
v26.15.6 的安全字符集。

**已试、失败**：
- v26.8.1 没这错，但 mac 错。
- v26.15.6 引入了这错。

**未试、可能有效**：
- 在 `package.json` 显式 `executableName: divisor-agent-app`（v26 早期 config
  字段支持），让 electron-builder 不去拼。
- 在 electron-builder.yml 的 `linux.executableName` 显式给一个干净字符串。

### 3. 后续计划的诊断路径

按合理顺序：

1. 给 `linux.executableName: divisor-agent-app` + 试 v26.15.6
   （覆盖 #45 的失败）
2. 如果 (1) 后剩 macOS 问题，再升 v27 (如果有)
3. 如果 (2) 仍卡，回头改 `name` (escape hatch)

## 最终建议

**维护者后续决策点**：
- 短期：保留 release.yml 现状不动了，**Linux/Windows artifacts 已能产出**，
  macOS 待 26.x 后续 patch 或升 v27。
- 中期：把上节诊断路径沉淀为 dev doc，每次改后 commit 一次。
- 长期：要么把 `name` 改成不带 `@` 的形式，要么迁移到 Apple 签名+公证
  链路。

## 现状快照（master = `83ba0e6`）

| 链路                          | 状态                                  |
| ----------------------------- | ------------------------------------- |
| Resolve release version       | ✓                                      |
| Validate (`pnpm test`)        | ✓ (10 files / 81 tests / 0 failed)   |
| Build Windows                 | ✓                                     |
| Build Linux                   | ✗ v26.15.6 报 executableName @       |
| Build macOS                   | ✗ v26.x 报 codesign packages/app not a file |
| Publish GitHub release        | 阻塞于 build 失败                       |

## 关键日志位置

- Run `28650596086`：universal lipo 错（首个跑通的 run）
- Run `28651125762`：`--universal` → `--arm64`，仍挂在 `not a file`
- Run `28651548624`：cwd 修复，仍挂在 `not a file`
- Run `28652012621`：version-from-package.json 修复，仍挂在 `not a file`
- Run `28652988976`：ad-hoc sign 修复，仍挂在 `not a file`
- Run `28653610938`：26.15.6 修复，macOS 仍 `not a file`，Linux 加新错
  `@divisor-agentapp`
