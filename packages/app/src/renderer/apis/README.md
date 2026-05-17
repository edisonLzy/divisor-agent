# apis

Renderer 层的 API 请求方法目录。每个文件按功能模块划分，包含该模块的所有请求方法。

## 文件结构

每个 API 方法遵循以下结构：

```typescript
/** 请求参数类型 */
export interface XxxRequest {
  // ...
}

/** 请求响应类型 */
export interface XxxResponse {
  // ...
}

/** 发起请求 */
export function xxx(req: XxxRequest): Promise<XxxResponse> {
  // ...
}
```

## 现有模块

| 文件          | 说明                               |
| ------------- | ---------------------------------- |
| `sessions.ts` | 会话相关请求（创建、查询、更新等） |
