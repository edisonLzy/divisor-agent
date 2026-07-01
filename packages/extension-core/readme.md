# @divisor-agent/extension-core

Divisor Agent 的构建期 Extension API。

## Entrypoints

- `@divisor-agent/extension-core/common`：共享 metadata、IPC contract、transport 类型和 block/artifact helpers。
- `@divisor-agent/extension-core/main`：`defineMainExtension`、main bridge、工具、system prompt、runtime、IPC 和 session 生命周期 API。
- `@divisor-agent/extension-core/renderer`：`defineRendererExtension`、`createUseExtensionIPC` 和 renderer 注册 API。

完整用法见 `docs/开发文档/extension.md`。
