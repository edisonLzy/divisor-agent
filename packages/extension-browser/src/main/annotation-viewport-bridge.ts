import type { BrowserAnnotationViewportBridgeMarker } from "../common/types";

// ---------------------------------------------------------------------------
// Viewport bridge - injects numbered annotation badges into the page
//
// Scope: this script ONLY renders numbered marker pins that follow the target
// element through scroll/resize, shows a lightweight hover tooltip, and emits
// `open`/`save`/`delete` events back to the host. The comment editor itself is
// a React overlay in the host renderer (annotation-editor.tsx) - it is NOT
// injected here. That split is the whole point of the migration: the editor
// gets types/lint/icons/Popover collision handling, while this script stays a
// thin, auditable string that runs in the guest page.
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
    emit(Object.assign({
      markerId: marker.id,
      type,
      // Geometry the host needs to anchor the React editor at the marker.
      rectPage: marker.rectPage,
      rectViewport: marker.rectViewport,
      isFixed: marker.isFixed,
      comment: marker.comment,
      intent: marker.intent,
      tagName: marker.tagName,
      computedStyles: marker.computedStyles
    }, extra || {}));
  };

  const getRoot = () => document.body || document.documentElement;

  const ensureOverlay = (state) => {
    if (state.host && state.shadowRoot && state.tooltip) return state.shadowRoot;
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
      '.tooltip{box-sizing:border-box;position:absolute;left:0;top:0;max-width:220px;display:none;border:2px solid #141111;border-radius:6px;background:#fffdf8;color:#141111;box-shadow:3px 3px 0 #141111;padding:6px 8px;font:700 12px/1.35 "Space Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:none;}'
    ].join('');
    shadowRoot.appendChild(style);
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    shadowRoot.appendChild(tooltip);
    root.appendChild(host);
    state.host = host;
    state.shadowRoot = shadowRoot;
    state.tooltip = tooltip;
    return shadowRoot;
  };

  const hideTooltip = (state) => {
    if (state.tooltip) state.tooltip.style.display = 'none';
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
          // The React editor in the host renderer handles editing; we just
          // surface which marker was clicked plus its live geometry.
          emitMarkerEvent('open', liveMarker);
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
