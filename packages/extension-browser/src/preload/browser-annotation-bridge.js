const { ipcRenderer } = require("electron");

const ANNOTATION_CHANNEL = "__divisor-reading-annotation__";
const COMMAND_CHANNEL = "__divisor-reading-annotation-command__";
const HIGHLIGHT_SELECTOR = "span[data-divisor-reading-annotation]";
const MAX_SELECTED_TEXT = 2_000;

let enabled = true;
let selectionTimer = null;
let previousViewport = { scrollX: 0, scrollY: 0 };
let activeTagFilter = null;
let activeAnnotationId = null;
let restorationTimer = null;
let restorationSuppressedUntil = 0;
let trackedAnnotations = new Map();
let scrollFrame = null;

function emitViewport() {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  if (scrollX === previousViewport.scrollX && scrollY === previousViewport.scrollY) return false;
  previousViewport = { scrollX, scrollY };
  ipcRenderer.sendToHost("__divisor-viewport__", { scrollX, scrollY, type: "viewport" });
  return true;
}

function loop() {
  if (emitViewport()) emitActiveAnnotationPosition();
  requestAnimationFrame(loop);
}

function scheduleScrollPosition() {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = null;
    emitViewport();
    emitActiveAnnotationPosition();
  });
}

function queueSelection() {
  if (!enabled) return;
  if (selectionTimer) window.clearTimeout(selectionTimer);
  selectionTimer = window.setTimeout(emitSelection, 60);
}

function emitSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const text = selection.toString().replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > MAX_SELECTED_TEXT) return;

  const range = selection.getRangeAt(0);
  const serializedRange = serializeRange(range);
  if (!serializedRange) return;
  const rect = serializeRect(range.getBoundingClientRect());
  if (rect.width === 0 && rect.height === 0) return;

  ipcRenderer.sendToHost(ANNOTATION_CHANNEL, {
    page: { sanitizedUrl: sanitizeUrl(window.location.href), title: document.title.slice(0, 300) },
    range: serializedRange,
    rectViewport: rect,
    sentence: sentenceFor(range),
    text,
    type: "selection",
  });
}

function serializeRange(range) {
  const start = xpathFor(range.startContainer);
  const end = xpathFor(range.endContainer);
  if (!start || !end) return null;
  return {
    end,
    endOffset: range.endOffset,
    start,
    startOffset: range.startOffset,
  };
}

function xpathFor(node) {
  const segments = [];
  let current = node;
  while (current && current !== document.body) {
    const parent = current.parentNode;
    if (!parent) return null;
    if (current.nodeType === Node.TEXT_NODE) {
      let index = 0;
      for (const sibling of parent.childNodes) {
        if (sibling.nodeType === Node.TEXT_NODE) index += 1;
        if (sibling === current) break;
      }
      segments.unshift(`text()[${index}]`);
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      const tagName = current.nodeName.toLowerCase();
      let index = 0;
      for (const sibling of parent.children) {
        if (sibling.nodeName.toLowerCase() === tagName) index += 1;
        if (sibling === current) break;
      }
      segments.unshift(`${tagName}[${index}]`);
    } else {
      return null;
    }
    current = parent;
  }
  return current === document.body ? `./${segments.join("/")}` : null;
}

function rangeFromSerialized(serialized) {
  try {
    const start = document.evaluate(
      serialized.start,
      document.body,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
    const end = document.evaluate(
      serialized.end,
      document.body,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
    if (!start || !end) return null;
    const range = document.createRange();
    range.setStart(start, Math.min(serialized.startOffset, start.textContent?.length ?? 0));
    range.setEnd(end, Math.min(serialized.endOffset, end.textContent?.length ?? 0));
    return range;
  } catch {
    return null;
  }
}

function sentenceFor(range) {
  const parent =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  const text = parent?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return text ? text.slice(0, 1_000) : null;
}

function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function serializeRect(rect) {
  return {
    height: Math.max(0, rect.height),
    width: Math.max(0, rect.width),
    x: rect.x,
    y: rect.y,
  };
}

function removeHighlight(id) {
  for (const highlight of document.querySelectorAll(
    `${HIGHLIGHT_SELECTOR}[data-annotation-id="${cssEscape(id)}"]`,
  )) {
    const parent = highlight.parentNode;
    if (!parent) continue;
    while (highlight.firstChild) parent.insertBefore(highlight.firstChild, highlight);
    highlight.remove();
    parent.normalize();
  }
}

function removeIntersectingHighlights(range) {
  for (const highlight of document.querySelectorAll(HIGHLIGHT_SELECTOR)) {
    try {
      if (!range.intersectsNode(highlight)) continue;
      const id = highlight.getAttribute("data-annotation-id");
      if (id) removeHighlight(id);
    } catch {
      // A dynamic page can remove a node while its range is being inspected.
    }
  }
}

function applyHighlight(annotation) {
  let range = rangeFromSerialized(annotation.range);
  if (!range || normalizeText(range.toString()) !== normalizeText(annotation.text)) {
    range = findTextRange(annotation.text);
  }
  if (!range || range.collapsed) return false;

  removeIntersectingHighlights(range);
  splitRangeBoundaries(range);
  const textNodes = textNodesInRange(range);
  if (textNodes.length === 0) return false;

  for (const textNode of textNodes) {
    if (!textNode.nodeValue?.trim()) continue;
    const highlight = document.createElement("span");
    highlight.setAttribute("data-divisor-reading-annotation", "");
    highlight.setAttribute("data-annotation-id", annotation.id);
    highlight.setAttribute("data-annotation-tag-id", annotation.tag.id);
    highlight.style.backgroundColor = annotation.tag.color;
    highlight.style.borderRadius = "2px";
    highlight.style.boxDecorationBreak = "clone";
    highlight.style.cursor = "pointer";
    highlight.style.padding = "0 1px";
    textNode.parentNode?.insertBefore(highlight, textNode);
    highlight.appendChild(textNode);
  }
  trackedAnnotations.set(annotation.id, annotation);
  applyFilter();
  return true;
}

function splitRangeBoundaries(range) {
  if (
    range.endContainer.nodeType === Node.TEXT_NODE &&
    range.endOffset < range.endContainer.nodeValue.length
  ) {
    range.endContainer.splitText(range.endOffset);
  }
  if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
    const start = range.startContainer.splitText(range.startOffset);
    range.setStart(start, 0);
  }
}

function textNodesInRange(range) {
  const root =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentNode;
  if (!root) return [];
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    try {
      if (range.intersectsNode(node) && !node.parentElement?.closest(HIGHLIGHT_SELECTOR)) {
        nodes.push(node);
      }
    } catch {
      // Ignore nodes invalidated by a dynamic document update.
    }
    node = walker.nextNode();
  }
  return nodes;
}

