# pnpm allowBuilds 配置：deny @google/genai 跑 build script

> 日期:2026-06-23
> 范围:`pnpm-workspace.yaml` 单文件
> 影响:`pnpm install` 输出,无运行时影响

## 一、背景(Why)

`pnpm i` 每次跑完都会在结尾打两行:

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @google/genai@1.52.0
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

`@google/genai` 是 `@earendil-works/pi-ai@0.74.0` 的间接依赖(经由 pi-agent-core 传入),项目代码里**没有任何 `import "@google/genai"`**。查看其 `package.json` 的 `scripts.prepare`:

```js
"prepare": "node scripts/prepare.js"  // 上游维护者跑的 patch-package + rollup + api-extractor
```

但该 npm 包已经包含完整 prebuilt `dist/`,消费方根本不需要重新跑构建。所以这条警告是**纯噪音**,应该消掉。

## 二、核心决策(Why,重点)

### 2.1 用 `allowBuilds` 而不是 `onlyBuiltDependencies`

pnpm 11+ 同时支持两个等价机制来控制 install lifecycle scripts:

| 字段 | 位置 | 形态 | 语义 |
| --- | --- | --- | --- |
| `pnpm.onlyBuiltDependencies` | 根 `package.json` 的 `pnpm` 段 | 字符串数组 | **白名单**:只列允许的 |
| `allowBuilds` | `pnpm-workspace.yaml` | `Record<string, boolean \| string>` | **按包粒度**:`true` / `false` / `'warn'` |

选 `allowBuilds` 的理由:

- `onlyBuiltDependencies` 只能列**白名单**,deny 某个包只能靠"不列入"。但 5 个包里有 4 个需要跑脚本(`electron`、`electron-winstaller`、`esbuild`、`protobufjs`),白名单上会有大量"噪音项"。
- `allowBuilds` 的 `false` 明确表达"拒绝",意图直接,review 时一眼能看出 `@google/genai` 是显式 deny。

### 2.2 我之前的错误判断 + 复盘

最初给的建议是把 `allowBuilds` 改成 `onlyBuiltDependencies`,理由是"`allowBuilds` 在项目里没被引用过,可能是死配置"。这是**错的**,对齐官方后纠正:

`pnpm/config/reader/src/Config.ts` 里:

```ts
allowBuilds?: Record<string, boolean | string>
```

这是 pnpm 11 官方 schema,在 `pnpm-workspace.yaml` 里完全合法。`pnpm config list` 也能 dump 出当前值,证明 pnpm 确实在读。

**教训**:

> grep "项目内引用"≠"字段是否存在"。配置 schema 应该查 source of truth(pnpm 源码 / 官方 docs),不能靠间接证据推断。
>
> 另:`pnpm-workspace.yaml` 是 pnpm 的扩展点之一,自定义字段会被静默接受但不被消费;`allowBuilds` 不是自定义字段,但类似 yaml 配置文件出现"看起来像配置、实际无人读"的 key 时,要先验证再下结论。

### 2.3 占位字符串陷阱(原 yaml 的坑)

修复前的文件长这样:

```yaml
allowBuilds:
  '@google/genai': set this to true or false
  electron: set this to true or false
  electron-winstaller: set this to true or false
  esbuild: set this to true or false
  protobufjs: set this to true or false
```

字面值 `set this to true or false` 看起来像注释,但 YAML 把它解析成**字符串值**。`allowBuilds` 的类型 `Record<string, boolean | string>` 接受任意 string,**不校验语义**:

- `true` / `false` / `'warn'` → 按预期生效
- 其他字符串(包括占位符) → **静默 no-op**(不报错、不警告、不生效)

所以原文件表面"已配置 5 个包",实际一个都没生效,pnpm 走默认策略 → 警告照旧。

**教训**:

> 配置文件里用作"待填"的占位符要选 pnpm 一定不会误识别的写法。比如 `null`(yaml 里写 `~` 或干脆不写 key)比 `"set this to true or false"` 安全。
>
> 写完配置一定要做"反向验证":这次是 `pnpm i` 看警告是否消失。配置如果只是"写了但没生效",没有显式信号很容易漏掉。

## 三、变更内容(How)

