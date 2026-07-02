# Divisor Agent UI 设计规范

> 状态：当前生产 UI 的设计基线<br>
> 适用范围：Electron Renderer、Workspace、Session、Chat、Artifact、Settings、Dialog、Toast 及后续新增功能<br>
> 设计原型：`docs/原型/electron-variant-01-split-context-bars.html`<br>
> 样式真相源：`packages/app/src/renderer/index.css`

## 1. 设计目标

Divisor Agent 采用一种紧凑、直接、具有工具感的桌面 UI：暖色画布、清晰的黑色结构线、低圆角、硬边阴影，以及少量高饱和信号色。

新增功能必须满足以下原则：

1. **功能优先**：视觉样式服务于现有信息架构，不为装饰新增页面、操作或状态。
2. **分区清晰**：Session、Chat、Artifact、Settings 等区域各自拥有独立上下文 Header，不使用跨区域的全局品牌 Header。
3. **高信息密度**：适合桌面 Agent 工作流；减少大留白、巨型圆角卡片和不必要的容器嵌套。
4. **状态可辨识**：黄色、粉色、青色、绿色、紫色分别承担稳定的语义角色，而非随机装饰。
5. **原生桌面感**：正确处理 Electron 拖拽区域、macOS 红绿灯和 Windows/Linux 标题栏按钮。
6. **主题一致**：所有新增界面必须同时支持 light、dark 和 system，禁止只为一种主题写死颜色。

## 2. 视觉语言

### 2.1 核心特征

- 2px 高对比边框和分隔线
- 2–3px 无模糊硬阴影
- 6px 左右的小圆角
- 暖白/暖黑背景，而不是纯白或冷灰
- Space Grotesk 作为界面字体，Space Mono 作为代码和机器状态字体
- Lucide 作为统一图标系统
- 粉色用于主要创建入口，黄色用于激活/强调，青色用于 Agent/信息，绿色用于成功，紫色用于 Artifact

### 2.2 不应出现

- 大面积渐变、玻璃拟态或模糊阴影
- 胶囊化所有按钮和标签
- 无语义的彩色装饰块
- 为每一段内容套一层 Card
- 使用 Emoji、文本字符、手绘 SVG 或 CSS 图形代替 Lucide/真实资源
- 新建第二套颜色、阴影、圆角或按钮体系
- 在 Workspace 顶部重新加入品牌 Logo、描述、主题切换或设置按钮

## 3. Design Tokens

新增样式必须优先使用语义 token，不直接写十六进制颜色。token 定义位于 `packages/app/src/renderer/index.css`。

### 3.1 Light

| Token                | 值        | 用途                    |
| -------------------- | --------- | ----------------------- |
| `--background`       | `#fffaf0` | 页面与 Chat 主画布      |
| `--foreground`       | `#141111` | 主文字与结构线          |
| `--card`             | `#fffdf8` | Card、Composer、Popover |
| `--secondary`        | `#f1ede3` | 次级表面                |
| `--muted`            | `#eee9de` | 弱化区域                |
| `--muted-foreground` | `#716b64` | 次级文字                |
| `--accent`           | `#ffd440` | 激活项、强调操作        |
| `--destructive`      | `#df5148` | 危险操作                |
| `--ring`             | `#27ccf3` | Focus ring              |
| `--sidebar-primary`  | `#fe7da8` | 新对话等主入口          |
| `--signal-cyan`      | `#27ccf3` | Agent、信息状态         |
| `--signal-green`     | `#a8df72` | 成功状态                |
| `--signal-purple`    | `#bbb0e6` | Artifact 区域           |

### 3.2 Dark

| Token                     | 值        | 用途                    |
| ------------------------- | --------- | ----------------------- |
| `--background`            | `#11100f` | 页面与 Chat 主画布      |
| `--foreground`            | `#f3eee5` | 主文字与结构线          |
| `--card`                  | `#191715` | Card、Composer、Popover |
| `--secondary` / `--muted` | `#24211e` | 次级表面                |
| `--muted-foreground`      | `#aaa39a` | 次级文字                |
| `--accent`                | `#d7ad2f` | 激活项、强调操作        |
| `--destructive`           | `#ef7469` | 危险操作                |
| `--sidebar-primary`       | `#dc6e98` | 新对话等主入口          |
| `--signal-cyan`           | `#31b6d6` | Agent、信息状态         |
| `--signal-green`          | `#91c866` | 成功状态                |
| `--signal-purple`         | `#9f92d0` | Artifact 区域           |

