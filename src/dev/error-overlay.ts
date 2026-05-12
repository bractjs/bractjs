/**
 * Browser-injected error overlay script.
 * Listens for assignments to window.__BRACTJS_ERROR__ and renders a full-screen overlay.
 */
export const errorOverlayScript: string = `
(function () {
  Object.defineProperty(window, '__BRACTJS_ERROR__', {
    set: function (err) {
      var existing = document.getElementById('__bractjs_overlay__');
      if (existing) existing.remove();
      var msg = err && err.message ? err.message : String(err);
      var stack = err && err.stack ? err.stack : '';
      var overlay = document.createElement('div');
      overlay.id = '__bractjs_overlay__';
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'background:#1a1a1a', 'color:#fff',
        'padding:2rem', 'font-family:monospace', 'font-size:14px',
        'border:4px solid #e74c3c', 'z-index:99999', 'overflow:auto'
      ].join(';');
      var h2 = document.createElement('h2');
      h2.style.cssText = 'color:#e74c3c;margin:0 0 1rem';
      h2.textContent = 'BractJS Error';
      var pre = document.createElement('pre');
      pre.style.cssText = 'white-space:pre-wrap';
      pre.textContent = msg + (stack ? '\\n\\n' + stack : '');
      overlay.appendChild(h2);
      overlay.appendChild(pre);
      document.body.appendChild(overlay);
    },
    configurable: true,
  });
})();
`.trim();