### 3.1 `pnpm-workspace.yaml`

把 5 个占位字符串替换为真正的布尔值,按意图:

- `@google/genai`: `false`(deny,prepare 脚本对消费方无意义)
- 其余 4 个: `true`(它们本来就在跑,electron-builder 需要)

```yaml
allowBuilds:
  '@google/genai': false   # 该包的 prepare 脚本对消费方无意义(dist 已 prebuilt),不跑
  electron: true
  electron-winstaller: true
  esbuild: true             # electron-builder 依赖,需要 postinstall
  protobufjs: true
```

### 3.2 验证

```
$ pnpm i
...
Already up to date
. prepare$ husky
. prepare: Done
packages/app postinstall$ electron-builder install-app-deps
packages/app postinstall:   • installing native dependencies  arch=arm64
packages/app postinstall:   • completed installing native dependencies
packages/app postinstall: Done
Done in 2.9s using pnpm v11.5.0
```

| 检查项 | 结果 |
| --- | --- |
| `Ignored build scripts: @google/genai@1.52.0` 警告 | ✅ 消失 |
| `pnpm approve-builds` 提示 | ✅ 消失 |
| `electron-builder install-app-deps` 仍运行 | ✅ 通过(electron / esbuild 仍在白名单) |
| 其他 lifecycle scripts(husky prepare 等) | ✅ 通过 |
| 总耗时 | 758ms+1.3s → 2.9s(差距可忽略) |

## 四、影响面与兼容窗口

### 4.1 运行时影响:零

- `@google/genai` 的 `prepare` 脚本本来就是上游开发期用的,跑不跑不影响它的 `dist/` 输出
- 业务代码无 `import "@google/genai"`,运行时 API 调用经由 `pi-ai` 包走 Google 官方 SDK 的 prebuilt JS,完全无感

### 4.2 兼容性

- `allowBuilds` 需要 **pnpm ≥ 11**,项目 `packageManager` 已锁 `pnpm@11.5.0`,无外部兼容性压力
- pnpm 升级如果未来 deprecate 此字段,可平滑迁移到 `onlyBuiltDependencies`:把 `false` 项从白名单移除即可

### 4.3 风险点

- **静默失效**:写错成非 `true`/`false`/`'warn'` 字符串时 pnpm 不报错。**缓解**:改完跑一次 `pnpm i` 反向验证警告状态。
- **deny 包之后上游加新脚本**:如果 `@google/genai` 未来某个版本改 `dist/` 为 source-only 必须跑 prepare,需要在白名单里改 `true`。**缓解**:`pnpm i` 的 `ERR_PNPM_IGNORED_BUILDS` 会再次出现作为信号,不会静默坏掉。

## 五、回顾(教训 / 后续)

1. **配置 schema 是 source of truth,grep 不是**。判断一个配置项"是否有效"必须查 schema 定义(`pnpm/config/reader/src/Config.ts`)或官方 docs,不能用项目内引用计数推断。
2. **配置文件占位符选型**:`null` / 不写 key 比带提示语的字符串更安全 —— 后者会被 schema 接受并静默 no-op。
3. **配置写完要反向验证**:配置文件"看起来写对了"和"实际生效"是两回事,任何配置改动都应该有一个能跑的命令验证副作用(这次是 `pnpm i` 的输出)。
4. **deny-by-default 比 allow-by-default 信息密度更高**:用 `allowBuilds` 显式标 `false` 比 `onlyBuiltDependencies` 用"不列"表达拒绝,可读性更好 —— 5 个包里有 1 个 deny 时一眼能看到拒绝意图。

## 六、待办

- [ ] (可选)给 `pnpm-workspace.yaml` 加 CI 校验:跑 `pnpm i` 并 grep `ERR_PNPM_IGNORED_BUILDS`,出现就 fail。保护未来新增依赖时不会忘记处理。
- [ ] (可选)cspell 字典加 `genai` / `winstaller` / `protobufjs` 等包名,消除 lint 噪音(不影响功能,只是编辑器体验)。
- [ ] 留意 `@google/genai` 上游动向:如果未来切换到 source-only 发布模式,需要回到 `pnpm-workspace.yaml` 把 `false` 改成 `true`,否则真实构建会缺产物。
