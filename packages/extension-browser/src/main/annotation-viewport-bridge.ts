import type { BrowserAnnotationViewportBridgeMarker } from "../common/types";

// ---------------------------------------------------------------------------
// Viewport bridge - injects numbered annotation badges into the page
//
// Scope: this script ONLY renders numbered marker pins that follow the target
// element through scroll/resize, and emits `hover`/`open` events back to the
// host. The tooltip and comment editor are React overlays in the host
// renderer (annotation-tooltip.tsx / annotation-editor.tsx), positioned with
// @floating-ui against the marker's screen coordinates. That split is the whole
// point: pins must live in the guest to track the element through scroll, but
// everything visual (tooltip, editor, icons) stays in React for types/lint/tests.
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
 * into a guest page via a shadow DOM overlay. Injected via executeJavaScript()
 * and runs in the page's own world.
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

  // Emit a marker interaction (hover/open) with the geometry the host needs to
  // anchor its React overlay at the marker's guest-viewport position.
  const emitMarkerEvent = (type, marker, anchorX, anchorY, extra) => {
    emit(Object.assign({
      markerId: marker.id,
      type,
      anchorX,
      anchorY,
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
    if (state.host && state.shadowRoot) return state.shadowRoot;
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
    style.textContent = '.marker{box-sizing:border-box;position:absolute;left:0;top:0;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:9999px;border:2px solid #141111;background:#27ccf3;color:#141111;font:800 11px/1 "Space Mono",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:2px 2px 0 #141111;will-change:transform;pointer-events:auto;user-select:none;cursor:pointer;}.marker:hover{transform:translate(1px,1px);box-shadow:none;}';
    shadowRoot.appendChild(style);
    root.appendChild(host);
    state.host = host;
    state.shadowRoot = shadowRoot;
    return shadowRoot;
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
          emitMarkerEvent('hover', liveMarker, toNumber(element.dataset.x, 0), toNumber(element.dataset.y, 0));
        });
        element.addEventListener('mouseleave', () => {
          emit({ type: 'hover', markerId: null });
        });
        element.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const liveMarker = state.markers.find((candidate) => candidate.id === element.dataset.markerId);
          if (!liveMarker) return;
          // The React editor in the host handles editing; we just surface
          // which marker was clicked plus its live geometry.
          emitMarkerEvent('open', liveMarker, toNumber(element.dataset.x, 0), toNumber(element.dataset.y, 0));
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
      // Pin sits at the element's bottom-center; dataset carries its guest-
      // viewport coords for the host to convert to screen coords on event.
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
