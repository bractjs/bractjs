/**
 * Browser-side HMR client script, embedded as a string and injected by LiveReload.
 *
 * Message types:
 *   hmr:route  — swap a single route module without full page reload
 *   hmr:reload — full page reload (root/layout/non-route file changed)
 *
 * Module swap flow:
 *   1. Receive { type:"hmr:route", pattern, file }
 *   2. Fetch /_hmr/module?file=<file>&t=<now> — server compiles it fresh
 *   3. Call window.__BRACTJS_HMR_ACCEPT__(pattern, module)
 *   4. ClientRouter swaps currentModule → React re-renders <Outlet>
 */
export const hmrClientScript: string = `
(function () {
  // Inject DevTools panel in dev mode (E3).
  if (typeof customElements !== 'undefined') {
    import('/_bractjs/devtools.js').then(function(m) {
      if (typeof m.injectDevtools === 'function') m.injectDevtools();
    }).catch(function() {
      // DevTools module not available - skip silently.
    });
  }

  function connect() {
    // Port published by the server's dev bootstrap (config hmrPort), else 3001.
    var port = window.__BRACTJS_HMR_PORT__ || 3001;
    var ws = new WebSocket("ws://localhost:" + port);
    ws.onmessage = function (event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.type === "hmr:reload") {
          location.reload();
        } else if (msg.type === "hmr:route" && msg.pattern != null && msg.chunkUrl) {
          // Validate chunk URL is a same-origin relative path before importing.
          // Prevents a compromised/MITM'd dev WS from executing arbitrary URLs.
          if (typeof msg.chunkUrl !== 'string' || !/^\\/build\\//.test(msg.chunkUrl)) {
            return;
          }
          // Cache-bust so the browser re-fetches the rebuilt chunk.
          // The chunk was built with splitting, so it shares the same React
          // instance as client.js — no dual-React issue.
          var url = msg.chunkUrl + "?t=" + Date.now();
          import(url).then(function (mod) {
            var accept = window.__BRACTJS_HMR_ACCEPT__;
            if (typeof accept === "function") {
              accept(msg.pattern, mod);
            } else {
              location.reload();
            }
          }).catch(function () { location.reload(); });
        }
      } catch (_) {}
    };
    ws.onclose = function () { setTimeout(connect, 1000); };
  }
  connect();
})();
`.trim();