### 3.3 Shape 与 Elevation

```css
--radius: 0.375rem; /* 6px */
--hard-shadow: 3px 3px 0 var(--border);
--hard-shadow-sm: 2px 2px 0 var(--border);
```

- 主容器、Card、Composer：`rounded-md` 或 `rounded-lg`，不可升级为大圆角。
- 主要表面：`border-2 border-border shadow-[var(--hard-shadow)]`。
- 小按钮：`border-2` + `--hard-shadow-sm`。
- Hover/Active：元素平移 1px 并移除阴影，表现为真实按压，而不是增加发光。
- 普通列表行不使用阴影；只有选中项、可提交控件或浮层使用硬阴影。

## 4. Typography

| 场景               | 字体与建议                                               |
| ------------------ | -------------------------------------------------------- |
| UI 主字体          | `Space Grotesk Variable`, `PingFang SC`, sans-serif      |
| 代码、状态、快捷键 | `Space Mono`, monospace                                  |
| 页面标题           | 20–32px，`font-bold`，仅用于 Settings 页面或明确的空状态 |
| Panel Header 标题  | 14px，`font-bold tracking-tight`                         |
| 正文               | 14–16px，Chat 内容可使用 16px                            |
| 列表与按钮         | 12–14px，`font-semibold` 或 `font-bold`                  |
| Metadata           | 10–12px，muted 色；机器状态可用 mono                     |

要求：

- 中文不能依赖 Space Grotesk 字形，必须保留 `PingFang SC` fallback。
- 不通过全大写制造层级；只有短标签、机器状态和代码标题可以使用大写与字距。
- 动态标题必须支持 `truncate`，正文必须允许自然换行。

## 5. Electron 应用框架

### 5.1 Split Context Bars

应用不使用额外的全局顶部栏。每个一级区域从窗口顶部开始渲染自己的 Header：

```text
┌ Session Header ┬ Chat Header ┬ Artifact Header ┐
│ Session Area   │ Chat Area   │ Artifact Area   │
└────────────────┴─────────────┴─────────────────┘
```

- Header 固定高度：`48px` / Tailwind `h-12`
- Header 底边：`border-b-2 border-border`
- Panel 之间：2px 可调整分隔线
- Header 本身是 Electron drag region；内部按钮、输入框、链接必须是 no-drag
- Session Header 仅放“新对话”等 Session 上下文操作
- Chat Header 左侧始终保留侧栏折叠按钮，随后显示当前会话标题
- Artifact Header 使用紫色语义表面，右侧放关闭/面板操作
- 不在 Header 放品牌 Logo、产品描述、全局设置或主题切换

优先复用：

- `PanelHeader`：`packages/app/src/renderer/pages/workspace/chat/panel-header.tsx`
- `Titlebar`：`packages/app/src/renderer/components/titlebar.tsx`

### 5.2 原生窗口控件安全区

```css
[data-platform="darwin"] {
  --window-controls-left: 72px;
}

[data-platform="win32"],
[data-platform="linux"] {
  --window-controls-right: 138px;
}
```

- macOS：左侧 Header 内容必须避开红绿灯。
- Windows/Linux：最右侧 Header 内容必须避开 caption buttons。
- 当 Session Area 折叠后，Chat Header 接管左侧安全区。
- 当 Artifact Area 关闭后，Chat Header 接管右侧安全区。
- 使用 `windowControls="left | right | both | none"`，不要在业务组件中重复计算固定 padding。

### 5.3 Workspace 比例

- Session Area：默认 22%，最小 16%，最大 30%，可折叠为 0。
- Chat Area：剩余主区域，最小 60%。
- Artifact 打开时：Chat 默认约 68%，Artifact 占其余区域；二者均可调整。
- Composer 内容最大宽度 `max-w-4xl`，居中显示；三栏时允许随 Chat Area 收缩。
- 任何最小宽度都应服务于可操作性，禁止依赖固定窗口总宽度。

## 6. 核心区域规范

### 6.1 Session Area

- 背景使用 `bg-sidebar`，文字使用 sidebar 语义 token。
- 顶部新对话按钮：粉色背景、2px 边框、2px 硬阴影、高度 32px。
- 分组顺序保持：置顶 → 项目 → 对话。
- 分组间距约 24px，组标题 12px，列表正文 13px。
- 列表项默认无 Card 感；选中项才使用 2px 边框和表面色。
- 项目与 Session 的层级依靠缩进、Folder/Message 图标和文本权重，而不是不同颜色的卡片。
- 时间、完成状态、计数使用 muted 色；成功/运行状态才使用信号色。
- 底部设置入口属于 Session Area 固定 Footer，黄色区域与主滚动列表分隔。

