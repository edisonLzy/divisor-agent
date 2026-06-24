# macOS dock 图标显示默认 Electron 图标

- **Date:** 2026-06-25
- **Touched:**
  - `packages/app/src/main/index.ts`

## Why

`packages/app/electron-builder.yml` 和 `packages/app/src/main/index.ts` 的 `BrowserWindow` 构造选项都已经把 `icon` 指向 `resources/icon.png`，但 macOS 启动后 dock 栏和 Launchpad 仍然显示默认 Electron 图标。`pnpm dev:app`（dev 模式）下复现：dock 图标是 Electron 默认那张。

原因在 Electron 的运行时分工：

| 入口 | 影响范围 |
|------|---------|
| `BrowserWindow({ icon })` | Windows 任务栏 / Linux 窗口图标 |
| `app.dock.setIcon(path)` | **macOS dock 与 Launchpad** |
| `Contents/Resources/icon.icns`（打包产物） | 打包后的 macOS 应用图标（Finder / Launchpad / Spotlight） |

`BrowserWindow.icon` 在 macOS 上对 dock 是无效的，frameless 窗口本来就没有标题栏，这个选项在 macOS 上几乎是装饰性的。Commit `13feb3d`（"fix(app): configure icon and address review comments"）已经配置了 `electron-builder.yml`（默认 + win + mac + linux 四处都指向 `resources/icon.png`）以及 `BrowserWindow.icon`，但漏掉了运行时 macOS 的 `app.dock.setIcon()`，所以 dev 启动后 dock 仍然是 Electron 默认图标。

打包场景下，`mac.icon: resources/icon.png` 配合 `asarUnpack: resources/**` 会让 electron-builder 在打包时把 `icon.png` 转成 `icon.icns` 写入 `Contents/Resources/`，运行时不需要 `app.dock.setIcon()` 也能拿到正确图标——但 dev 模式跑的是 `out/main/index.mjs`，并没有现成的 `.icns`，所以必须显式调用。

## How

### 1. 抽出图标路径解析

dev 和 packaged 两种模式下图标位置不一样，写一个 helper 统一：

```ts
function resolveAppIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "resources", "icon.png");
  }
  return join(__dirname, "../../resources/icon.png");
}
```

- dev：`__dirname` 是 `packages/app/out/main`，`../../resources/icon.png` 解析到 `packages/app/resources/icon.png`。
- packaged：`asarUnpack: resources/**` 把 `resources/` 整体搬到 `app.asar.unpacked/`，electron-builder 在 macOS 上把它放在 `<Contents/Resources>/resources/`，运行时通过 `process.resourcesPath` 访问。

`BrowserWindow.icon` 也改成调用同一个 helper，避免 dev / packaged 两套路径散落在两处。

### 2. macOS 启动后设置 dock 图标

```ts
app.whenReady().then(async () => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(resolveAppIconPath());
  }
  // ...
});
```

`app.dock` 在 Electron 类型上是 `(Dock) | undefined`，只在 darwin 上非空，所以加 `process.platform` + 真值判断两重保险即可。必须在 `app.whenReady()` 之后调用，否则 dock 还没初始化。

为什么放在 `app.whenReady()` 顶部而不是每个 `BrowserWindow` 创建里：dock 图标是「应用级」而不是「窗口级」，跟窗口实例无关，启动时设置一次就够了。`app.on("activate")` 触发的 `createWindow` 不再重复设置。

### 3. 跨平台行为

- macOS dev：现在 dock 显示 `resources/icon.png`。
- macOS packaged：dock 由 `Contents/Resources/icon.icns` 决定（electron-builder 从 `resources/icon.png` 自动生成），运行时调用 `app.dock.setIcon` 会被 icns 覆盖——保持 idempotent，无副作用。
- Windows / Linux：`BrowserWindow.icon` 生效；`app.dock.setIcon` 由于 `process.platform !== "darwin"` 守卫而被跳过。

## 后续可考虑

- `packages/app/build/` 目录下还有 `icon.icns`、`icon.ico`、`icon.png` 三个旧图标文件，是之前 `directories.buildResources: build` 时代的产物。现在所有平台都显式指定 `icon: resources/icon.png`，这三个文件已经不再被 electron-builder 引用，留在仓库里只是噪音；可以在单独一个清理 PR 里删掉。
