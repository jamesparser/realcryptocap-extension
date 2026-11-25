// Injects the RealCryptoCap bar as an extension-origin iframe, so the Firebase AI Logic SDK and
// Chrome's on-device model run in a normal extension page and never touch the host page's code.
(() => {
  // Second and later icon clicks re-run this file: toggle instead of injecting again.
  if (window.__rccToggle) { window.__rccToggle(); return; }

  const ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  let frame = null;
  let pos = 'bottom';
  let height = 38;
  const saved = { top: null, bottom: null };

  function apply() {
    if (!frame) return;
    const root = document.documentElement;
    frame.style.cssText = `position:fixed;left:0;right:0;${pos}:0;${pos === 'top' ? 'bottom' : 'top'}:auto;width:100%;height:${height}px;border:0;z-index:2147483647;color-scheme:normal;background:transparent;`;
    // Push the page so the bar never covers content.
    for (const side of ['top', 'bottom']) {
      const prop = side === 'top' ? 'marginTop' : 'marginBottom';
      if (saved[side] === null) saved[side] = root.style[prop] || '';
    }
    root.style.marginTop = pos === 'top' ? '38px' : saved.top;
    root.style.marginBottom = pos === 'bottom' ? '38px' : saved.bottom;
  }

  function show() {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('ui.html');
    frame.setAttribute('allow', 'language-model');
    frame.title = 'RealCryptoCap';
    document.documentElement.appendChild(frame);
    apply();
  }

  function hide() {
    if (!frame) return;
    frame.remove();
    frame = null;
    const root = document.documentElement;
    root.style.marginTop = saved.top || '';
    root.style.marginBottom = saved.bottom || '';
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== ORIGIN || !e.data || e.data.rcc !== 'layout') return;
    if (e.data.pos === 'top' || e.data.pos === 'bottom') pos = e.data.pos;
    if (Number.isFinite(e.data.height)) height = Math.max(38, Math.min(e.data.height, 420));
    if (e.data.close) { hide(); return; }
    apply();
  });

  window.__rccToggle = () => { frame ? hide() : show(); };

  show();
})();
