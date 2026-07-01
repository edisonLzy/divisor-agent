import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Command,
  Copy,
  FileCode2,
  FolderKanban,
  Hash,
  LayoutPanelLeft,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  PanelRightClose,
  Play,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  TerminalSquare,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";

const sessions = [
  { id: "raft", title: "重构工作台交互", meta: "2 分钟前", color: "pink", initial: "R" },
  { id: "runtime", title: "Agent runtime 事件流", meta: "昨天", color: "cyan", initial: "A" },
  { id: "sessions", title: "Session tree 分支设计", meta: "周一", color: "green", initial: "S" },
  { id: "model", title: "模型配置与回退策略", meta: "6 月 25 日", color: "purple", initial: "M" },
];

const models = ["GPT-5.1 Codex", "Claude Sonnet 4", "Gemini 2.5 Pro"];
const permissions = ["工作区写入", "仅建议", "完全访问"];

export function App() {
  const [activeSession, setActiveSession] = useState("raft");
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 1120);
  const [detailsOpen, setDetailsOpen] = useState(() => window.innerWidth > 1120);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [model, setModel] = useState(models[0]);
  const [permission, setPermission] = useState(permissions[0]);
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [toolOpen, setToolOpen] = useState(true);
  const [artifactTab, setArtifactTab] = useState("preview");
  const [messages, setMessages] = useState([]);
  const [toast, setToast] = useState("");

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function sendPrompt() {
    const value = prompt.trim();
    if (!value || running) return;
    setMessages((current) => [...current, { role: "user", text: value }]);
    setPrompt("");
    setRunning(true);
    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: "收到。我会继续沿用 Raft 的硬边框、暖白画布与高饱和状态色，并保持现有会话结构不变。",
        },
      ]);
      setRunning(false);
    }, 1500);
  }

  function createSession() {
    setActiveSession("new");
    setMessages([]);
    notify("已创建新的本地会话");
  }

  return (
    <div className="prototype-shell">
      <header className="app-bar">
        <div className="traffic-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <button className="brand" onClick={() => notify("Divisor Agent · Prototype")}>
          <span className="brand-mark">
            <Zap size={15} strokeWidth={3} />
          </span>
          <span>DIVISOR</span>
          <b>LAB</b>
        </button>
        <div className="app-bar-center">
          <span className="live-dot" /> LOCAL AGENT ONLINE
        </div>
        <div className="app-bar-actions">
          <button
            className="icon-button compact"
            onClick={() => setSearchOpen(true)}
            aria-label="搜索"
          >
            <Search size={17} />
          </button>
          <button
            className="icon-button compact"
            onClick={() => setSettingsOpen(true)}
            aria-label="设置"
          >
            <Settings size={17} />
          </button>
        </div>
      </header>

      <div className={`workspace ${sidebarOpen ? "sidebar-is-open" : ""}`}>
        <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
          <div className="sidebar-top">
            <button className="primary-button new-chat" onClick={createSession}>
              <MessageSquarePlus size={17} /> 新对话 <kbd>⌘ N</kbd>
            </button>
          </div>

          <div className="sidebar-scroll">
            <SidebarSection title="置顶" count="01">
              <SessionButton
                session={{
                  id: "raft",
                  title: "重构工作台交互",
                  meta: "进行中",
                  color: "pink",
                  initial: "R",
                }}
                active={activeSession === "raft"}
                onSelect={() => setActiveSession("raft")}
              />
            </SidebarSection>

            <SidebarSection title="项目" count="03" action={<FolderKanban size={14} />}>
              <button className="project-row">
                <ChevronDown size={14} />
                <span className="project-icon cyan">
                  <Code2 size={14} />
                </span>
                <span>divisor-agent</span>
                <b>4</b>
              </button>
              <div className="session-list">
                {sessions.slice(1).map((session) => (
                  <SessionButton
                    key={session.id}
                    session={session}
                    active={activeSession === session.id}
                    onSelect={() => {
                      setActiveSession(session.id);
                      setMessages([]);
                    }}
                  />
                ))}
              </div>
            </SidebarSection>

            <SidebarSection title="最近" count="02">
              <button className="plain-session">
                <Hash size={13} /> IPC bridge 类型检查
              </button>
              <button className="plain-session">
                <Hash size={13} /> Server session rewind
              </button>
            </SidebarSection>
          </div>

          <div className="sidebar-bottom">
            <div className="usage-meter">
              <span>
                <b>本地上下文</b>
                <em>62%</em>
              </span>
              <div>
                <i />
              </div>
            </div>
            <button className="sidebar-settings" onClick={() => setSettingsOpen(true)}>
              <span className="avatar yellow">ZY</span>
              <span>
                <b>Zhiyu</b>
                <small>个人工作区</small>
              </span>
              <Settings size={15} />
            </button>
          </div>
        </aside>

        <main className="chat-panel">
          <section className="channel-header">
            <div className="channel-title">
              <button
                className="icon-button mobile-menu"
                onClick={() => setSidebarOpen((value) => !value)}
                aria-label="切换侧栏"
              >
                <Menu size={18} />
              </button>
              <span className="channel-icon">
                <Hash size={18} strokeWidth={3} />
              </span>
              <div>
                <h1>{activeSession === "new" ? "未命名会话" : "重构工作台交互"}</h1>
                <p>
                  <span className="live-dot" /> RUNNING LOCALLY · 12 FILES IN CONTEXT
                </p>
              </div>
            </div>
            <div className="channel-actions">
              <span className="collaborators">
                <i>AI</i>
                <i>ZY</i>
              </span>
              <button className="outlined-button members">
                <Users size={15} /> 2
              </button>
              <button
                className="icon-button"
                onClick={() => setDetailsOpen((value) => !value)}
                aria-label="切换产物面板"
              >
                {detailsOpen ? <PanelRightClose size={17} /> : <LayoutPanelLeft size={17} />}
              </button>
              <button className="icon-button" onClick={() => notify("更多操作")} aria-label="更多">
                <MoreHorizontal size={18} />
              </button>
            </div>
          </section>

          <section className="messages" aria-live="polite">
            <div className="date-divider">
              <span>今天 · 10:32</span>
            </div>

            <Message avatar="ZY" color="yellow" name="Zhiyu" time="10:32">
              <p>
                请分析 <code>raft.build</code> 的 UI 风格，并把当前 Agent
                工作台重构成这种形式。先输出一个可交互原型。
              </p>
              <div className="context-chip">
                <FileCode2 size={14} /> packages/app/src/renderer <span>12 files</span>
              </div>
            </Message>

            <Message avatar={<Bot size={18} />} color="cyan" name="Divisor" time="10:33" agent>
              <p>我先把参考站点的视觉语言映射到现有信息架构：</p>
              <ul className="response-list">
                <li>
                  <b>框架</b>
                  <span>暖白画布、2px 黑色描边、3px 硬阴影</span>
                </li>
                <li>
                  <b>状态</b>
                  <span>黄 / 粉 / 青 / 绿作为明确功能色</span>
                </li>
                <li>
                  <b>排版</b>
                  <span>Space Grotesk + Space Mono，信息密度更高</span>
                </li>
              </ul>
            </Message>

            <ToolCall open={toolOpen} onToggle={() => setToolOpen((value) => !value)} />

            <Message avatar={<Bot size={18} />} color="cyan" name="Divisor" time="10:34" agent>
              <p>
                交互稿已生成。我保留了会话树、消息流、工具执行和模型权限四条主线，并把产物预览放到右侧工作区。
              </p>
              <button className="artifact-inline" onClick={() => setDetailsOpen(true)}>
                <span className="artifact-icon">
                  <FileCode2 size={18} />
                </span>
                <span>
                  <b>raft-workspace.html</b>
                  <small>Interactive prototype · 28.4 KB</small>
                </span>
                <ArrowRight size={17} />
              </button>
            </Message>

            {messages.map((message, index) => (
              <Message
                key={`${message.role}-${index}`}
                avatar={message.role === "user" ? "ZY" : <Bot size={18} />}
                color={message.role === "user" ? "yellow" : "cyan"}
                name={message.role === "user" ? "Zhiyu" : "Divisor"}
                time="刚刚"
                agent={message.role === "assistant"}
              >
                <p>{message.text}</p>
              </Message>
            ))}

            {running && (
              <div className="agent-typing">
                <span className="avatar cyan">
                  <Bot size={18} />
                </span>
                <span>
                  <i />
                  <i />
                  <i />
                </span>
                <b>DIVISOR IS THINKING</b>
              </div>
            )}
          </section>

          <section className="composer-wrap">
            <div className={`composer ${running ? "running" : ""}`}>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendPrompt();
                  }
                }}
                placeholder="给 Divisor 发送消息，@ 引用文件，/ 使用技能…"
                rows={2}
              />
              <div className="composer-footer">
                <div className="selector-wrap">
                  <button
                    className="selector-button permission"
                    onClick={() => setPermissionOpen((value) => !value)}
                  >
                    <ShieldCheck size={15} /> {permission} <ChevronDown size={13} />
                  </button>
                  {permissionOpen && (
                    <Dropdown
                      items={permissions}
                      value={permission}
                      onSelect={(value) => {
                        setPermission(value);
                        setPermissionOpen(false);
                      }}
                    />
                  )}
                </div>
                <span className="composer-hint">
                  <Command size={13} /> ENTER 发送 · ⇧ ENTER 换行
                </span>
                <div className="selector-wrap model-wrap">
                  <button
                    className="selector-button"
                    onClick={() => setModelOpen((value) => !value)}
                  >
                    <Sparkles size={15} /> {model} <ChevronDown size={13} />
                  </button>
                  {modelOpen && (
                    <Dropdown
                      items={models}
                      value={model}
                      align="right"
                      onSelect={(value) => {
                        setModel(value);
                        setModelOpen(false);
                      }}
                    />
                  )}
                </div>
                <button
                  className="send-button"
                  disabled={!prompt.trim() && !running}
                  onClick={() => (running ? setRunning(false) : sendPrompt())}
                  aria-label={running ? "停止" : "发送"}
                >
                  {running ? <Square size={14} fill="currentColor" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </section>
        </main>

        <aside className={`details-panel ${detailsOpen ? "open" : "closed"}`}>
          <div className="details-header">
            <div>
              <span className="eyebrow">ARTIFACT / 01</span>
              <h2>工作台原型</h2>
            </div>
            <button
              className="icon-button"
              onClick={() => setDetailsOpen(false)}
              aria-label="关闭产物面板"
            >
              <X size={17} />
            </button>
          </div>
          <div className="artifact-tabs">
            <button
              className={artifactTab === "preview" ? "active" : ""}
              onClick={() => setArtifactTab("preview")}
            >
              预览
            </button>
            <button
              className={artifactTab === "code" ? "active" : ""}
              onClick={() => setArtifactTab("code")}
            >
              代码
            </button>
            <button
              className={artifactTab === "changes" ? "active" : ""}
              onClick={() => setArtifactTab("changes")}
            >
              变更 <b>8</b>
            </button>
          </div>
          <div className="artifact-body">
            {artifactTab === "preview" && <PrototypePreview />}
            {artifactTab === "code" && <CodePreview />}
            {artifactTab === "changes" && <ChangesPreview />}
          </div>
          <div className="artifact-footer">
            <span>
              <Check size={14} /> BUILD PASSED
            </span>
            <button className="outlined-button" onClick={() => notify("已复制本地预览链接")}>
              <Copy size={14} /> 复制链接
            </button>
            <button className="primary-button" onClick={() => notify("预览已在当前面板刷新")}>
              <Play size={14} /> 运行
            </button>
          </div>
        </aside>
      </div>

      {searchOpen && (
        <SearchDialog
          onClose={() => setSearchOpen(false)}
          onSelect={(id) => {
            setActiveSession(id);
            setSearchOpen(false);
          }}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {toast && (
        <div className="toast">
          <Check size={15} /> {toast}
        </div>
      )}
    </div>
  );
}

function SidebarSection({ title, count, action, children }) {
  return (
    <section className="sidebar-section">
      <div className="section-heading">
        <span>{title}</span>
        <i>{count}</i>
        {action && <button aria-label={`${title} 操作`}>{action}</button>}
      </div>
      {children}
    </section>
  );
}

function SessionButton({ session, active, onSelect }) {
  return (
    <button className={`session-button ${active ? "active" : ""}`} onClick={onSelect}>
      <span className={`avatar ${session.color}`}>{session.initial}</span>
      <span>
        <b>{session.title}</b>
        <small>{session.meta}</small>
      </span>
      <ChevronRight size={14} />
    </button>
  );
}

function Message({ avatar, color, name, time, agent = false, children }) {
  return (
    <article className={`message ${agent ? "agent" : "user"}`}>
      <span className={`avatar message-avatar ${color}`}>{avatar}</span>
      <div className="message-content">
        <header>
          <b>{name}</b>
          {agent && <em>AGENT</em>}
          <time>{time}</time>
        </header>
        <div className="message-copy">{children}</div>
      </div>
    </article>
  );
}

function ToolCall({ open, onToggle }) {
  return (
    <div className={`tool-call ${open ? "open" : ""}`}>
      <button className="tool-summary" onClick={onToggle}>
        <span className="tool-icon">
          <TerminalSquare size={18} />
        </span>
        <span>
          <b>读取工作区结构</b>
          <small>rg --files packages/app/src/renderer</small>
        </span>
        <em>
          <Check size={13} /> 0.8s
        </em>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="tool-output">
          <div>
            <span>01</span>packages/app/src/renderer/pages/workspace/index.tsx
          </div>
          <div>
            <span>02</span>packages/app/src/renderer/pages/workspace/chat/index.tsx
          </div>
          <div>
            <span>03</span>packages/app/src/renderer/pages/workspace/sessions/index.tsx
          </div>
          <div className="tool-more">+ 9 MORE FILES</div>
        </div>
      )}
    </div>
  );
}

