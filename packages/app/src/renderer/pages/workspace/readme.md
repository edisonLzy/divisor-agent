# 重构 workspace 模块

## context

### 接口

0. base url: localhost:3000
1. 获取session列表接口: /v1/agent/sessions
2. 查询session详情接口: /v1/agent/session/:id

### server实现

1. /Users/zhiyu/Desktop/coding/neon-server/packages/api-gateway/src/routes/agent.routes.ts

## input data

### 新增 use-subscribe-agent-events

1. type safe

```tsx
useSubscribeAgentEvents({
  agent_start: (event) => {},
  agent_end: (event) => {},
});
```

### sessions管理

#### 初始化

1. sessions 调用接口获取 session 列表并设置到 store 中.

2. workspace/index.tsx 订阅 main 的事件(`use-subscribe-agent-events`).
   2.1. update: 更新 sessions store中对应session的entry, 更新session状态.
   2.2. completed: 调用接口初始化到数据库中, 更新session状态为完成态.

#### 切换会话

1. 调用接口查询session对应的entires并更新store对应的session的entires.
   1.1 如果前端store中该session已经存在entires,则不需要再调用后端接口,直接使用store中的entires即可.
   1.1.1 你需要帮我评估下该方案是否合理.

2. 调用 main 的 setSessionId 方法, 创建/获取 该sessionId对应的agent.

3. 同步更新store中的activeSessionId状态.

### chat

#### 初始化

1. 消费store中的activeSessionId,获取 active session 的entires, modal, workspace.

2. 订阅 main事件(`use-subscribe-agent-events`) 更新 session 的entires状态
   2.1 参考现有的 use-chat.tsx

#### 发送消息

1. 2.1 参考现有的 use-chat.tsx

## 验收标准

1. session列表正常渲染, 点击session列表项可以正常切换会话.
2. 选择会话之后, 发送消息,可以正确渲染 agent 响应的消息.

## 约束

1. 使用 react-query 完成数据请求