### 6.2 Chat Area

- Chat 是主要阅读区域，背景保持平坦，避免将整条 AI 回复包进大 Card。
- User 与 AI 使用明确的身份块：User 为黄色，AI 为青色；均使用短标签或统一图标。
- User 消息正文使用有边框的小型气泡；AI 正文通常直接排版在画布上。
- AI 状态行在正文上方：包含处理状态、耗时和可展开指示，并以细分隔线延展。
- Copy、Edit、Branch、Side Chat 等次级操作使用 Ghost/Icon Button，不抢占正文层级。
- Tool、Subagent、Permission 等结构化结果允许使用 2px 边框容器，但内部避免重复 Card。
- Sticky message preview 位于 Chat 内容顶部、Header 下方；不得覆盖 Header。

### 6.3 Composer

- 使用 `bg-card`、2px 边框、硬阴影和 6–8px 圆角。
- 输入区最小高度约 56px，左右 padding 14px，垂直 padding 10px。
- Footer 左侧为权限，右侧为模型与发送按钮。
- Focus 使用青色边框和轻量 ring，不增加发光阴影。
- Disabled 降低 opacity，但保留结构可读性。
- Running 状态继续允许输入 steering/follow-up，不因视觉重构改变键盘行为。

### 6.4 Artifact Area

- Header 使用 `--signal-purple`，与普通 Chat Header 明确区分。
- 主体使用普通背景或 Card 表面，不将整栏染成紫色。
- 空状态居中，图标使用紫色语义块；标题简短，描述为 muted。
- Tab、预览、代码、Side Chat 等状态继续使用现有功能结构，只统一边框、选中态和字体。

### 6.5 Settings

- Settings 也使用从窗口顶部开始的左右分区 Header。
- 左侧为导航，使用与 Session Area 一致的 sidebar surface。
- 右侧为当前设置项标题和内容。
- 页面内容居中并限制最大宽度；标题与配置 Card 之间保持清晰留白。
- 配置区域使用分段式大容器：外层 2px 边框，内部用 2px divider 分区。
- 选中导航与主题选项使用黄色；危险操作使用红色；不使用蓝色作为默认选中态。

## 7. 组件规范

### 7.1 Button

优先使用 `components/ui/button.tsx`，不要在页面中复制 Button 样式。

| Variant       | 场景                 |
| ------------- | -------------------- |
| `default`     | 主要确认、保存、提交 |
| `outline`     | 次要操作、返回、筛选 |
| `secondary`   | 较弱的结构化操作     |
| `ghost`       | 工具栏、行内图标操作 |
| `destructive` | 删除、不可逆操作     |
| `link`        | 真正的文本链接       |

- 默认高度 32px；小按钮 28px；大按钮 36px。
- 图标通常 14–16px。
- 不使用仅靠颜色区分的按钮状态；边框、文字与图标应同时表达。

### 7.2 Card 与结构容器

- 优先使用现有 `Card`，其默认结构为 2px 边框、硬阴影、小圆角。
- Card Header/Content 默认横向 padding 16px，小尺寸为 12px。
- Card Footer 使用顶部 2px divider 和 muted 表面。
- 如果内容只是列表中的一行，不使用 Card。

### 7.3 Input、Select、Textarea

- 使用语义背景和 2px 边框。
- 输入高度与相邻按钮一致。
- Placeholder 使用 muted foreground。
- Focus ring 为青色。
- 错误状态使用 destructive border + ring，并提供文字说明。

### 7.4 Dialog、Popover、Dropdown、Command

- 继续使用 shadcn/Base UI 组件，不手写浮层定位。
- 统一为 2px 边框、Card 背景、小圆角和硬阴影。
- Popover/Dropdown 保持紧凑；菜单项高度约 28–32px。
- Dialog 的主次按钮顺序和现有功能保持一致。

### 7.5 Toast

Toast 是完整产品表面，不允许保留第三方默认外观。

| 类型    | 背景                         |
| ------- | ---------------------------- |
| Success | `--signal-green`             |
| Error   | destructive 与 Card 的混合色 |
| Warning | `--signal-yellow`            |
| Info    | `--signal-cyan`              |

