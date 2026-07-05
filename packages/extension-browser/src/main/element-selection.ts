import type { WebContents } from "electron";

import type { BrowserElementPayload, BrowserRect } from "../common/types";

const SELECTION_SCRIPT = String.raw`(() => new Promise((resolve) => {
  const old = document.getElementById('__divisor_browser_picker');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = '__divisor_browser_picker';
  Object.assign(overlay.style, {position:'fixed',zIndex:'2147483647',pointerEvents:'none',border:'2px solid #7c3aed',background:'rgba(124,58,237,.12)',display:'none'});
  document.documentElement.appendChild(overlay);
  const clean = () => { overlay.remove(); document.removeEventListener('mousemove', move, true); document.removeEventListener('click', pick, true); document.removeEventListener('keydown', key, true); };
  const selector = (el) => {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts=[]; let node=el;
    while(node && node.nodeType===1 && parts.length<8){let part=node.tagName.toLowerCase();if(node.classList.length)part+='.'+[...node.classList].slice(0,2).map(CSS.escape).join('.');const siblings=node.parentElement?[...node.parentElement.children].filter(x=>x.tagName===node.tagName):[];if(siblings.length>1)part+=':nth-of-type('+(siblings.indexOf(node)+1)+')';parts.unshift(part);node=node.parentElement;}return parts.join(' > ');
  };
  const move = (event) => { const el=document.elementFromPoint(event.clientX,event.clientY); if(!el||el===overlay)return; const r=el.getBoundingClientRect(); Object.assign(overlay.style,{display:'block',left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'}); };
  const key = (event) => { if(event.key==='Escape'){event.preventDefault();clean();resolve(null);} };
  const pick = (event) => { const el=document.elementFromPoint(event.clientX,event.clientY); if(!el||el===overlay)return; event.preventDefault();event.stopPropagation();const r=el.getBoundingClientRect(),s=getComputedStyle(el);const nearby=[...new Set([el.previousElementSibling?.textContent,el.parentElement?.textContent,el.nextElementSibling?.textContent].filter(Boolean).map(x=>String(x).trim().slice(0,500)))].slice(0,3);const ancestors=[];let p=el.parentElement;while(p&&ancestors.length<6){ancestors.push(p.tagName.toLowerCase()+(p.id?'#'+p.id:''));p=p.parentElement;}const payload={accessibility:{name:(el.getAttribute('aria-label')||el.getAttribute('alt')||el.textContent||'').trim().slice(0,500),role:el.getAttribute('role')||el.tagName.toLowerCase()},ancestorPath:ancestors,computedStyles:{backgroundColor:s.backgroundColor,color:s.color,display:s.display,fontSize:s.fontSize,position:s.position},fullPath:selector(el),html:String(el.outerHTML||'').slice(0,8000),nearbyText:nearby,rect:{x:r.x,y:r.y,width:r.width,height:r.height},selector:selector(el),tagName:el.tagName.toLowerCase(),text:String(el.innerText||el.textContent||'').trim().slice(0,4000),title:document.title,url:location.href};clean();resolve(payload); };
  document.addEventListener('mousemove',move,true);document.addEventListener('click',pick,true);document.addEventListener('keydown',key,true);
  window.__divisorCancelBrowserPicker=()=>{clean();resolve(null);};
}))()`;

export async function selectElement(contents: WebContents) {
  const payload = (await contents.executeJavaScript(SELECTION_SCRIPT, true)) as Omit<
    BrowserElementPayload,
    "screenshotPath"
  > | null;
  if (!payload) throw new Error("Element selection cancelled");
  const image = await contents.capturePage(toRectangle(payload.rect));
  return { image, payload };
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
