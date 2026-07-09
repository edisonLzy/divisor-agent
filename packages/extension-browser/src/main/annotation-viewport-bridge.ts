import type { BrowserAnnotationViewportBridgeMarker } from "../common/types";

// ---------------------------------------------------------------------------
// Viewport bridge — injects numbered annotation badges into the page
// ---------------------------------------------------------------------------

export interface BrowserAnnotationViewportBridgeOptions {
  enabled: boolean;
  emitViewport: boolean;
  markers: BrowserAnnotationViewportBridgeMarker[];
  token: string;
}

export const BROWSER_ANNOTATION_VIEWPORT_MESSAGE_PREFIX = "__divisor_annotation_viewport__:";

/**
 * Build a self-contained JS script that injects numbered annotation markers
 * into a guest page via a shadow DOM overlay. The script is injected via
 * executeJavaScript() and runs in the page's own world.
 */
export function buildBrowserAnnotationViewportBridgeScript({
  emitViewport,
  enabled,
  markers,
  token,
}: BrowserAnnotationViewportBridgeOptions): string {
  return `(() => {
  'use strict';

  const enabled = ${JSON.stringify(enabled)};
  const emitViewportMessages = ${JSON.stringify(emitViewport)};
  const markers = ${JSON.stringify(markers)};
  const token = ${JSON.stringify(token)};
  const prefix = ${JSON.stringify(BROWSER_ANNOTATION_VIEWPORT_MESSAGE_PREFIX)};
  const stateKey = '__divisorBrowserAnnotationViewportBridge';
  const hostAttribute = 'data-divisor-browser-annotation-overlay';
  const markerSize = 24;

  const removeOverlay = (state) => {
    if (state && state.host && state.host.parentNode) {
      state.host.parentNode.removeChild(state.host);
    }
  };

  const cleanup = (state) => {
    if (!state) return;
    if (state.raf) cancelAnimationFrame(state.raf);
    if (state.requestUpdate) {
      window.removeEventListener('scroll', state.requestUpdate, true);
      document.removeEventListener('scroll', state.requestUpdate, true);
      window.removeEventListener('resize', state.requestUpdate, true);
    }
    removeOverlay(state);
  };

  const existing = globalThis[stateKey];
  if (!enabled) {
    cleanup(existing);
    delete globalThis[stateKey];
    return true;
  }

  const toNumber = (value, fallback) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

  const readViewport = () => ({
    scrollX: toNumber(window.scrollX, toNumber(window.pageXOffset, 0)),
    scrollY: toNumber(window.scrollY, toNumber(window.pageYOffset, 0))
  });

  const emit = (message) => {
    try {
      console.debug(prefix + token + ':' + JSON.stringify(message));
    } catch (e) {}
  };

  const emitViewport = () => {
    if (!emitViewportMessages) return;
    emit({ type: 'viewport', viewport: readViewport() });
  };

  const emitMarkerEvent = (type, marker, extra) => {
    emit(Object.assign({ markerId: marker.id, type }, extra || {}));
  };

  const getRoot = () => document.body || document.documentElement;

  const ensureOverlay = (state) => {
    if (state.host && state.shadowRoot && state.tooltip && state.editor) return state.shadowRoot;
    removeOverlay(state);
    state.host = null;
    state.shadowRoot = null;
    state.markerElements = new Map();
    const root = getRoot();
    if (!root) return null;
    const host = document.createElement('div');
    host.setAttribute(hostAttribute, '');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;contain:layout style paint;overflow:hidden;';
    const shadowRoot = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = [
      '.marker{box-sizing:border-box;position:absolute;left:0;top:0;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:9999px;border:2px solid #141111;background:#27ccf3;color:#141111;font:800 11px/1 "Space Mono",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:2px 2px 0 #141111;will-change:transform;pointer-events:auto;user-select:none;cursor:pointer;}',
      '.marker:hover{transform:translate(1px,1px);box-shadow:none;}',
      '.tooltip{box-sizing:border-box;position:absolute;left:0;top:0;max-width:220px;display:none;border:2px solid #141111;border-radius:6px;background:#fffdf8;color:#141111;box-shadow:3px 3px 0 #141111;padding:6px 8px;font:700 12px/1.35 "Space Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:none;}',
      '.editor{box-sizing:border-box;position:absolute;left:0;top:0;width:min(380px,calc(100vw - 24px));display:none;flex-direction:column;border:2px solid #141111;border-radius:6px;background:#fffdf8;color:#141111;box-shadow:3px 3px 0 #141111;pointer-events:auto;font:700 12px/1.4 "Space Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.editor-main{display:flex;gap:8px;padding:8px;}',
      '.tool{display:grid;min-width:28px;height:28px;flex:0 0 auto;place-items:center;border:2px solid transparent;border-radius:4px;background:transparent;color:#716b64;padding:0 4px;font:800 10px/1 "Space Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.textarea{box-sizing:border-box;min-height:56px;flex:1;resize:vertical;border:2px solid #141111;border-radius:4px;background:#fffaf0;color:#141111;box-shadow:2px 2px 0 #141111;padding:7px 8px;font:700 12px/1.45 "Space Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;outline:none;}',
      '.actions{display:flex;align-items:center;gap:6px;border-top:2px solid #141111;background:#eee9de;padding:6px 8px;}',
      '.detailPanel{display:none;border-top:2px solid #141111;background:#fffaf0;padding:6px 8px;}',
      '.detailPanel.open{display:block;}',
      '.detailTarget{display:flex;align-items:center;justify-content:space-between;border:2px solid #141111;border-radius:4px;background:#eee9de;padding:5px 7px;font:800 11px/1 "Space Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.detailRows{display:grid;gap:5px;margin-top:6px;}',
      '.detailRow{display:grid;grid-template-columns:74px minmax(0,1fr);align-items:center;gap:6px;color:#716b64;font:700 10px/1.2 "Space Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.detailValue{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:2px solid #141111;border-radius:4px;background:#fffdf8;box-shadow:2px 2px 0 #141111;padding:4px 6px;color:#141111;font:700 10px/1.2 "Space Mono",monospace;}',
      '.spacer{flex:1;}',
      '.button{min-height:28px;border:2px solid #141111;border-radius:6px;background:#fffdf8;color:#141111;box-shadow:2px 2px 0 #141111;padding:0 10px;font:800 11px/1 "Space Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;}',
      '.button.primary{background:#141111;color:#fffaf0;}',
      '.iconButton{width:28px;min-height:28px;padding:0;color:#df5148;}'
    ].join('');
    shadowRoot.appendChild(style);
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    shadowRoot.appendChild(tooltip);
    const editor = document.createElement('div');
    editor.className = 'editor';
    editor.innerHTML = '<div class="editor-main"><button class="tool detailToggle" type="button" title="Details">DETAIL</button><textarea class="textarea" spellcheck="false"></textarea></div><div class="detailPanel"></div><div class="actions"><button class="button iconButton delete" type="button" title="Delete">DEL</button><span class="spacer"></span><button class="button cancel" type="button">取消</button><button class="button primary save" type="button">保存</button></div>';
    shadowRoot.appendChild(editor);
    root.appendChild(host);
    state.host = host;
    state.shadowRoot = shadowRoot;
    state.tooltip = tooltip;
    state.editor = editor;
    state.editorTextarea = editor.querySelector('.textarea');
    state.editorDetailPanel = editor.querySelector('.detailPanel');
    editor.querySelector('.cancel').addEventListener('click', () => hideEditor(state));
    editor.querySelector('.detailToggle').addEventListener('click', () => {
      if (!state.editorDetailPanel) return;
      state.editorDetailPanel.classList.toggle('open');
    });
    editor.querySelector('.save').addEventListener('click', () => {
      if (!state.activeEditorMarker) return;
      const value = state.editorTextarea ? state.editorTextarea.value : '';
      emitMarkerEvent('save', state.activeEditorMarker, { comment: value });
      state.activeEditorMarker.comment = value;
      hideEditor(state);
    });
    editor.querySelector('.delete').addEventListener('click', () => {
      if (!state.activeEditorMarker) return;
      emitMarkerEvent('delete', state.activeEditorMarker);
      hideEditor(state);
    });
    return shadowRoot;
  };

  const hideTooltip = (state) => {
    if (state.tooltip) state.tooltip.style.display = 'none';
  };

  const hideEditor = (state) => {
    state.activeEditorMarker = null;
    if (state.editor) state.editor.style.display = 'none';
  };

  const placeFloating = (element, x, y, fallbackWidth, fallbackHeight) => {
    if (!element) return;
    const width = element.offsetWidth || fallbackWidth;
    const height = element.offsetHeight || fallbackHeight;
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - height - 8);
    element.style.transform = 'translate3d(' + Math.max(8, Math.min(x, maxX)) + 'px,' + Math.max(8, Math.min(y, maxY)) + 'px,0)';
  };

  const showTooltip = (state, marker, x, y) => {
    if (!state.tooltip) return;
    state.tooltip.textContent = marker.comment || 'Selected element';
    state.tooltip.style.display = 'block';
    placeFloating(state.tooltip, x + markerSize + 6, y - 4, 180, 34);
  };

  const showEditor = (state, marker, x, y) => {
    if (!state.editor) return;
    state.activeEditorMarker = marker;
    if (state.editorTextarea) state.editorTextarea.value = marker.comment || '';
    renderDetails(state.editorDetailPanel, marker);
    state.editor.style.display = 'flex';
    hideTooltip(state);
    placeFloating(state.editor, x + markerSize + 6, y - 36, 380, 132);
    if (state.editorTextarea) state.editorTextarea.focus();
    emitMarkerEvent('open', marker);
  };

  const valueOrDash = (value) => {
    if (typeof value !== 'string') return '-';
    const trimmed = value.trim();
    return trimmed || '-';
  };

  const escapeHtml = (value) => valueOrDash(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const renderDetails = (container, marker) => {
    if (!container) return;
    const styles = marker && marker.computedStyles ? marker.computedStyles : {};
    container.innerHTML =
      '<div class="detailTarget"><span>' + escapeHtml(marker && marker.tagName) + '</span><span>style</span></div>' +
      '<div class="detailRows">' +
      '<div class="detailRow"><span>文本颜色</span><span class="detailValue">' + escapeHtml(styles.color) + '</span></div>' +
      '<div class="detailRow"><span>背景</span><span class="detailValue">' + escapeHtml(styles.backgroundColor) + '</span></div>' +
      '<div class="detailRow"><span>字体</span><span class="detailValue">' + escapeHtml(styles.fontFamily) + '</span></div>' +
      '<div class="detailRow"><span>字号</span><span class="detailValue">' + escapeHtml(styles.fontSize) + '</span></div>' +
      '<div class="detailRow"><span>字重</span><span class="detailValue">' + escapeHtml(styles.fontWeight) + '</span></div>' +
      '</div>';
  };

  const updateMarkers = (state, nextMarkers) => {
    state.markers = Array.isArray(nextMarkers) ? nextMarkers : [];
    if (state.markers.length === 0) {
      removeOverlay(state);
      state.host = null;
      state.shadowRoot = null;
      state.markerElements = new Map();
      return;
    }
    const shadowRoot = ensureOverlay(state);
    if (!shadowRoot) return;
    const liveIds = new Set();
    state.markers.forEach((marker) => {
      liveIds.add(marker.id);
      let element = state.markerElements.get(marker.id);
      if (!element) {
        element = document.createElement('span');
        element.className = 'marker';
        element.addEventListener('mouseenter', () => {
          const liveMarker = state.markers.find((candidate) => candidate.id === element.dataset.markerId);
          if (!liveMarker) return;
          showTooltip(state, liveMarker, toNumber(element.dataset.x, 0), toNumber(element.dataset.y, 0));
        });
        element.addEventListener('mouseleave', () => hideTooltip(state));
        element.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const liveMarker = state.markers.find((candidate) => candidate.id === element.dataset.markerId);
          if (!liveMarker) return;
          showEditor(state, liveMarker, toNumber(element.dataset.x, 0), toNumber(element.dataset.y, 0));
        });
        shadowRoot.appendChild(element);
        state.markerElements.set(marker.id, element);
      }
      element.dataset.markerId = marker.id;
      element.textContent = String(marker.index + 1);
    });
    state.markerElements.forEach((element, id) => {
      if (!liveIds.has(id)) {
        element.remove();
        state.markerElements.delete(id);
      }
    });
  };

  const positionMarkers = (state) => {
    if (!state.markers || state.markers.length === 0) return;
    const viewport = readViewport();
    const viewportWidth = toNumber(window.innerWidth, 0);
    const viewportHeight = toNumber(window.innerHeight, 0);
    state.markers.forEach((marker) => {
      const element = state.markerElements.get(marker.id);
      if (!element) return;
      const sourceRect = marker.isFixed ? marker.rectViewport : marker.rectPage;
      const x = marker.isFixed ? sourceRect.x : sourceRect.x - viewport.scrollX;
      const y = marker.isFixed ? sourceRect.y : sourceRect.y - viewport.scrollY;
      const width = toNumber(sourceRect.width, 0);
      const height = toNumber(sourceRect.height, 0);
      const visible =
        x + width >= 0 && y + height >= 0 &&
        x <= viewportWidth && y <= viewportHeight;
      if (!visible) {
        element.style.display = 'none';
        return;
      }
      element.style.display = 'flex';
      element.dataset.x = String(x + width / 2 - markerSize / 2);
      element.dataset.y = String(y + height - markerSize / 2);
      element.style.transform =
        'translate3d(' +
        (x + width / 2 - markerSize / 2) + 'px,' +
        (y + height - markerSize / 2) + 'px,0)';
    });
  };

  if (existing && existing.requestUpdate) {
    existing.emitViewport = emitViewport;
    updateMarkers(existing, markers);
    existing.requestUpdate();
    return true;
  }

  const state = {
    raf: 0,
    emitViewport,
    host: null,
    markerElements: new Map(),
    markers: [],
    shadowRoot: null,
    requestUpdate: null
  };

  state.requestUpdate = () => {
    if (state.raf) return;
    state.raf = requestAnimationFrame(() => {
      state.raf = 0;
      positionMarkers(state);
      state.emitViewport();
    });
  };

  updateMarkers(state, markers);
  window.addEventListener('scroll', state.requestUpdate, true);
  document.addEventListener('scroll', state.requestUpdate, true);
  window.addEventListener('resize', state.requestUpdate, true);
  globalThis[stateKey] = state;
  state.requestUpdate();
  return true;
})();`;
}
