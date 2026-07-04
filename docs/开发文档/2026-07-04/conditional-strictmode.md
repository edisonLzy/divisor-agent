# Conditional StrictMode (2026-07-04)

## Why

StrictMode 在开发环境下会 mount → unmount → remount 组件，导致 TipTap editor 实例被重复创建销毁。这干扰了依赖 `onCreate`/`onDestroy` 生命周期的 `sharedPromptEditor` cell，也影响开发者调试 editor 相关逻辑（unmount 时 editor 引用被置 null，中间有空窗期）。

但 StrictMode 在开发环境下有额外检查（检测副作用、不安全的生命周期等），项目仍希望在**生产构建**中保留 `StrictMode` 包裹。

## How

`packages/app/src/renderer/main.tsx` 使用 Vite 内置的 `import.meta.env.DEV` 条件渲染：

```ts
createRoot(document.getElementById("root")!).render(
  import.meta.env.DEV ? (
    <App />
  ) : (
    <StrictMode>
      <App />
    </StrictMode>
  ),
);
```

- 开发模式（`electron-vite dev`）→ `import.meta.env.DEV = true` → 无 `StrictMode`
- 生产构建（`electron-vite build`）→ `import.meta.env.DEV = false` → 有 `StrictMode`

`packages/app/src/renderer/shim.d.ts` 补充了 `ImportMetaEnv` 类型声明以通过 type-check。

## Trade-offs / Notes

- StrictMode 在生产构建中仅在有 `react-dom` development mode 时有效；production build 下 React 本身已跳过 StrictMode 的双调逻辑，所以生产环境的 StrictMode 实际是空包裹。但保留它符合 React 官方推荐的入口规范，且未来如果 React 在 production 中加入 StrictMode 行为也不会遗漏。
- 改用 `import.meta.env.PROD` 也可以（`import.meta.env.PROD ? <StrictMode><App /></StrictMode> : <App />`），二者互为否定，语义等价。
- 此方案同时消除了之前 `StrictMode` import 未使用的 TS 编译错误。
