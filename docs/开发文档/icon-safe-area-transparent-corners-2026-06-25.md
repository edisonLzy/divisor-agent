# 应用图标：透明背景与 80% 安全区

- **Date:** 2026-06-25
- **Touched:**
  - `packages/app/resources/icon.png`

## Why

最新一版 `packages/app/resources/icon.png`（1254×1254 PNG）有两个问题，直接拿去做应用图标会出现可见瑕疵：

1. **四角黑色**：`sips -g all` 显示 `hasAlpha: no` / `samplesPerPixel: 3`，整张图是纯 RGB；图标的白色 squircle 坐在一块**纯黑底**上，圆角之外的四角是 (1, 1, 1) 这种接近纯黑的实色像素。运行时一旦上层有非黑色背景（Launchpad、亮色 dock、Windows 开始菜单 tile），四角就会显示出明显的黑边。
2. **图标过大**：白色 squircle 占满 1247×1251 / 1254² ≈ **99%** 的画布，几乎贴边。macOS / iOS / 部分 Linux 桌面在渲染时会再叠加一层圆角 mask；图标内容如果贴边，OS 的 mask 会切到 squircle 本体，看上去像是被「咬掉一口」。Apple HIG 的安全区是 ~80.5% 直径的圆；Windows tile 的裁剪也类似。

`packages/app/electron-builder.yml` 之前在 `win.icon` 处把引用改成了 `resources/icon.ico`，但仓库里根本没有 `icon.ico` 这个文件，Windows 打包会直接失败。本次同时把这一行回退成 `resources/icon.png`，让所有平台（default / win / mac / linux）都直接用同一张 PNG，不再依赖一份不存在的 .ico。

## How

### 1. 把背景像素从黑色改成透明

用 Pillow 把每个像素和 (0,0) 角点采样到的颜色对比，容差 8 / 通道以内的全置为 alpha = 0：

```python
from PIL import Image
img = Image.open(src).convert("RGB")
bg = img.getpixel((0, 0))  # 角点是 (1, 1, 1)
rgba = img.convert("RGBA")
pixels = rgba.load()
threshold = 8
for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x, y]
        if abs(r - bg[0]) <= threshold and abs(g - bg[1]) <= threshold and abs(b - bg[2]) <= threshold:
            pixels[x, y] = (r, g, b, 0)
```

处理结果：

- alpha 通道从无 → 有（`hasAlpha: yes`，`samplesPerPixel: 4`）。
- 四个角点 (0,0) / (W-1, 0) / (0, H-1) / (W-1, H-1) 都变成 `(0, 0, 0, 0)`。
- 移除了 97 728 个背景像素（占整图 6.2%），其余像素原样保留，色彩没有损失。

### 2. 内容缩放到 80% 安全区居中

把处理过的 RGBA 取 alpha bbox，然后用 Pillow 的 `Image.LANCZOS` 重采样到目标尺寸，贴回一张 1254×1254 的透明画布正中：

```python
target = int(min(w, h) * 0.80)        # ≈ 1003 px
cropped = rgba.crop(bbox)              # 裁出紧贴内容的区域
scale = target / max(cropped.size)
resized = cropped.resize((round(w*scale), round(h*scale)), Image.LANCZOS)

canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
canvas.paste(resized, ((w - resized.width)//2, (h - resized.height)//2), resized)
canvas.save(dst, format="PNG", optimize=True)
```

处理结果：

- 内容 1247×1251 → 1000×1003（缩放系数 0.802×）。
- 四周 padding：左 127 / 右 127 / 上 125 / 下 126 像素（≈ 画布的 10%）。
- 文件体积从 875 KB 降到 642 KB（去掉了大量纯黑像素 + 缩小后 LANCZOS 压缩更友好）。

### 3. `electron-builder.yml` 的 `win.icon` 回退

之前未提交的改动把 `win.icon` 改成 `resources/icon.ico`，但仓库里没有这个文件，会让 Windows 打包在 `icon.ico not found` 这一步直接挂掉。回退为 `resources/icon.png`，和 `default / mac / linux` 三处保持一致：

```yaml
win:
  executableName: app
  icon: resources/icon.png
```

代价：Windows 任务栏 / 开始菜单里只会嵌入单一尺寸的图标（PNG -> electron-builder 转 ICO 时只能塞下一个 size）。如果之后要求 Windows 在多 DPI 下都清晰，可以从这张 PNG 重新生成一份 `resources/icon.ico`（包含 16/24/32/48/64/128/256 等多个 size），再单独开一个 PR 引入 `win.icon: resources/icon.ico`。本次不做。

## 跨平台渲染效果

- **macOS dock / Launchpad**：四角透明，OS 的圆角 mask 直接盖到 squircle 边缘；亮色 / 暗色 dock 下都不会再看到黑边。
- **macOS packaged**：electron-builder 在打包时把 `resources/icon.png` 重新生成 `Contents/Resources/icon.icns`，透明背景会保留。
- **Windows 任务栏 / 开始菜单**：PNG 单尺寸嵌入；亮色磁贴下四角和桌面背景融合，不再有黑边。
- **Linux（AppImage / snap / deb）**：透明 PNG 在所有主流 desktop entry 渲染器里都正常。
- **dev 模式 `pnpm dev:app`**：`src/main/index.ts` 里 `resolveAppIconPath()` 仍然指向 `resources/icon.png`，macOS 通过 `app.dock.setIcon()` 把这张修好的 PNG 写进 dock。

## 后续可考虑

- 如果以后想给 Windows 多 DPI 体验，从这张 1254² 的 PNG 跑一份 `png2ico` 或 `imagemagick` 的 `convert icon.png -define icon:auto-resize=256,128,96,64,48,32,24,16 icon.ico` 出来，再单独一个 commit 把 `win.icon` 切回去。
- 当前 `packages/app/build/icon.png / icon.icns / icon.ico` 三份旧图标（`directories.buildResources: build` 时代产物）已无人引用，可在单独的清理 PR 里删掉（commit `13feb3d` 的 dev doc 也提过这一点）。
