# Voice Input:Deepgram 鉴权从 ?token= 改为主进程注入 Authorization 头

> 日期:2026-07-08<br>
> 分支:`feature/voice-input`<br>
> 关联:`2026-07-07/voice-input-deepgram-adapter.md`(适配器模式与 `?token=` 方案)

## 背景:为什么 ?token= 方案上线即失败

前一版适配器(见关联文档)按 Deepgram 浏览器示例,把 API Key 作为 `?token=<key>` 查询参数拼进 WebSocket URL:

```
wss://api.deepgram.com/v1/listen?token=<key>&model=nova-3&language=zh-CN&...
```

点击语音输入即报错:`HTTP Authentication failed; no valid credentials available`,WebSocket 握手被 Deepgram 以 401 拒绝。

## 根因:Deepgram 拒绝原始 API Key 走 ?token=

经验证(同一把 Key):

| 鉴权方式 | 结果 |
|---------|------|
| `?token=<raw key>` 查询参数 | 401 `INVALID_AUTH` "Invalid credentials."(curl 与应用内均复现) |
| `Authorization: Token <key>` 请求头 | 鉴权通过,真实 `ws` 推流收到 `Results`(正常工作) |

也就是说 Key 本身有效、有流式权限,问题出在**鉴权方式**:Deepgram 的 `/v1/listen` 不接受把原始 API Key 放进 `?token=`(返回 `INVALID_AUTH`),只接受 `Authorization` 头。

而浏览器/Electron 渲染进程的 `WebSocket` API **无法设置请求头**--这是平台限制,不是 Deepgram 限制。所以渲染进程既不能用 `?token=`(被拒),又不能设 `Authorization` 头(做不到),陷入死局。

> 上一版文档把 Deepgram 鉴权写成 "Token 查询参数" 并标注"待办:production 手测",说明该路径此前并未端到端验证过,实际不可用。

## 决策:主进程通过 webRequest 注入鉴权头

比选了三种方案:

| 方案 | 评价 |
|------|------|
| **主进程 `session.webRequest` 注入头**(采用) | 渲染进程仍用原生 WebSocket 直连 Deepgram,音频不经 IPC;主进程在网络层把 `Authorization` 头补进 Deepgram 的 WS 握手请求。改动最小、零音频 IPC 开销、Key 不进 WS URL。 |
| 主进程起 `ws` 连接 + IPC 转发音频/转写 | 能设头,但 16kHz PCM16 ≈ 32KB/s 要走 IPC,实时性差;需引入 `ws` 依赖;适配器逻辑全部搬进主进程。 |
| 服务端代理(`packages/server`)| 生产环境 server 可能是远程(`codemo.asia`),语音走远程代理延迟高;且 STT 本应是本地能力。 |
| Deepgram 临时 token | 未找到公开的签发端点(`/v1/authenticate` 404);即便有也要服务端持 Key 签发,架构位移与主进程方案相当,却多一层 token 过期/刷新。 |

采用方案一。Electron 39 的 `webRequest` 会拦截 WebSocket 握手请求(`details.resourceType === "webSocket"`),`onBeforeSendHeaders` 可改写 `requestHeaders`,配合 `{ urls, types: ["webSocket"] }` 过滤器精确命中 Deepgram 连接。

## 实现

### 1. 主进程注入鉴权头(`src/main/stt/index.ts`,新增)

```ts
export function registerDeepgramAuth(): void {
  if (!DEEPGRAM_API_KEY) return;
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["wss://api.deepgram.com/*"], types: ["webSocket"] },
    (details, callback) => {
      callback({
        requestHeaders: { ...details.requestHeaders, Authorization: `Token ${DEEPGRAM_API_KEY}` },
      });
    },
  );
}
```

- Key 来自 `import.meta.env.VITE_DEEPGRAM_API_KEY`。electron-vite 给主进程设了 `envPrefix = ['MAIN_VITE_', 'VITE_']`,所以 `VITE_` 前缀的 env 会在主进程以 `import.meta.env` 内联。注意 `process.env.X` 在主进程是运行时 Node env,**不会**读 `.env` 文件,必须用 `import.meta.env`。
- 过滤器限定 `wss://api.deepgram.com/*` + `webSocket`,Key 只发给 Deepgram,不外泄到其它域。
- 在 `app.whenReady()` 里调用一次(不在 `createWindow` 里,避免窗口重建时叠加监听)。

### 2. 主进程类型补声明(`src/main/env.d.ts`,新增)

`electron-vite/node` 的 `ImportMetaEnv` 只有 `MODE/DEV/PROD`,没有索引签名,`import.meta.env.VITE_DEEPGRAM_API_KEY` 在主进程会报 TS 错。补一个全局接口合并声明(镜像渲染进程的 `env.d.ts`):

```ts
/// <reference types="electron-vite/node" />
interface ImportMetaEnv {
  readonly VITE_DEEPGRAM_API_KEY?: string;
}
```

### 3. 渲染进程适配器去掉 ?token=(`deepgram-adapter.ts`)

```diff
- url.searchParams.set("token", this.config.apiKey);
```

URL 不再携带 Key,鉴权完全由主进程注入的头负责。其余参数(model/language/encoding/sample_rate/channels)不变。

### 4. 主进程入口注册(`src/main/index.ts`)

```ts
import { registerDeepgramAuth } from "./stt/index.js";
app.whenReady().then(() => {
  registerDeepgramAuth();
  // ...
});
```

## 未改动的部分(刻意)

`use-voice-input.ts` 与 `prompt-input/index.tsx` 仍读 `import.meta.env.VITE_DEEPGRAM_API_KEY` 做"是否已配置"的闸门(空 Key 时 toast `请先配置语音识别 API Key`)并传给适配器;适配器只是不再把它放进 URL。这样保留原 UX、改动最小,`apiKey` 检查仍作为"是否配置 STT"的判断。

## Key 管理

`.env.development` / `.env.example` / `.env.production` 只提交**空占位** `VITE_DEEPGRAM_API_KEY=`,真实 Key 走 `.env.local` / `.env.<mode>.local`(不入库),与 `.env.example` 里的本地覆盖约定一致。

> 取舍:Key 目前仍会进渲染进程 bundle(`prompt-input` 引用了 `import.meta.env.VITE_DEEPGRAM_API_KEY`)。后续可选加固:移除渲染进程对该 env 的引用、把 `STTConfig.apiKey` 改为可选,让 Key 只存在于主进程。本次 bugfix 不做。

## 验证

- 手测:`pnpm dev:app` -> 点击语音输入,DevTools Network 应看到 `wss://api.deepgram.com/v1/listen?model=...`(无 `?token=`)握手 101,转写正常流出。
- curl 复现根因:`curl -i ... 'https://api.deepgram.com/v1/listen?token=<key>&model=nova-3'` -> 401 `INVALID_AUTH`;同 Key 加 `-H 'Authorization: Token <key>'` -> 鉴权通过。

## 附:同日志里的另一个无关告警

报错日志里还有一条 `Encountered two children with the same key, "thinking-Now I have a good un"`。这与语音输入无关,是 `assistant-message.tsx` 用 `key={`thinking-${block.thinking.slice(0, 20)}`}` 导致两条 thinking 块前 20 字相同时 key 撞车。单独修,不在本次范围内。
