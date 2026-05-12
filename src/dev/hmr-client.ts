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
  function connect() {
    var ws = new WebSocket("ws://localhost:3001");
    ws.onmessage = function (event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.type === "hmr:reload") {
          location.reload();
        } else if (msg.type === "hmr:route" && msg.pattern != null && msg.chunkUrl) {
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
