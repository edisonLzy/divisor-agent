# Release pipeline packaging 问题定位与修复 — 2026-07-03

## 结论

Release pipeline 已在 PR [#47](https://github.com/edisonLzy/divisor-agent/pull/47)
修复。修复后的 Actions run
[28655132605](https://github.com/edisonLzy/divisor-agent/actions/runs/28655132605)
完成了 macOS、Windows、Linux 三个平台的构建，并发布了
[v0.0.9](https://github.com/edisonLzy/divisor-agent/releases/tag/v0.0.9)。

最终确认了两个互相独立的问题：

1. macOS job 把未配置的 GitHub Secret 注入为一个空字符串 `CSC_LINK`。
   electron-builder 将空字符串当作证书文件路径处理，最后把项目目录
   `packages/app` 当成证书文件，因此报 `packages/app not a file`。
2. electron-builder 26.15.6 从 scoped package 名称 `@divisor-agent/app`
   推导出 Linux 可执行文件名 `@divisor-agentapp`。AppImage 不允许名称中包含
   `@`，因此打包失败。

对应修复为：无证书时从 macOS 打包进程中彻底移除 `CSC_LINK` 和
`CSC_KEY_PASSWORD`；同时显式设置 Linux 的 `executableName: divisor-agent`。

## 背景

接入完整的 `pnpm test` 后，release workflow 的 Validate 阶段首次稳定通过，
随后暴露了此前被挡在验证阶段之后的 packaging 问题。Windows 可以正常构建，
但 macOS 和 Linux 的失败导致矩阵 job 不全绿，最终的 `Publish GitHub release`
job 一直被跳过。

目标失败 run 为
[28654069696](https://github.com/edisonLzy/divisor-agent/actions/runs/28654069696)：

| Job                    | 结果 | 直接错误                                               |
| ---------------------- | ---- | ------------------------------------------------------ |
| Validate               | 成功 | 类型检查和 81 个测试通过                               |
| Build Windows          | 成功 | 安装包已生成并上传为 workflow artifact                 |
| Build macOS            | 失败 | `packages/app not a file`                              |
| Build Linux            | 失败 | `@divisor-agentapp` 不是合法的 AppImage executableName |
| Publish GitHub release | 跳过 | 依赖的 build matrix 未全部成功                         |

## 调试过程

### 1. 逐步排除表象原因

从 PR #40 到 #46 先后尝试了以下方向：

| PR  | 尝试                                            | 结果                                           |
| --- | ----------------------------------------------- | ---------------------------------------------- |
| #40 | 在 release 中运行完整测试                       | Validate 通过，首次暴露 packaging 错误         |
| #41 | macOS 使用 arm64；固定 macOS/Linux artifactName | Linux 恢复，macOS 仍失败                       |
| #42 | 进入 `packages/app` 后直接运行 electron-builder | macOS 仍失败，排除 cwd 问题                    |
| #43 | 通过临时修改 package.json 设置版本              | macOS 仍失败，排除 extraMetadata 问题          |
| #44 | 配置 macOS ad-hoc identity `"-"`                | macOS 仍进入证书导入分支                       |
| #45 | electron-builder 26.8.1 升级到 26.15.6          | macOS 错误不变，Linux 新增 executableName 错误 |
| #46 | 临时回退 electron-builder                       | 恢复到 Linux/Windows 成功、macOS 失败的状态    |

macOS 错误在多次改动后始终保持一致：

```text
empty password will be used for code signing  reason=CSC_KEY_PASSWORD is not defined
⨯ /Users/runner/work/divisor-agent/divisor-agent/packages/app not a file
```

这说明架构、cwd、版本注入方式和 ad-hoc identity 都不是触发错误的第一原因。
日志中的 `empty password will be used for code signing` 反而表明：即使没有证书，
electron-builder 仍然进入了证书导入流程。

### 2. 从 electron-builder 源码确认 macOS 根因

release workflow 在 build job 顶层设置了以下环境变量：

```yaml
env:
  CSC_LINK: ${{ secrets.MACOS_CERTIFICATE }}
  CSC_KEY_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
```

GitHub Actions 会把未配置的 Secret 展开成空字符串，而不是不创建该环境变量。

electron-builder 26.x 的相关调用链如下：

```text
PlatformPackager.getCscLink()
  → 保留空字符串（源码注释：allow to specify as empty string）
MacPackager.codeSigningInfo
  → 仅在 cscLink == null 时跳过证书导入，空字符串不会跳过
createKeychain()
  → importCertificate("")
importCertificate()
  → path.resolve(currentDir, "")
  → /.../packages/app
  → stat.isFile() 为 false
  → 抛出 "packages/app not a file"
```

因此错误信息中的 `packages/app` 并不是待签名的 `.app` 路径，也不是错误的 cwd；
它是空证书路径经过 `path.resolve()` 后得到的项目目录。

这也解释了为什么 `identity: "-"` 没有生效：证书导入发生在 identity 选择之前，
流程尚未到达 ad-hoc signing 就已经失败。

### 3. 确认 Linux 根因

升级到 electron-builder 26.15.6 后，AppImage 阶段报错：

```text
executableName contains characters that cannot be safely used in file paths:
@divisor-agentapp
```

项目的 package name 是 `@divisor-agent/app`。electron-builder 的默认名称推导
保留了 `@`，但 AppImage 的 executableName 校验不接受该字符。artifactName 只控制
最终安装包文件名，无法改变包内可执行文件名，因此此前仅配置 artifactName 不足以
修复该问题。

## 最终修复

### macOS：区分“环境变量不存在”和“值为空”

在 macOS packaging step 中，如果没有证书，先移除两个签名变量：

```bash
NOTARIZE=false
if [[ -z "$CSC_LINK" ]]; then
  unset CSC_LINK CSC_KEY_PASSWORD
fi
if [[ -n "$CSC_LINK" && -n "$APPLE_ID" && -n "$APPLE_APP_SPECIFIC_PASSWORD" && -n "$APPLE_TEAM_ID" ]]; then
  NOTARIZE=true
fi
```

这样处理有两个重要性质：

- 未配置证书时，electron-builder 不再进入证书导入流程，随后使用
  `electron-builder.yml` 中的 ad-hoc identity `"-"`。
- 已配置 `CSC_LINK` 时不会被移除，仍然支持真实 Developer ID 签名；只有 Apple
  公证所需的全部变量齐全时才开启 notarization。

### Linux：显式固定可执行文件名

在 `electron-builder.yml` 中增加：

```yaml
linux:
  executableName: divisor-agent
```

该配置只覆盖包内 executableName，不需要修改 workspace package name，也不会破坏
`workspace:*` 依赖关系。

## 验证过程

### 本地验证

在 macOS arm64 开发机执行了：

- `pnpm --filter @divisor-agent/app typecheck`：通过。
- `pnpm test -- --run`：10 个测试文件通过，81 passed、1 skipped。
- Electron renderer/main/preload production build：通过。
- 清除 `CSC_LINK` 后执行 macOS arm64 packaging：成功生成 DMG、ZIP 和 blockmap；
  日志确认 `identityName=-`。
- Linux x64 AppImage 跨平台构建：成功生成 AppImage，确认 executableName 修复有效。

在 macOS 上跨平台构建 deb 时，electron-builder 下载的 Darwin `gtar` 发生
`Abort trap: 6`。这是 fpm 的宿主工具限制，因此 deb 的最终验证留给 Ubuntu runner，
不能将该错误误判为 Linux 配置回归。

### GitHub Actions 实战验证

PR #47 squash merge 后触发 run
[28655132605](https://github.com/edisonLzy/divisor-agent/actions/runs/28655132605)，
所有 job 均成功：

| Job                    | 结果 | 产物                                     |
| ---------------------- | ---- | ---------------------------------------- |
| Validate               | 成功 | typecheck + 81 tests passed              |
| Build Linux            | 成功 | AppImage、deb、latest-linux.yml          |
| Build macOS            | 成功 | arm64 DMG、ZIP、blockmap、latest-mac.yml |
| Build Windows          | 成功 | x64 setup.exe、blockmap、latest.yml      |
| Publish GitHub release | 成功 | 创建 v0.0.9 并上传全部资产               |

发布版本为
[Divisor Agent 0.0.9](https://github.com/edisonLzy/divisor-agent/releases/tag/v0.0.9)，
目标 commit 为 `6942caa46823fa77b196d81b24131b0dad92d8c6`。

## 维护注意事项

1. 可选 Secret 注入到环境变量后，不要假设“未配置”等于环境变量不存在。
   调用对空字符串敏感的第三方工具前，应显式归一化或 `unset`。
2. macOS 当前使用 ad-hoc signing，适合无 Developer ID 的开发发布，但没有 Apple
   notarization。配置正式证书后应同时验证签名、公证和 Gatekeeper 行为。
3. scoped npm package name、productName、artifactName 和 executableName 是四个不同
   概念。修改安装包显示名不能替代对包内可执行文件名的显式配置。
4. 跨平台打包应以对应 GitHub-hosted runner 的结果为最终依据，本机交叉构建只能用来
   提前验证部分阶段。
5. Actions 当前提示 v4 actions 的 Node.js 20 runtime 已弃用并被强制运行在 Node.js 24。
   该警告不影响本次发布，但后续应升级 checkout、setup-node、artifact actions。
6. release 上传规则当前包含 `packages/app/dist/*.yml`，会连同
   `builder-debug.yml` 一起发布。若要保持 Release assets 精简，可后续改成只匹配
   `latest*.yml`。

## 关键记录

- 原失败 run：
  [28654069696](https://github.com/edisonLzy/divisor-agent/actions/runs/28654069696)
- electron-builder 26.15.6 暴露 Linux 新错误的 run：
  [28653610938](https://github.com/edisonLzy/divisor-agent/actions/runs/28653610938)
- 最终修复 PR：
  [#47](https://github.com/edisonLzy/divisor-agent/pull/47)
- 最终成功 run：
  [28655132605](https://github.com/edisonLzy/divisor-agent/actions/runs/28655132605)
- 最终 Release：
  [v0.0.9](https://github.com/edisonLzy/divisor-agent/releases/tag/v0.0.9)
