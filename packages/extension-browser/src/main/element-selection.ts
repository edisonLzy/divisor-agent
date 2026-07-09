import type { WebContents } from "electron";

import type { BrowserGrabPayload, BrowserRect } from "../common/types";

const SELECTION_SCRIPT = String.raw`(() => new Promise((resolve) => {
  'use strict';

  // Why: always tear down any pre-existing state before arming.
  if (window.__divisorGrab) {
    try { window.__divisorGrab.cleanup(); } catch(e) {}
    delete window.__divisorGrab;
  }

  // --- Budget constants (mirrored from shared types) ---
  var BUDGET = {
    textSnippetMaxLength: 200,
    nearbyTextEntryMaxLength: 200,
    nearbyTextMaxEntries: 10,
    htmlSnippetMaxLength: 4096,
    ancestorPathMaxEntries: 10,
    nearbyElementsMaxEntries: 6,
    nearbyElementMaxLength: 160,
    selectorMaxLength: 700,
    pathMaxLength: 900,
    cssClassesMaxLength: 500,
    selectedTextMaxLength: 500,
    sourceFileMaxLength: 500,
    reactComponentsMaxLength: 500
  };
  var TEXT_NODE_SCAN_LIMIT = 80;
  var NEARBY_ELEMENT_SCAN_LIMIT = 80;

  // --- Safe attribute names ---
  var SAFE_ATTRS = new Set([
    'id', 'class', 'name', 'type', 'role', 'href', 'src', 'alt',
    'title', 'placeholder', 'for', 'action', 'method'
  ]);

  var SECRET_PATTERNS = [
    'access_token', 'auth_token', 'api_key', 'apikey', 'client_secret',
    'oauth_state', 'x-amz-', 'session_id', 'sessionid', 'csrf',
    'secret', 'password', 'passwd'
  ];

  var SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

  var STYLE_PROPS = [
    'display', 'position', 'width', 'height', 'margin', 'padding',
    'color', 'backgroundColor', 'border', 'borderRadius', 'fontFamily',
    'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'zIndex'
  ];

  // --- Helpers ---
  function clampStr(s, max) {
    if (!s || typeof s !== 'string') return '';
    if (s.length <= max) return s;
    return s.slice(0, max) + ' (truncated)';
  }

  function containsSecret(value) {
    if (!value) return false;
    var lower = value.toLowerCase();
    for (var i = 0; i < SECRET_PATTERNS.length; i++) {
      if (lower.indexOf(SECRET_PATTERNS[i]) !== -1) return true;
    }
    return false;
  }

  function sanitizeUrl(url) {
    try {
      var u = new URL(url);
      if (u.protocol === 'about:') {
        return u.toString() === 'about:blank' ? 'about:blank' : '';
      }
      if (!SAFE_URL_PROTOCOLS.has(u.protocol)) return '';
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch (e) {
      return '';
    }
  }

  function isWhitespaceCode(code) {
    return code === 32 || (code >= 9 && code <= 13) || code === 160 ||
      code === 5760 || (code >= 8192 && code <= 8202) || code === 8232 ||
      code === 8233 || code === 8239 || code === 8287 || code === 12288 ||
      code === 65279;
  }

  function getBoundedText(el, max) {
    try {
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      var text = '';
      var pendingSpace = false;
      var inspected = 0;
      var limit = max + 20;
      var node = walker.nextNode();
      while (node && text.length < limit && inspected < TEXT_NODE_SCAN_LIMIT) {
        inspected++;
        if (text.length > 0) pendingSpace = true;
        var value = node.nodeValue || '';
        for (var i = 0; i < value.length && text.length < limit; i++) {
          var code = value.charCodeAt(i);
          if (isWhitespaceCode(code)) {
            if (text.length > 0) pendingSpace = true;
            continue;
          }
          if (pendingSpace) {
            text += ' ';
            pendingSpace = false;
            if (text.length >= limit) break;
          }
          text += value.charAt(i);
        }
        node = walker.nextNode();
      }
      return clampStr(text.trim(), max);
    } catch (e) { return ''; }
  }

  function getTextSnippet(el) {
    return getBoundedText(el, BUDGET.textSnippetMaxLength);
  }

  function getSelectedText() {
    try {
      var selection = window.getSelection ? window.getSelection() : null;
      if (!selection || selection.rangeCount === 0) return '';
      var text = '';
      var pendingSpace = false;
      var inspected = 0;
      for (var i = 0; i < selection.rangeCount && text.length < BUDGET.selectedTextMaxLength + 20; i++) {
        var range = selection.getRangeAt(i);
        var walkerRoot = range.commonAncestorContainer;
        var walker = document.createTreeWalker(
          walkerRoot, NodeFilter.SHOW_TEXT,
          { acceptNode: function(node) {
            if (range.intersectsNode && !range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }}
        );
        var node = walkerRoot.nodeType === Node.TEXT_NODE ? walkerRoot : walker.nextNode();
        while (node && text.length < BUDGET.selectedTextMaxLength + 20 && inspected < TEXT_NODE_SCAN_LIMIT) {
          inspected++;
          var nodeValue = node.nodeValue || '';
          if (text.length > 0) pendingSpace = true;
          var start = node === range.startContainer ? range.startOffset : 0;
          var end = node === range.endContainer ? range.endOffset : nodeValue.length;
          var slice = nodeValue.slice(start, end);
          for (var j = 0; j < slice.length && text.length < BUDGET.selectedTextMaxLength + 20; j++) {
            var code = slice.charCodeAt(j);
            if (isWhitespaceCode(code)) {
              if (text.length > 0) pendingSpace = true;
              continue;
            }
            if (pendingSpace) { text += ' '; pendingSpace = false; }
            text += slice.charAt(j);
          }
          node = walker.nextNode();
        }
      }
      return clampStr(text.trim(), BUDGET.selectedTextMaxLength);
    } catch (e) { return ''; }
  }

  function getHtmlSnippet(el) {
    var clone = el.cloneNode(true);
    var scripts = clone.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) scripts[i].remove();
    return clampStr(clone.outerHTML || '', BUDGET.htmlSnippetMaxLength);
  }

  function getSafeAttributes(el) {
    var attrs = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      var name = attr.name.toLowerCase();
      var isAria = name.indexOf('aria-') === 0;
      if (!SAFE_ATTRS.has(name) && !isAria) continue;
      var value = attr.value;
      if (containsSecret(value)) {
        attrs[name] = '[redacted]';
      } else if ((name === 'href' || name === 'src' || name === 'action') && value) {
        attrs[name] = sanitizeUrl(value);
      } else if (name === 'class') {
        attrs[name] = clampStr(value, 200);
      } else {
        attrs[name] = value;
      }
    }
    return attrs;
  }

  function getAccessibility(el) {
    var role = el.getAttribute('role') || null;
    var ariaLabel = el.getAttribute('aria-label') || null;
    var ariaLabelledBy = el.getAttribute('aria-labelledby') || null;
    var accessibleName = null;
    if (ariaLabel) {
      accessibleName = ariaLabel;
    } else if (ariaLabelledBy) {
      var ids = ariaLabelledBy.split(/\s+/).filter(Boolean);
      var names = [];
      for (var i = 0; i < ids.length && i < 32; i++) {
        var ref = document.getElementById(ids[i]);
        if (ref) names.push(getBoundedText(ref, 100));
      }
      if (names.length) accessibleName = names.join(' ');
    } else {
      var tag = el.tagName.toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'label') {
        accessibleName = getBoundedText(el, 100);
      } else if (el.getAttribute('title')) {
        accessibleName = el.getAttribute('title');
      } else if (el.getAttribute('alt')) {
        accessibleName = el.getAttribute('alt');
      }
    }
    return { role: role, accessibleName: accessibleName, ariaLabel: ariaLabel, ariaLabelledBy: ariaLabelledBy };
  }

  function getComputedStyleSubset(el) {
    var cs = window.getComputedStyle(el);
    var result = {};
    for (var i = 0; i < STYLE_PROPS.length; i++) {
      result[STYLE_PROPS[i]] = cs.getPropertyValue(
        STYLE_PROPS[i].replace(/[A-Z]/g, function(m) { return '-' + m.toLowerCase(); })
      ) || '';
    }
    return result;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function(ch) { return '\\\\' + ch; });
  }

  function looksHashy(value) {
    return /^[A-Za-z0-9_-]{12,}$/.test(value) && /\d/.test(value) && /[A-Z]/.test(value);
  }

  function getStableClasses(el, maxCount) {
    if (!el.classList) return [];
    var result = [];
    for (var i = 0; i < el.classList.length && result.length < maxCount; i++) {
      var cls = el.classList[i];
      if (!cls || cls.length > 60 || containsSecret(cls)) continue;
      if (/^css-[a-z0-9]+$/i.test(cls) || looksHashy(cls)) continue;
      result.push(cls);
    }
    return result;
  }

  function buildSelectorPart(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.id;
    if (id && !containsSecret(id)) return tag + '#' + cssEscape(id);
    var classes = getStableClasses(el, 2);
    if (classes.length > 0) return tag + classes.map(function(cls) { return '.' + cssEscape(cls); }).join('');
    return tag;
  }

  function isUniqueSelector(selector) {
    try { return document.querySelectorAll(selector).length === 1; }
    catch(e) { return false; }
  }

  function getNthOfTypeSuffix(current) {
    var tag = current.tagName;
    var index = 1;
    var sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === tag) index++;
      sibling = sibling.previousElementSibling;
    }
    if (index > 1) return ':nth-of-type(' + index + ')';
    sibling = current.nextElementSibling;
    while (sibling) {
      if (sibling.tagName === tag) return ':nth-of-type(1)';
      sibling = sibling.nextElementSibling;
    }
    return '';
  }

  function buildSelector(el) {
    var parts = [];
    var current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body && parts.length < 10) {
      var part = buildSelectorPart(current);
      var parent = current.parentElement;
      if (parent && !isUniqueSelector(parts.concat([part]).reverse().join(' > '))) {
        part += getNthOfTypeSuffix(current);
      }
      parts.unshift(part);
      var selector = parts.join(' > ');
      if (isUniqueSelector(selector)) return clampStr(selector, BUDGET.selectorMaxLength);
      current = parent;
    }
    return clampStr(parts.join(' > ') || el.tagName.toLowerCase(), BUDGET.selectorMaxLength);
  }

  function buildReadablePath(el) {
    var parts = [];
    var current = el;
    while (current && current !== document.documentElement && parts.length < 6) {
      var tag = current.tagName.toLowerCase();
      if (tag === 'html' || tag === 'body') break;
      var label = tag;
      var aria = current.getAttribute('aria-label');
      var role = current.getAttribute('role');
      var stableClasses = getStableClasses(current, 1);
      if (current.id && !containsSecret(current.id)) {
        label = '#' + cssEscape(current.id);
      } else if (aria && !containsSecret(aria)) {
        label = tag + '[aria-label="' + clampStr(aria, 40).replace(/"/g, '\\"') + '"]';
      } else if (role && !containsSecret(role)) {
        label = tag + '[role="' + clampStr(role, 30).replace(/"/g, '\\"') + '"]';
      } else if (stableClasses.length > 0) {
        label = '.' + cssEscape(stableClasses[0]);
      }
      parts.unshift(label);
      current = current.parentElement;
    }
    return clampStr(parts.join(' > '), BUDGET.pathMaxLength);
  }

  function buildFullPath(el) {
    var parts = [];
    var current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement && parts.length < 20) {
      parts.unshift(buildSelectorPart(current));
      current = current.parentElement;
    }
    return clampStr(parts.join(' > '), BUDGET.pathMaxLength);
  }

  function getNearbyText(el) {
    var results = [];
    var parent = el.parentElement;
    if (!parent) return results;
    function addSiblingText(sibling) {
      if (!sibling) return;
      var text = getBoundedText(sibling, BUDGET.nearbyTextEntryMaxLength);
      if (text) results.push(clampStr(text, BUDGET.nearbyTextEntryMaxLength));
    }
    var inspected = 0;
    var previous = el.previousElementSibling;
    var next = el.nextElementSibling;
    while (results.length < BUDGET.nearbyTextMaxEntries && inspected < NEARBY_ELEMENT_SCAN_LIMIT && (previous || next)) {
      if (previous) { var ps = previous; previous = previous.previousElementSibling; inspected++; addSiblingText(ps); }
      if (next && results.length < BUDGET.nearbyTextMaxEntries && inspected < NEARBY_ELEMENT_SCAN_LIMIT) {
        var ns = next; next = next.nextElementSibling; inspected++; addSiblingText(ns);
      }
    }
    return results;
  }

  function getAncestorPath(el) {
    var path = [];
    var current = el.parentElement;
    while (current && current !== document.documentElement && path.length < BUDGET.ancestorPathMaxEntries) {
      var tag = current.tagName.toLowerCase();
      var role = current.getAttribute('role');
      path.push(role ? tag + '[role=' + role + ']' : tag);
      current = current.parentElement;
    }
    return path;
  }

  function getNearbyElements(el) {
    var parent = el.parentElement;
    if (!parent) return [];
    var result = [];
    function addSibling(sibling) {
      if (!sibling || sibling === el) return;
      var rect = sibling.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      var label = sibling.tagName.toLowerCase();
      var stableClasses = getStableClasses(sibling, 1);
      if (stableClasses.length > 0) label += '.' + stableClasses[0];
      var text = getBoundedText(sibling, 50);
      if (text) label += ' "' + clampStr(text, 50) + '"';
      result.push(clampStr(label, BUDGET.nearbyElementMaxLength));
    }
    var inspected = 0;
    var previous = el.previousElementSibling;
    var next = el.nextElementSibling;
    while (result.length < BUDGET.nearbyElementsMaxEntries && inspected < NEARBY_ELEMENT_SCAN_LIMIT && (previous || next)) {
      if (previous) { var ps = previous; previous = previous.previousElementSibling; inspected++; addSibling(ps); }
      if (next && result.length < BUDGET.nearbyElementsMaxEntries && inspected < NEARBY_ELEMENT_SCAN_LIMIT) {
        var ns = next; next = next.nextElementSibling; inspected++; addSibling(ns);
      }
    }
    return result;
  }

  function isElementFixed(el) {
    var current = el;
    while (current && current !== document.body) {
      var position = window.getComputedStyle(current).position;
      if (position === 'fixed' || position === 'sticky') return true;
      current = current.parentElement;
    }
    return false;
  }

  function getFiberFromElement(el) {
    var keys = Object.keys(el);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactFiber$') === 0 || keys[i].indexOf('__reactInternalInstance$') === 0) {
        try { return el[keys[i]] || null; } catch (e) { return null; }
      }
    }
    return null;
  }

  function getComponentNameFromFiber(fiber) {
    if (!fiber) return null;
    var type = fiber.type || fiber.elementType;
    if (!type || typeof type === 'string') return null;
    if (type.displayName || type.name) return type.displayName || type.name;
    if (type.render && (type.render.displayName || type.render.name)) return type.render.displayName || type.render.name;
    return null;
  }

  function shouldSkipReactName(name) {
    if (!name || name.length <= 2) return true;
    return /^(Fragment|Root|Routes|Route|Outlet|Provider|Consumer|Profiler|Suspense)$/.test(name) ||
      /(?:Boundary|BoundaryHandler|Router|Provider|Consumer|Context|Wrapper)$/.test(name) ||
      /^(Inner|Outer|Client|Server|RSC|Dev|React|Hot)/.test(name);
  }

  function cleanSourcePath(path) {
    if (!path) return '';
    return String(path)
      .replace(/[?#].*$/, '')
      .replace(/^turbopack:\/\/\/\[project\]\//, '')
      .replace(/^webpack-internal:\/\/\/\.\//, '')
      .replace(/^webpack:\/\/\/\.\//, '')
      .replace(/^https?:\/\/[^/]+\//, '')
      .replace(/^file:\/\/\//, '/')
      .replace(/^\([^)]+\)\/\.\//, '')
      .replace(/^\.\//, '');
  }

  function getReactMetadata(el) {
    try {
      var fiber = getFiberFromElement(el);
      var components = [];
      var sourceFile = null;
      var depth = 0;
      while (fiber && depth < 35) {
        var name = getComponentNameFromFiber(fiber);
        if (name && !shouldSkipReactName(name) && components.indexOf(name) === -1 && components.length < 6) {
          components.push(name);
        }
        var source = fiber._debugSource || (fiber._debugOwner && fiber._debugOwner._debugSource);
        if (!sourceFile && source && source.fileName && source.lineNumber) {
          sourceFile = cleanSourcePath(source.fileName) + ':' + source.lineNumber +
            (source.columnNumber !== undefined ? ':' + source.columnNumber : '');
          if (containsSecret(sourceFile)) sourceFile = null;
        }
        fiber = fiber.return;
        depth++;
      }
      return {
        reactComponents: components.length > 0
          ? clampStr(components.slice().reverse().map(function(c) { return '<' + c + '>'; }).join(' '), BUDGET.reactComponentsMaxLength)
          : null,
        sourceFile: sourceFile ? clampStr(sourceFile, BUDGET.sourceFileMaxLength) : null
      };
    } catch (e) { return { reactComponents: null, sourceFile: null }; }
  }

  // --- Build full payload ---
  function extractPayload(el) {
    var rect = el.getBoundingClientRect();
    var react = getReactMetadata(el);
    return {
      page: {
        sanitizedUrl: sanitizeUrl(window.location.href),
        title: document.title || '',
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        devicePixelRatio: window.devicePixelRatio || 1,
        capturedAt: new Date().toISOString()
      },
      target: {
        tagName: el.tagName.toLowerCase(),
        selector: buildSelector(el),
        elementPath: buildReadablePath(el),
        fullPath: buildFullPath(el),
        cssClasses: containsSecret(el.getAttribute('class') || '')
          ? '[redacted]'
          : clampStr(el.getAttribute('class') || '', BUDGET.cssClassesMaxLength),
        nearbyElements: getNearbyElements(el),
        selectedText: getSelectedText() || null,
        isFixed: isElementFixed(el),
        reactComponents: react.reactComponents,
        sourceFile: react.sourceFile,
        textSnippet: getTextSnippet(el),
        htmlSnippet: getHtmlSnippet(el),
        attributes: getSafeAttributes(el),
        accessibility: getAccessibility(el),
        rectViewport: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        rectPage: { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height },
        computedStyles: getComputedStyleSubset(el)
      },
      nearbyText: getNearbyText(el),
      ancestorPath: getAncestorPath(el),
      screenshot: null
    };
  }

  // --- Overlay UI ---
  var host = document.createElement('div');
  host.id = '__divisor-grab-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:all;cursor:crosshair;';
  document.documentElement.appendChild(host);

  var shadow = host.attachShadow({ mode: 'closed' });

  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;';
  shadow.appendChild(overlay);

  var highlightBox = document.createElement('div');
  highlightBox.style.cssText = 'position:fixed;border:2px solid rgba(255,255,255,0.9);border-radius:3px;pointer-events:none;transition:all 0.05s ease-out;display:none;background:rgba(255,255,255,0.08);box-shadow:0 0 0 1px rgba(0,0,0,0.3),0 2px 8px rgba(0,0,0,0.15);';
  overlay.appendChild(highlightBox);

  var hoverLabel = document.createElement('div');
  hoverLabel.style.cssText = 'position:fixed;padding:3px 8px;background:rgba(30,30,30,0.92);color:#e5e5e5;font:11px/1.4 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;border-radius:4px;pointer-events:none;white-space:nowrap;display:none;max-width:300px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
  overlay.appendChild(hoverLabel);

  var commentEditor = document.createElement('div');
  commentEditor.style.cssText = 'position:fixed;display:none;align-items:center;gap:6px;width:min(360px,calc(100vw - 24px));min-height:44px;border:2px solid #141111;border-radius:6px;background:#fffdf8;color:#141111;box-shadow:3px 3px 0 #141111;padding:6px 8px;pointer-events:auto;font:700 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
  commentEditor.innerHTML = '<button type="button" data-action="detail" title="Details" style="display:grid;width:26px;height:26px;place-items:center;border:2px solid transparent;border-radius:4px;background:transparent;color:#716b64;padding:0;font:800 10px/1 sans-serif;">DETAIL</button><input data-role="comment" placeholder="添加评论..." spellcheck="false" style="box-sizing:border-box;min-width:0;height:28px;flex:1;border:2px solid #141111;border-radius:4px;background:#fffaf0;color:#141111;box-shadow:2px 2px 0 #141111;padding:0 8px;font:700 12px/1 -apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,sans-serif;outline:none;" /><button type="button" data-action="save" title="Save comment" style="display:grid;width:28px;height:28px;place-items:center;border:2px solid #141111;border-radius:4px;background:#141111;color:#fffaf0;box-shadow:2px 2px 0 #141111;padding:0;font:800 12px/1 sans-serif;">OK</button><button type="button" data-action="cancel" title="Cancel" style="display:grid;width:28px;height:28px;place-items:center;border:2px solid #141111;border-radius:4px;background:#fffdf8;color:#141111;box-shadow:2px 2px 0 #141111;padding:0;font:800 12px/1 sans-serif;">X</button>';
  overlay.appendChild(commentEditor);
  var commentInput = commentEditor.querySelector('[data-role="comment"]');
  var detailPanel = document.createElement('div');
  detailPanel.style.cssText = 'position:fixed;display:none;width:min(360px,calc(100vw - 24px));border:2px solid #141111;border-radius:6px;background:#fffdf8;color:#141111;box-shadow:3px 3px 0 #141111;padding:6px 8px;pointer-events:auto;font:700 11px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
  overlay.appendChild(detailPanel);
  var pendingResult = null;

  var currentEl = null;

  function updateHighlight(el) {
    if (!el || el === document.documentElement || el === document.body) {
      highlightBox.style.display = 'none';
      hoverLabel.style.display = 'none';
      currentEl = null;
      return;
    }
    currentEl = el;
    var rect = el.getBoundingClientRect();
    highlightBox.style.left = rect.x + 'px';
    highlightBox.style.top = rect.y + 'px';
    highlightBox.style.width = rect.width + 'px';
    highlightBox.style.height = rect.height + 'px';
    highlightBox.style.display = 'block';

    var tag = el.tagName.toLowerCase();
    var role = el.getAttribute('role');
    var text = getBoundedText(el, 40);
    if (text.length > 40) text = text.slice(0, 37) + '...';
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    var parts = [tag];
    if (role) parts.push('role=' + role);
    if (text) parts.push('"' + text + '"');
    parts.push(w + 'x' + h);
    hoverLabel.textContent = parts.join('  ');

    var labelY = rect.bottom + 6;
    if (labelY + 28 > window.innerHeight) labelY = rect.top - 28;
    hoverLabel.style.left = Math.max(4, rect.x) + 'px';
    hoverLabel.style.top = labelY + 'px';
    hoverLabel.style.display = 'block';
  }

  function onPointerMove(e) {
    host.style.pointerEvents = 'none';
    var el = document.elementFromPoint(e.clientX, e.clientY);
    host.style.pointerEvents = 'all';
    if (el) requestAnimationFrame(function() { updateHighlight(el); });
  }

  host.addEventListener('mousemove', onPointerMove);

  function freezeHighlight() {
    host.removeEventListener('mousemove', onPointerMove);
    host.style.pointerEvents = 'all';
    host.style.cursor = 'default';
    hoverLabel.style.display = 'none';
  }

  function placeCommentEditor(rect) {
    var width = commentEditor.offsetWidth || 360;
    var height = commentEditor.offsetHeight || 44;
    var x = rect.x + rect.width / 2 - width / 2;
    var y = rect.bottom + 8;
    if (y + height > window.innerHeight - 8) y = rect.top - height - 8;
    commentEditor.style.left = Math.max(8, Math.min(x, window.innerWidth - width - 8)) + 'px';
    commentEditor.style.top = Math.max(8, Math.min(y, window.innerHeight - height - 8)) + 'px';
    detailPanel.style.left = commentEditor.style.left;
    detailPanel.style.top = Math.max(8, Math.min(y + height + 8, window.innerHeight - 220)) + 'px';
  }

  function showCommentEditor(result) {
    pendingResult = result;
    var rect = currentEl ? currentEl.getBoundingClientRect() : result.payload.target.rectViewport;
    renderDetailPanel(result.payload);
    detailPanel.style.display = 'none';
    commentEditor.style.display = 'flex';
    placeCommentEditor(rect);
    if (commentInput) commentInput.focus();
  }

  function addDetailRow(container, label, value) {
    var row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:72px minmax(0,1fr);align-items:center;gap:6px;min-height:26px;color:#716b64;';
    var name = document.createElement('span');
    name.textContent = label;
    var data = document.createElement('span');
    data.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:2px solid #141111;border-radius:4px;background:#fffaf0;box-shadow:2px 2px 0 #141111;padding:4px 6px;color:#141111;font:700 10px/1.2 monospace;';
    data.textContent = value || '-';
    row.appendChild(name);
    row.appendChild(data);
    container.appendChild(row);
  }

  function renderDetailPanel(payload) {
    detailPanel.textContent = '';
    var target = document.createElement('div');
    target.style.cssText = 'display:flex;justify-content:space-between;border:2px solid #141111;border-radius:4px;background:#eee9de;padding:5px 7px;margin-bottom:6px;color:#141111;font-weight:800;';
    var tag = document.createElement('span');
    tag.textContent = payload.target.tagName || 'element';
    var label = document.createElement('span');
    label.textContent = 'style';
    target.appendChild(tag);
    target.appendChild(label);
    detailPanel.appendChild(target);
    addDetailRow(detailPanel, '文本颜色', payload.target.computedStyles.color);
    addDetailRow(detailPanel, '背景', payload.target.computedStyles.backgroundColor);
    addDetailRow(detailPanel, '字体', payload.target.computedStyles.fontFamily);
    addDetailRow(detailPanel, '字号', payload.target.computedStyles.fontSize);
    addDetailRow(detailPanel, '字重', payload.target.computedStyles.fontWeight);
  }

  function cleanup() {
    host.removeEventListener('mousemove', onPointerMove);
    try { host.remove(); } catch(e) {}
    delete window.__divisorGrab;
  }

  commentEditor.addEventListener('click', function(e) {
    var target = e.target;
    if (!target || !target.getAttribute) return;
    var action = target.getAttribute('data-action');
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    if (action === 'cancel') {
      cleanup();
      resolve(null);
      return;
    }
    if (action === 'detail') {
      detailPanel.style.display = detailPanel.style.display === 'none' ? 'block' : 'none';
      return;
    }
    if (action === 'save' && pendingResult) {
      var comment = commentInput && commentInput.value ? commentInput.value.trim() : '';
      var result = {
        kind: pendingResult.kind,
        payload: pendingResult.payload,
        comment: comment || 'Selected element'
      };
      cleanup();
      resolve(result);
    }
  });

  commentEditor.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
      resolve(null);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && pendingResult) {
      e.preventDefault();
      var comment = commentInput && commentInput.value ? commentInput.value.trim() : '';
      var result = {
        kind: pendingResult.kind,
        payload: pendingResult.payload,
        comment: comment || 'Selected element'
      };
      cleanup();
      resolve(result);
    }
  });

  window.__divisorGrab = {
    host: host,
    extractPayload: extractPayload,
    getCurrentElement: function() { return currentEl; },
    freezeHighlight: freezeHighlight,
    cleanup: cleanup
  };

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
      resolve(null);
    }
  }
  document.addEventListener('keydown', onKey, true);

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    host.removeEventListener('click', onClick, true);
    host.removeEventListener('contextmenu', onContext, true);
    document.removeEventListener('keydown', onKey, true);
    var el = currentEl;
    if (!el) { cleanup(); resolve(null); return; }
    var payload = extractPayload(el);
    freezeHighlight();
    showCommentEditor({ kind: 'selected', payload: payload });
  }

  function onContext(e) {
    e.preventDefault();
    e.stopPropagation();
    host.removeEventListener('click', onClick, true);
    host.removeEventListener('contextmenu', onContext, true);
    document.removeEventListener('keydown', onKey, true);
    var el = currentEl;
    if (!el) { cleanup(); resolve(null); return; }
    var payload = extractPayload(el);
    freezeHighlight();
    showCommentEditor({ kind: 'context-selected', payload: payload });
  }

  host.addEventListener('click', onClick, true);
  host.addEventListener('contextmenu', onContext, true);

  window.__divisorCancelBrowserPicker = function() {
    document.removeEventListener('keydown', onKey, true);
    cleanup();
    resolve(null);
  };
}))()`;

export async function selectElement(contents: WebContents) {
  const result = (await contents.executeJavaScript(SELECTION_SCRIPT, true)) as {
    comment: string;
    kind: "selected" | "context-selected";
    payload: BrowserGrabPayload;
  } | null;

  if (!result) throw new Error("Element selection cancelled");
  if (result.kind === "context-selected") {
    // For context menu, provide a full-page screenshot
    const image = await contents.capturePage();
    return {
      comment: result.comment,
      kind: "context-selected",
      payload: result.payload,
      screenshotDataUrl: image.toDataURL(),
    };
  }
  // For left-click, capture just the element rect
  const rect = result.payload.target.rectViewport;
  const image = await contents.capturePage(toRectangle(rect));
  return {
    comment: result.comment,
    kind: "selected",
    payload: result.payload,
    screenshotDataUrl: image.toDataURL(),
  };
}

export async function cancelElementSelection(contents: WebContents) {
  await contents.executeJavaScript("window.__divisorCancelBrowserPicker?.()", true).catch(() => {});
}

function toRectangle(rect: BrowserRect): Electron.Rectangle {
  return {
    height: Math.max(1, Math.round(rect.height)),
    width: Math.max(1, Math.round(rect.width)),
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
  };
}