function findTextRange(text) {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (!node.parentElement?.closest(HIGHLIGHT_SELECTOR)) {
      const value = node.nodeValue ?? "";
      const index = value.indexOf(text);
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + text.length);
        return range;
      }
    }
    node = walker.nextNode();
  }
  return null;
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function restore(annotations) {
  restorationSuppressedUntil = Date.now() + 250;
  trackedAnnotations = new Map(annotations.map((annotation) => [annotation.id, annotation]));
  for (const highlight of document.querySelectorAll(HIGHLIGHT_SELECTOR)) {
    const parent = highlight.parentNode;
    if (!parent) continue;
    while (highlight.firstChild) parent.insertBefore(highlight.firstChild, highlight);
    highlight.remove();
    parent.normalize();
  }
  for (const annotation of annotations) applyHighlight(annotation);
}

function scheduleRestoration() {
  if (Date.now() < restorationSuppressedUntil || trackedAnnotations.size === 0) return;
  if (restorationTimer) window.clearTimeout(restorationTimer);
  restorationTimer = window.setTimeout(() => {
    restorationSuppressedUntil = Date.now() + 250;
    for (const annotation of trackedAnnotations.values()) {
      const selector = `${HIGHLIGHT_SELECTOR}[data-annotation-id="${cssEscape(annotation.id)}"]`;
      if (!document.querySelector(selector)) applyHighlight(annotation);
    }
  }, 250);
}

function applyFilter() {
  for (const highlight of document.querySelectorAll(HIGHLIGHT_SELECTOR)) {
    const tagId = highlight.getAttribute("data-annotation-tag-id");
    highlight.style.opacity = !activeTagFilter || tagId === activeTagFilter ? "1" : "0.25";
  }
}

function handleHighlightClick(event) {
  const element = event.target instanceof Element ? event.target.closest(HIGHLIGHT_SELECTOR) : null;
  if (!element) return;
  const annotationId = element.getAttribute("data-annotation-id");
  if (!annotationId) return;
  activeAnnotationId = annotationId;
  event.preventDefault();
  event.stopPropagation();
  window.getSelection()?.removeAllRanges();
  ipcRenderer.sendToHost(ANNOTATION_CHANNEL, {
    annotationId,
    rectViewport: annotationRect(annotationId) ?? serializeRect(element.getBoundingClientRect()),
    type: "annotation-clicked",
  });
}

function annotationRect(annotationId) {
  const highlights = document.querySelectorAll(
    `${HIGHLIGHT_SELECTOR}[data-annotation-id="${cssEscape(annotationId)}"]`,
  );
  let fallback = null;
  for (const highlight of highlights) {
    const rect = serializeRect(highlight.getBoundingClientRect());
    fallback ??= rect;
    if (rect.y + rect.height >= 0 && rect.y <= window.innerHeight) return rect;
  }
  return fallback;
}

function emitActiveAnnotationPosition() {
  if (!activeAnnotationId) return;
  const rect = annotationRect(activeAnnotationId);
  if (!rect) return;
  const visible = rect.y + rect.height >= 0 && rect.y <= window.innerHeight;
  ipcRenderer.sendToHost(ANNOTATION_CHANNEL, {
    annotationId: activeAnnotationId,
    rectViewport: rect,
    type: visible ? "annotation-position" : "annotation-out-of-view",
  });
}

ipcRenderer.on(COMMAND_CHANNEL, (_event, command) => {
  if (!command || typeof command !== "object") return;
  if (command.type === "apply") applyHighlight(command.annotation);
  if (command.type === "delete") {
    if (activeAnnotationId === command.annotationId) activeAnnotationId = null;
    trackedAnnotations.delete(command.annotationId);
    removeHighlight(command.annotationId);
  }
  if (command.type === "restore") restore(command.annotations ?? []);
  if (command.type === "set-enabled") enabled = Boolean(command.enabled);
  if (command.type === "set-filter") {
    activeTagFilter = typeof command.tagId === "string" ? command.tagId : null;
    applyFilter();
  }
  if (command.type === "scroll-to") {
    activeAnnotationId = command.annotationId;
    const element = document.querySelector(
      `${HIGHLIGHT_SELECTOR}[data-annotation-id="${cssEscape(command.annotationId)}"]`,
    );
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (element) window.setTimeout(emitActiveAnnotationPosition, 250);
  }
});

document.addEventListener("mouseup", queueSelection, true);
document.addEventListener("keyup", queueSelection, true);
document.addEventListener("click", handleHighlightClick, true);
// Scroll does not bubble, so use capture on document to observe both the page
// and independently scrolling article containers inside the Electron guest.
document.addEventListener("scroll", scheduleScrollPosition, true);
new MutationObserver(scheduleRestoration).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
loop();
