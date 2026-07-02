(() => {
  const INITIAL_DATA = {
    workspaces: [
      {
        id: "ws-divisor",
        name: "divisor-agent",
        isTop: false,
        open: true,
        sessions: [
          {
            id: "runtime",
            name: "Agent runtime 事件流",
            initial: "A",
            tone: "cyan",
            relativeTime: "昨天",
            status: "completed",
            isTop: false,
            preview: "已恢复 18 条历史消息。最后一次运行完成，Agent runtime 事件已同步。",
          },
          {
            id: "tree",
            name: "Session tree 分支设计",
            initial: "S",
            tone: "green",
            relativeTime: "周一",
            status: "running",
            isTop: false,
            preview: "正在执行 Session tree 分支与 rewind 行为验证。",
          },
          {
            id: "model",
            name: "模型配置与回退策略",
            initial: "M",
            tone: "purple",
            relativeTime: "6 月 25 日",
            status: "failed",
            isTop: false,
            preview: "上一次模型回退失败。会话历史仍可读取并继续编辑。",
          },
          {
            id: "permissions",
            name: "权限审批交互",
            initial: "P",
            tone: "yellow",
            relativeTime: "6 月 23 日",
            status: "idle",
            isTop: false,
            preview: "权限审批交互记录，共 9 条历史消息。",
          },
          {
            id: "artifacts",
            name: "Artifact 面板状态",
            initial: "H",
            tone: "pink",
            relativeTime: "6 月 21 日",
            status: "completed",
            isTop: false,
            preview: "Artifact 预览、代码与变更状态已完成。",
          },
        ],
      },
      {
        id: "ws-coding",
        name: "coding",
        isTop: false,
        open: false,
        sessions: [
          {
            id: "snake",
            name: "贪吃蛇小游戏",
            initial: "G",
            tone: "green",
            relativeTime: "4 天",
            status: "completed",
            isTop: false,
            preview: "HTML 贪吃蛇小游戏已生成并完成预览。",
          },
          {
            id: "vite",
            name: "Vite 构建排查",
            initial: "V",
            tone: "purple",
            relativeTime: "5 天",
            status: "idle",
            isTop: false,
            preview: "Vite 构建排查记录，共 14 条历史消息。",
          },
        ],
      },
      {
        id: "ws-research",
        name: "research-lab",
        isTop: false,
        open: false,
        sessions: [],
      },
    ],
    standaloneSessions: [
      {
        id: "style",
        name: "重构工作台样式",
        initial: "R",
        tone: "pink",
        relativeTime: "进行中",
        status: "running",
        isTop: true,
        preview: "正在将现有工作台映射到新的视觉系统，已有 26 条历史消息。",
      },
      {
        id: "ipc",
        name: "IPC bridge 类型检查",
        initial: "I",
        tone: "cyan",
        relativeTime: "42 分",
        status: "completed",
        isTop: false,
        preview: "IPC channel 白名单与 preload 类型检查已完成。",
      },
      {
        id: "rewind",
        name: "Server session rewind",
        initial: "W",
        tone: "purple",
        relativeTime: "1 小时",
        status: "idle",
        isTop: false,
        preview: "服务端 Session rewind 行为记录，共 12 条历史消息。",
      },
      {
        id: "example",
        name: "Create an example",
        initial: "E",
        tone: "yellow",
        relativeTime: "1 小时",
        status: "completed",
        isTop: false,
        preview: "示例 divisor-block 已创建。",
      },
      {
        id: "baidu",
        name: "open baidu in artifact",
        initial: "B",
        tone: "green",
        relativeTime: "4 天",
        status: "failed",
        isTop: false,
        preview: "外部页面 Artifact 打开失败，可继续重试。",
      },
      {
        id: "wiki",
        name: "open https://wiki",
        initial: "W",
        tone: "cyan",
        relativeTime: "5 天",
        status: "idle",
        isTop: false,
        preview: "Wiki 浏览会话，共 7 条历史消息。",
      },
    ],
  };

  const cloneInitialData = () => JSON.parse(JSON.stringify(INITIAL_DATA));
  const variant = document.body.dataset.variant || "balanced";

  const state = {
    data: cloneInitialData(),
    activeSessionId: "style",
    loadingSessionId: null,
    collapsedGroups: new Set(),
    recentVisible: variant === "compact" ? 5 : 3,
    workspaceVisible: {},
    modal: null,
    eventLog: ["READY · Session state hydrated"],
  };

  const els = {
    content: document.querySelector("#sidebarContent"),
    modal: document.querySelector("#modalBackdrop"),
    modalTitle: document.querySelector("#modalTitle"),
    modalBody: document.querySelector("#modalBody"),
    modalConfirm: document.querySelector("#modalConfirm"),
    toast: document.querySelector("#toast"),
    toastMessage: document.querySelector("#toastMessage"),
    selectedTitle: document.querySelector("#selectedSessionTitle"),
    selectedStatus: document.querySelector("#selectedSessionStatus"),
    selectedCopy: document.querySelector("#selectedSessionCopy"),
    eventList: document.querySelector("#eventList"),
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function allSessions() {
    return [
      ...state.data.standaloneSessions,
      ...state.data.workspaces.flatMap((workspace) => workspace.sessions),
    ];
  }

  function findSession(id) {
    return allSessions().find((session) => session.id === id) || null;
  }

  function findWorkspace(id) {
    return state.data.workspaces.find((workspace) => workspace.id === id) || null;
  }

  function statusLabel(status) {
    return {
      running: "执行中",
      completed: "已完成",
      failed: "失败",
      idle: "",
    }[status];
  }

  function addEvent(message) {
    const timestamp = new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    state.eventLog.unshift(`${timestamp} · ${message}`);
    state.eventLog = state.eventLog.slice(0, 8);
    renderInspector();
  }

  function notify(message, tone = "success") {
    els.toast.dataset.tone = tone;
    els.toastMessage.textContent = message;
    els.toast.classList.add("is-visible");
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
  }

  function renderGroup({ id, title, count, action, content }) {
    const collapsed = state.collapsedGroups.has(id);
    return `
      <section class="session-group" data-group="${id}">
        <div class="group-header">
          <button class="group-toggle" data-action="toggle-group" data-group-id="${id}" aria-expanded="${!collapsed}">
            <span>${escapeHtml(title)}</span><span>${String(count).padStart(2, "0")}</span>
          </button>
          ${
            action
              ? `<div class="group-actions"><button class="group-action" data-action="${action.action}" title="${escapeHtml(action.title)}">${escapeHtml(action.label)}</button></div>`
              : ""
          }
        </div>
        <div class="group-body" ${collapsed ? "hidden" : ""}>${content}</div>
      </section>`;
  }

  function renderSession(session, { recent = false } = {}) {
    const isActive = session.id === state.activeSessionId;
    const isLoading = session.id === state.loadingSessionId;
    const status = isLoading ? "running" : session.status;
    const label = isLoading ? "载入中" : statusLabel(status);
    return `
      <div class="session-row ${isActive ? "is-active" : ""} ${recent ? "recent-session" : ""}" data-session-id="${session.id}">
        <button class="session-main" data-action="select-session" data-session-id="${session.id}" aria-current="${isActive ? "page" : "false"}">
          <span class="session-avatar tone-${session.tone}">${escapeHtml(session.initial)}</span>
          <span class="session-copy">
            <span class="session-title">${escapeHtml(session.name.trim() || "untitled")}</span>
            <span class="session-meta">
              <span class="status status-${status}">${escapeHtml(label)}</span>
              <time>${escapeHtml(session.relativeTime)}</time>
            </span>
          </span>
        </button>
        <span class="row-trailing">
          <time class="row-time">${escapeHtml(session.relativeTime)}</time>
          <span class="row-actions">
            <button class="row-action" data-action="toggle-session-pin" data-session-id="${session.id}" title="${session.isTop ? "取消置顶" : "置顶"}">${session.isTop ? "取消置顶" : "置顶"}</button>
            <button class="row-action danger" data-action="delete-session" data-session-id="${session.id}" title="删除会话">删除</button>
          </span>
        </span>
      </div>`;
  }

  function renderWorkspace(workspace) {
    const visible = state.workspaceVisible[workspace.id] || (variant === "compact" ? 4 : 3);
    const sessions = workspace.sessions.filter((session) => !session.isTop);
    const sessionMarkup = sessions.length
      ? sessions
          .slice(0, visible)
          .map((session) => renderSession(session))
          .join("")
      : `<div class="empty-state">暂无对话 · 可从项目操作中新建</div>`;
    const loadMore =
      sessions.length > visible
        ? `<button class="load-more" data-action="load-workspace-more" data-workspace-id="${workspace.id}">加载更多 ${sessions.length - visible} 条</button>`
        : "";

    return `
      <div class="workspace-block" data-workspace-id="${workspace.id}">
        <div class="workspace-row ${workspace.open ? "is-open" : ""}">
          <button class="workspace-main" data-action="toggle-workspace" data-workspace-id="${workspace.id}" aria-expanded="${workspace.open}">
            <span class="workspace-kind">${workspace.open ? "收起" : "展开"}</span>
            <span class="workspace-copy">
              <span class="workspace-title">${escapeHtml(workspace.name || "untitled")}</span>
              <span class="workspace-meta">${workspace.open ? "项目已展开" : "点击查看项目内对话"}</span>
            </span>
            <span class="workspace-count">${workspace.sessions.length}</span>
          </button>
          <span class="row-trailing">
            <span class="row-actions">
              <button class="row-action" data-action="toggle-workspace-pin" data-workspace-id="${workspace.id}">${workspace.isTop ? "取消置顶" : "置顶"}</button>
              <button class="row-action" data-action="new-workspace-session" data-workspace-id="${workspace.id}">新建</button>
              <button class="row-action danger" data-action="request-delete-workspace" data-workspace-id="${workspace.id}">删除</button>
            </span>
          </span>
        </div>
        ${workspace.open ? `<div class="workspace-children">${sessionMarkup}${loadMore}</div>` : ""}
      </div>`;
  }

  function render() {
    const pinnedSessions = allSessions().filter((session) => session.isTop);
    const pinnedWorkspaces = state.data.workspaces.filter((workspace) => workspace.isTop);
    const projectWorkspaces = state.data.workspaces.filter((workspace) => !workspace.isTop);
    const recentSessions = state.data.standaloneSessions.filter((session) => !session.isTop);

    const pinnedContent = [
      ...pinnedSessions.map((session) => renderSession(session)),
      ...pinnedWorkspaces.map((workspace) => renderWorkspace(workspace)),
    ].join("");

    const recentContent = recentSessions.length
      ? recentSessions
          .slice(0, state.recentVisible)
          .map((session) => renderSession(session, { recent: variant === "fidelity" }))
          .join("")
      : `<div class="empty-state">暂无最近对话</div>`;

    els.content.innerHTML = [
      renderGroup({
        id: "pinned",
        title: "置顶",
        count: pinnedSessions.length + pinnedWorkspaces.length,
        content: pinnedContent || `<div class="empty-state">暂无置顶</div>`,
      }),
      renderGroup({
        id: "projects",
        title: "项目",
        count: projectWorkspaces.length,
        action: { action: "create-workspace", label: "新建", title: "创建项目" },
        content: projectWorkspaces.map((workspace) => renderWorkspace(workspace)).join(""),
      }),
      renderGroup({
        id: "recent",
        title: variant === "fidelity" ? "最近" : "对话",
        count: recentSessions.length,
        action: { action: "new-session", label: "新对话", title: "创建独立对话" },
        content:
          recentContent +
          (recentSessions.length > state.recentVisible
            ? `<button class="load-more" data-action="load-recent-more">加载更多 ${recentSessions.length - state.recentVisible} 条</button>`
            : ""),
      }),
    ].join("");

    renderInspector();
  }

  function renderInspector() {
    const active = findSession(state.activeSessionId);
    if (active) {
      els.selectedTitle.textContent = active.name;
      els.selectedStatus.className = `status status-${active.status}`;
      els.selectedStatus.textContent = statusLabel(active.status) || "空闲";
      els.selectedCopy.textContent = active.preview;
    } else {
      els.selectedTitle.textContent = "新对话";
      els.selectedStatus.className = "status status-running";
      els.selectedStatus.textContent = "等待输入";
      els.selectedCopy.textContent = "已创建 pending session。发送第一条消息后再持久化为正式会话。";
    }
    els.eventList.innerHTML = state.eventLog
      .map((event) => `<span>${escapeHtml(event)}</span>`)
      .join("");
  }

  function selectSession(id) {
    const session = findSession(id);
    if (!session || state.loadingSessionId === id) return;
    state.loadingSessionId = id;
    addEvent(`getSessionEntries(${id})`);
    render();
    clearTimeout(selectSession.timer);
    selectSession.timer = setTimeout(() => {
      state.loadingSessionId = null;
      state.activeSessionId = id;
      addEvent(`setSessionId → setHistoryMessages(${id})`);
      render();
    }, 520);
  }

  function toggleSessionPin(id) {
    const session = findSession(id);
    if (!session) return;
    session.isTop = !session.isTop;
    addEvent(`${session.isTop ? "pinSession" : "unpinSession"}(${id})`);
    notify(session.isTop ? "会话已置顶" : "会话已取消置顶");
    render();
  }

  function deleteSession(id) {
    const session = findSession(id);
    if (!session) return;
    state.data.standaloneSessions = state.data.standaloneSessions.filter((item) => item.id !== id);
    state.data.workspaces.forEach((workspace) => {
      workspace.sessions = workspace.sessions.filter((item) => item.id !== id);
    });
    if (state.activeSessionId === id) state.activeSessionId = null;
    addEvent(`deleteSession(${id}) → invalidateQueries`);
    notify(`已删除「${session.name}」`, "danger");
    render();
  }

  function toggleWorkspace(id) {
    const workspace = findWorkspace(id);
    if (!workspace) return;
    workspace.open = !workspace.open;
    addEvent(`${workspace.open ? "listSessions" : "collapseWorkspace"}(${id})`);
    render();
  }

  function toggleWorkspacePin(id) {
    const workspace = findWorkspace(id);
    if (!workspace) return;
    workspace.isTop = !workspace.isTop;
    addEvent(`${workspace.isTop ? "pinWorkspace" : "unpinWorkspace"}(${id})`);
    notify(workspace.isTop ? "项目已置顶" : "项目已取消置顶");
    render();
  }

  function newSession(workspaceId = null) {
    const id = `pending-${Date.now()}`;
    const session = {
      id,
      name: "未命名对话",
      initial: "N",
      tone: "yellow",
      relativeTime: "刚刚",
      status: "running",
      isTop: false,
      preview: workspaceId
        ? "已创建项目内 pending session，等待第一条消息。"
        : "已创建独立 pending session，等待第一条消息。",
    };
    if (workspaceId) {
      const workspace = findWorkspace(workspaceId);
      if (!workspace) return;
      workspace.sessions.unshift(session);
      workspace.open = true;
      state.workspaceVisible[workspaceId] = Math.max(
        state.workspaceVisible[workspaceId] || 3,
        variant === "compact" ? 4 : 3,
      );
    } else {
      state.data.standaloneSessions.unshift(session);
      state.recentVisible += 1;
    }
    state.activeSessionId = id;
    addEvent(`createPendingSession(${workspaceId || "standalone"})`);
    notify(workspaceId ? "已在项目中创建新对话" : "已创建新对话");
    render();
  }

  function openModal(config) {
    state.modal = config;
    els.modalTitle.textContent = config.title;
    els.modalConfirm.textContent = config.confirmLabel || "确认";
    els.modalConfirm.className = `modal-button ${config.danger ? "danger" : "primary"}`;
    if (config.type === "create-workspace") {
      els.modalBody.innerHTML = `
        <p class="modal-description">创建一个新的工作区来组织相关对话。</p>
        <div class="field"><label for="workspaceName">名称</label><input id="workspaceName" placeholder="输入工作区名称" /></div>
        <div class="field"><label for="workspacePrompt">系统提示（可选）</label><textarea id="workspacePrompt" placeholder="输入系统提示词…"></textarea></div>`;
    } else {
      els.modalBody.innerHTML = `<p class="modal-description">${escapeHtml(config.description)}</p>`;
    }
    els.modal.classList.add("is-open");
    setTimeout(() => els.modal.querySelector("input, button")?.focus(), 20);
  }

  function closeModal() {
    state.modal = null;
    els.modal.classList.remove("is-open");
  }

  function confirmModal() {
    if (!state.modal) return;
    if (state.modal.type === "delete-workspace") {
      const workspace = findWorkspace(state.modal.workspaceId);
      if (workspace) {
        state.data.workspaces = state.data.workspaces.filter((item) => item.id !== workspace.id);
        if (workspace.sessions.some((session) => session.id === state.activeSessionId)) {
          state.activeSessionId = null;
        }
        addEvent(`deleteWorkspace(${workspace.id}) → remove child sessions`);
        notify(`已删除项目「${workspace.name}」`, "danger");
      }
    }
    if (state.modal.type === "create-workspace") {
      const name = document.querySelector("#workspaceName")?.value.trim();
      if (!name) {
        document.querySelector("#workspaceName")?.focus();
        notify("请先输入项目名称", "danger");
        return;
      }
      const id = `ws-${Date.now()}`;
      state.data.workspaces.push({ id, name, isTop: false, open: true, sessions: [] });
      addEvent(`createWorkspace(${id})`);
      notify(`已创建项目「${name}」`);
    }
    closeModal();
    render();
  }

  function resetPrototype() {
    state.data = cloneInitialData();
    state.activeSessionId = "style";
    state.loadingSessionId = null;
    state.collapsedGroups.clear();
    state.recentVisible = variant === "compact" ? 5 : 3;
    state.workspaceVisible = {};
    state.eventLog = ["READY · Prototype reset"];
    render();
    notify("原型状态已重置");
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;

    if (action === "select-session") selectSession(target.dataset.sessionId);
    if (action === "toggle-session-pin") toggleSessionPin(target.dataset.sessionId);
    if (action === "delete-session") deleteSession(target.dataset.sessionId);
    if (action === "toggle-workspace") toggleWorkspace(target.dataset.workspaceId);
    if (action === "toggle-workspace-pin") toggleWorkspacePin(target.dataset.workspaceId);
    if (action === "new-workspace-session") newSession(target.dataset.workspaceId);
    if (action === "request-delete-workspace") {
      const workspace = findWorkspace(target.dataset.workspaceId);
      if (workspace) {
        openModal({
          type: "delete-workspace",
          workspaceId: workspace.id,
          title: "删除项目",
          description: `确定要删除项目「${workspace.name}」吗？该项目下的所有对话也会被删除。`,
          confirmLabel: "删除",
          danger: true,
        });
      }
    }
    if (action === "toggle-group") {
      const groupId = target.dataset.groupId;
      if (state.collapsedGroups.has(groupId)) state.collapsedGroups.delete(groupId);
      else state.collapsedGroups.add(groupId);
      addEvent(`toggleGroup(${groupId})`);
      render();
    }
    if (action === "load-recent-more") {
      state.recentVisible += 3;
      addEvent("fetchNextPage(standalone)");
      render();
    }
    if (action === "load-workspace-more") {
      const workspace = findWorkspace(target.dataset.workspaceId);
      if (workspace) state.workspaceVisible[workspace.id] = workspace.sessions.length;
      addEvent(`fetchNextPage(${target.dataset.workspaceId})`);
      render();
    }
    if (action === "new-session") newSession();
    if (action === "create-workspace") {
      openModal({
        type: "create-workspace",
        title: "创建项目",
        confirmLabel: "创建",
      });
    }
    if (action === "settings") notify("设置入口保持为现有导航行为");
    if (action === "reset") resetPrototype();
    if (action === "toggle-theme") {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("session-prototype-theme", next);
      target.textContent = next === "dark" ? "切换浅色" : "切换深色";
      notify(`已切换至${next === "dark" ? "深色" : "浅色"}`);
    }
    if (action === "modal-cancel") closeModal();
    if (action === "modal-confirm") confirmModal();
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
      event.preventDefault();
      newSession();
    }
    if (event.key === "Escape" && state.modal) closeModal();
  });

  els.modal.addEventListener("click", (event) => {
    if (event.target === els.modal) closeModal();
  });

  els.modalConfirm.addEventListener("click", confirmModal);

  const savedTheme = localStorage.getItem("session-prototype-theme") || "dark";
  document.documentElement.dataset.theme = savedTheme;
  const themeButton = document.querySelector('[data-action="toggle-theme"]');
  if (themeButton) themeButton.textContent = savedTheme === "dark" ? "切换浅色" : "切换深色";
  render();
})();
