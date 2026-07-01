# BrowserWindow 与应用运行时生命周期

## 背景

Main Extension 需要访问当前窗口并向 renderer 发送 IPC。这里不能把首次创建的 `BrowserWindow` 长期传给 `AgentPool` 或 `ExtensionService`，因为 Electron 应用和窗口并不共享同一个生命周期。

## Electron 生命周期

- `app.whenReady()` 后才能创建 `BrowserWindow`。
- `hide`、`minimize` 只改变窗口状态，不会销毁窗口。
- 用户点击关闭按钮或调用 `window.close()` 时会先触发 `close`；如果没有被取消，随后销毁原生窗口和 `webContents` 并触发 `closed`。此后 `window.isDestroyed()` 为 `true`，旧实例不应继续使用。
- `window.destroy()` 会跳过可取消的关闭流程，直接销毁窗口，但仍会触发 `closed`。
- 最后一个窗口关闭后会触发 `window-all-closed`。Windows/Linux 通常退出应用；本项目在 macOS 上保留主进程。
- macOS 用户重新激活应用时触发 `activate`，此时会创建新的 `BrowserWindow`。新旧窗口是两个不同实例。
- `app.quit()` 的应用退出流程与单独关闭窗口不同；退出阶段会关闭窗口并结束主进程。

## 本项目的生命周期边界

`AgentPool`、`ExtensionRuntimeService` 和 `ExtensionService` 属于应用生命周期，只在 `app.whenReady()` 后初始化一次。`BrowserWindow` 属于窗口生命周期，在 macOS 上可以关闭后重新创建。

因此，应用通过可变的当前窗口引用和必填 getter 连接两个生命周期：

```ts
let browserWindow: BrowserWindow | null = null;

function getBrowserWindow() {
  if (!browserWindow || browserWindow.isDestroyed()) return null;
  return browserWindow;
}
```

- AgentPool、普通 IPC 事件转发和 Main Extension 共享同一个 `getBrowserWindow`。
- `activate` 创建新窗口并更新 `browserWindow` 后，后续事件会自动发往新窗口，无需重建 AgentPool。
- 无窗口或窗口已销毁时 getter 返回 `null`；面向 renderer 的事件直接丢弃。
- Extension 可以调用 `ctx.getBrowserWindow()`，但不得缓存返回的窗口实例。
- 不使用 `BrowserWindow.getAllWindows()[0]` 隐式选择窗口，避免未来出现辅助窗口时把事件发往错误目标。

## 退出清理

当前入口在 `quit` 中解绑 IPC 并调用 `agentPool.destroyAll()`。Electron 不会等待异步 listener 完成，因此这是 best-effort 清理；进程退出后的纯内存资源无需额外等待。

如果以后 disposer 包含必须完成的持久化、外部进程回收或远程通知，应改为在 `before-quit` 中阻止首次退出，等待 `destroyAll()` 完成后再调用 `app.quit()`，并使用状态标记避免递归阻止。