function Dropdown({ items, value, onSelect, align = "left" }) {
  return (
    <div className={`dropdown ${align}`}>
      {items.map((item) => (
        <button key={item} onClick={() => onSelect(item)}>
          <span>{item}</span>
          {item === value && <Check size={14} />}
        </button>
      ))}
    </div>
  );
}

function PrototypePreview() {
  return (
    <div className="mini-browser">
      <div className="mini-browser-bar">
        <i />
        <i />
        <i />
        <span>localhost:4173</span>
      </div>
      <div className="mini-app">
        <div className="mini-sidebar">
          <span className="mini-logo">D/</span>
          <i className="active" />
          <i />
          <i />
          <i />
        </div>
        <div className="mini-main">
          <header>
            <span>#</span>
            <b>重构工作台交互</b>
          </header>
          <div className="mini-message user">
            <i>ZY</i>
            <p>把当前应用重构为 Raft 风格。</p>
          </div>
          <div className="mini-message bot">
            <i>AI</i>
            <p>正在分析界面结构与交互状态…</p>
          </div>
          <div className="mini-tool">
            <TerminalSquare size={16} />
            <span>读取工作区结构</span>
            <Check size={14} />
          </div>
          <div className="mini-composer">
            发送消息… <Send size={14} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CodePreview() {
  return (
    <div className="code-preview">
      <div className="code-file">
        <FileCode2 size={15} /> src/App.jsx <span>JSX</span>
      </div>
      <pre>
        <code>
          <span className="purple-text">export function</span> App() {"{"}
          {`\n`} <span className="purple-text">return</span> ({`\n`} &lt;
          <span className="cyan-text">Workspace</span> theme=
          <span className="green-text">"raft"</span>&gt;{`\n`} &lt;
          <span className="cyan-text">SessionTree</span> /&gt;{`\n`} &lt;
          <span className="cyan-text">AgentChat</span> /&gt;{`\n`} &lt;
          <span className="cyan-text">ArtifactPanel</span> /&gt;{`\n`} &lt;/
          <span className="cyan-text">Workspace</span>&gt;{`\n`} );{`\n`}
          {"}"}
        </code>
      </pre>
    </div>
  );
}

function ChangesPreview() {
  return (
    <div className="changes-list">
      {["src/App.jsx", "src/styles.css", "index.html", "package.json"].map((file, index) => (
        <button key={file}>
          <FileCode2 size={15} />
          <span>{file}</span>
          <em>+{[286, 514, 3, 4][index]}</em>
        </button>
      ))}
    </div>
  );
}

function SearchDialog({ onClose, onSelect }) {
  const [query, setQuery] = useState("");
  const matches = sessions.filter((session) =>
    session.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="search-dialog" role="dialog" aria-modal="true">
        <div className="search-input">
          <Search size={20} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索会话、文件或命令…"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="search-results">
          <span className="eyebrow">SESSIONS</span>
          {matches.map((session) => (
            <button key={session.id} onClick={() => onSelect(session.id)}>
              <span className={`avatar ${session.color}`}>{session.initial}</span>
              <span>
                <b>{session.title}</b>
                <small>{session.meta}</small>
              </span>
              <span>↵</span>
            </button>
          ))}
          {matches.length === 0 && <p>没有匹配结果。</p>}
        </div>
        <footer>
          <span>↑↓ 选择</span>
          <span>↵ 打开</span>
          <button onClick={onClose}>关闭</button>
        </footer>
      </div>
    </div>
  );
}

function SettingsDialog({ onClose }) {
  const [compact, setCompact] = useState(true);
  const [sounds, setSounds] = useState(false);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="settings-dialog" role="dialog" aria-modal="true">
        <header>
          <div>
            <span className="eyebrow">PREFERENCES</span>
            <h2>界面设置</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="settings-row">
          <span>
            <b>紧凑消息密度</b>
            <small>减少消息间距，显示更多上下文</small>
          </span>
          <Toggle value={compact} onChange={setCompact} />
        </div>
        <div className="settings-row">
          <span>
            <b>工具完成提示音</b>
            <small>Agent 完成工具执行后播放提示</small>
          </span>
          <Toggle value={sounds} onChange={setSounds} />
        </div>
        <div className="settings-row static">
          <span>
            <b>主题</b>
            <small>Raft Light · Prototype</small>
          </span>
          <span className="theme-swatch">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
        <footer>
          <button className="primary-button" onClick={onClose}>
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      className={`toggle ${value ? "on" : ""}`}
      onClick={() => onChange(!value)}
      aria-pressed={value}
    >
      <i />
    </button>
  );
}
