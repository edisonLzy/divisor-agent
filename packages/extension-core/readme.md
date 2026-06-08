# extension 系统设计

## usage

```ts
const extension = defineExtension((ctx) => {
  // 自定义系统提示词
  ctx.injectSystemPrompt("");
  // 监听AgentEvent
  ctx.on("");
  // 注册工具
  ctx.registerTool({});
  // 注册 slash command
  ctx.registerCommand({});
});
```
