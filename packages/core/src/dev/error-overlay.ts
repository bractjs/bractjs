/**
 * Browser-injected dev error overlay (dev runtime only; see server/render.ts).
 *
 * Shows an error when something assigns `window.__BRACTJS_ERROR__ = { message,
 * stack }` — the client entry does for a loader error captured during SSR — or
 * when the page throws (`error` / `unhandledrejection`). The stack goes to
 * `POST /_bractjs/stack` (dev/overlay-endpoints.ts), which maps browser frames
 * through the dev build's source maps and returns code excerpts; each frame
 * can be opened in the editor via `POST /_bractjs/open`. Escape or × closes it.
 *
 * Plain ES5 in a string: it runs before any bundle loads.
 */
export const errorOverlayScript: string = `
(function () {
  var ID = '__bractjs_overlay__';
  var HEADERS = { 'Content-Type': 'application/json', 'X-BractJS-Action': '1' };
  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }
  function close() {
    var existing = document.getElementById(ID);
    if (existing) existing.remove();
  }
  function openInEditor(f) {
    fetch('/_bractjs/open', { method: 'POST', headers: HEADERS, body: JSON.stringify({ file: f.file, line: f.line, column: f.column }) });
  }
  function frameView(f) {
    var box = el('div', 'margin:0 0 1rem;border:1px solid #333;border-radius:6px;overflow:hidden');
    var head = el('div', 'display:flex;gap:.75rem;align-items:center;justify-content:space-between;padding:.4rem .75rem;background:#262626');
    head.appendChild(el('span', 'color:#ddd', (f.fn ? f.fn + '  ' : '') + f.file + ':' + f.line + ':' + f.column));
    var btn = el('button', 'background:#e74c3c;color:#fff;border:0;border-radius:4px;padding:.2rem .6rem;font:inherit;cursor:pointer', 'Open in editor');
    btn.onclick = function () { openInEditor(f); };
    head.appendChild(btn);
    box.appendChild(head);
    var pre = el('pre', 'margin:0;padding:.5rem 0;overflow:auto');
    for (var i = 0; i < f.excerpt.length; i++) {
      var row = f.excerpt[i];
      var hit = row.line === f.line;
      pre.appendChild(el('div', 'padding:0 .75rem;white-space:pre;' + (hit ? 'background:#4a1d1d;color:#fff' : 'color:#999'),
        (hit ? '> ' : '  ') + String(row.line).padStart(4) + ' | ' + row.text));
    }
    box.appendChild(pre);
    return box;
  }
  function show(err) {
    close();
    var msg = err && err.message ? err.message : String(err);
    var stack = err && err.stack ? String(err.stack) : '';
    var overlay = el('div', 'position:fixed;inset:0;background:#1a1a1a;color:#fff;padding:2rem;font:13px/1.5 ui-monospace,Menlo,monospace;border:4px solid #e74c3c;z-index:2147483647;overflow:auto');
    overlay.id = ID;
    overlay.setAttribute('role', 'alertdialog');
    var top = el('div', 'display:flex;justify-content:space-between;align-items:start;gap:1rem');
    top.appendChild(el('h2', 'color:#e74c3c;margin:0 0 1rem;font-size:16px', err && err.title ? err.title : 'BractJS Error'));
    var x = el('button', 'background:none;border:0;color:#aaa;font-size:20px;cursor:pointer', '×');
    x.setAttribute('aria-label', 'Close');
    x.onclick = close;
    top.appendChild(x);
    overlay.appendChild(top);
    overlay.appendChild(el('pre', 'white-space:pre-wrap;margin:0 0 1.25rem;font-size:15px;color:#fff', msg));
    var frames = el('div', '', stack ? 'Loading source…' : '');
    overlay.appendChild(frames);
    var raw = el('details', 'margin-top:1rem;color:#888');
    raw.appendChild(el('summary', 'cursor:pointer', 'Raw stack'));
    raw.appendChild(el('pre', 'white-space:pre-wrap', stack));
    if (stack) overlay.appendChild(raw);
    (document.body || document.documentElement).appendChild(overlay);
    if (!stack) return;
    fetch('/_bractjs/stack', { method: 'POST', headers: HEADERS, body: JSON.stringify({ stack: stack }) })
      .then(function (r) { return r.ok ? r.json() : { frames: [] }; })
      .then(function (data) {
        frames.textContent = '';
        var list = data.frames || [];
        var app = list.filter(function (f) { return f.app; });
        var other = list.filter(function (f) { return !f.app; });
        (app.length ? app : other.slice(0, 1)).forEach(function (f) { frames.appendChild(frameView(f)); });
        var rest = app.length ? other : other.slice(1);
        if (rest.length) {
          var more = el('details', 'color:#888');
          more.appendChild(el('summary', 'cursor:pointer', rest.length + ' more frame' + (rest.length === 1 ? '' : 's') + ' (framework, node_modules)'));
          rest.forEach(function (f) { more.appendChild(frameView(f)); });
          frames.appendChild(more);
        }
      })
      .catch(function () { frames.textContent = ''; });
  }
  Object.defineProperty(window, '__BRACTJS_ERROR__', { set: show, configurable: true });
  window.addEventListener('error', function (e) {
    if (e.error) show({ title: 'Uncaught error', message: e.error.message || String(e.error), stack: e.error.stack });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    show({ title: 'Unhandled promise rejection', message: r && r.message ? r.message : String(r), stack: r && r.stack });
  });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();
`.trim();