- 宽度基准 360px。
- 2px 边框、硬阴影、小圆角。
- 标题 `font-weight: 700`。
- Action/Cancel/Close 同样使用有边框的小型控件。
- 文案要描述结果，例如“已复制到剪贴板”，不要只写“成功”。

### 7.6 Empty、Loading、Error、Permission

- Empty：图标块 + 短标题 + 一句说明；不要添加无功能的 CTA。
- Loading：优先骨架、Spinner 或当前组件的 pending 状态；避免整页遮罩。
- Error：使用 destructive 色，但保持正文可读；提供可恢复操作时才显示按钮。
- Permission：必须显著区别允许、拒绝和默认路径；不可只通过图标颜色表达。

## 8. Interaction 与 Accessibility

- 所有可点击元素必须有真实 button/link 语义和键盘焦点。
- Focus-visible 使用 3px ring 或等价的高对比样式。
- 纯图标按钮必须有 `aria-label` 或可访问名称。
- Header 内交互元素必须位于 `app-no-drag` 区域。
- 颜色不是唯一状态表达方式；同时使用文字、图标、边框或位置。
- 动画主要用于面板展开、Hover/Press 和状态切换，通常 150–200ms。
- 遵守 `prefers-reduced-motion`。
- 长标题、模型名、路径、Session 名必须测试截断或换行。
- 最小点击目标建议 28px；高频主操作建议 32px 以上。

## 9. 新增功能实施流程

### 9.1 开发前

1. 判断功能属于 Session、Chat、Artifact 还是 Settings。
2. 查找同区域已有组件和状态，不创建平行体系。
3. 确认是否需要 Header 操作；如果不是区域级操作，不放 Header。
4. 为 light/dark 同时选择语义 token。
5. 列出 empty、loading、error、disabled、success 等必要状态。

### 9.2 开发中

1. 优先组合 `components/ui/` 中的现有组件。
2. 页面内部子组件保持同文件共置；只有复用时才独立文件。
3. 避免直接使用十六进制颜色、任意阴影和大圆角。
4. 不改变既有交互与数据流来迁就视觉样式。
5. Electron Header 中同步处理 drag/no-drag 和 window controls safe area。

### 9.3 视觉验收

推荐以 production mode 启动 Electron，降低开发模式差异：

```bash
pnpm dev:app -- --mode production
```

每个新增功能至少检查：

- [ ] 1200 × 800 主窗口
- [ ] Session Area 展开与折叠
- [ ] Artifact Area 打开与关闭
- [ ] Light / Dark / System
- [ ] macOS 左安全区；Windows/Linux 右安全区
- [ ] Hover / Focus / Active / Disabled
- [ ] Empty / Loading / Error / Success
- [ ] Toast 与 Dialog
- [ ] 长中文、长英文、路径和模型名
- [ ] Keyboard 操作与 reduced motion

最后运行：

```bash
pnpm --filter @divisor-agent/app build
pnpm lint
pnpm format:check
```

## 10. 代码参考索引

| 主题                | 文件                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| 全局 token 与 Toast | `packages/app/src/renderer/index.css`                                   |
| 通用 Button         | `packages/app/src/renderer/components/ui/button.tsx`                    |
| 通用 Card           | `packages/app/src/renderer/components/ui/card.tsx`                      |
| Chat Context Header | `packages/app/src/renderer/pages/workspace/chat/panel-header.tsx`       |
| Settings Titlebar   | `packages/app/src/renderer/components/titlebar.tsx`                     |
| Workspace 分栏      | `packages/app/src/renderer/pages/workspace/index.tsx`                   |
| Session Area        | `packages/app/src/renderer/pages/workspace/sessions/`                   |
| Chat Area           | `packages/app/src/renderer/pages/workspace/chat/`                       |
| Composer            | `packages/app/src/renderer/pages/workspace/chat/prompt-input/index.tsx` |
| Settings            | `packages/app/src/renderer/pages/settings/`                             |
| Electron 窗口配置   | `packages/app/src/main/index.ts`                                        |
| 原型基线            | `docs/原型/electron-variant-01-split-context-bars.html`                 |

## 11. 决策优先级

出现冲突时按以下顺序判断：

1. 功能正确性与可访问性
2. 当前生产组件和 Design Tokens
3. 本文档中的区域与组件规则
4. Scheme 01 HTML 原型
5. `raft.build` 的视觉启发

`raft.build` 只提供视觉语言参考，不是需要 1:1 复制的产品；Divisor Agent 的信息架构、功能和 Electron 平台约束始终优先。
