/**
 * Browser-side HMR client script, embedded as a string and injected by LiveReload.
 *
 * Message types:
 *   hmr:route  — swap a single route module without full page reload
 *   hmr:css    — re-fetch stylesheets in place (no reload, no state loss)
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

  // Set once the socket has ever dropped: the dev server restarted (server
  // module changed), so the next successful reconnect reloads the page to
  // pick up fresh SSR output.
  var wasDisconnected = false;

  function connect() {
    // Port published by the server's dev bootstrap (config hmrPort), else 3001.
    var port = window.__BRACTJS_HMR_PORT__ || 3001;
    var ws = new WebSocket("ws://localhost:" + port);
    ws.onopen = function () {
      if (wasDisconnected) location.reload();
    };
    ws.onmessage = function (event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.type === "hmr:reload") {
          location.reload();
        } else if (msg.type === "hmr:css") {
          // Re-point every framework-emitted stylesheet at a cache-busted URL.
          // Dev CSS paths are stable (unhashed), so mutating href in place is
          // enough and preserves all client state. Only /build/ hrefs are
          // touched, matching the same-origin check the route path enforces.
          var links = document.querySelectorAll('link[rel="stylesheet"]');
          for (var i = 0; i < links.length; i++) {
            var el = links[i];
            var href = el.getAttribute("href") || "";
            if (!/^\\/build\\//.test(href)) continue;
            el.setAttribute("href", href.split("?")[0] + "?t=" + Date.now());
          }
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
    ws.onclose = function () { wasDisconnected = true; setTimeout(connect, 1000); };
  }
  connect();
})();
`.trim();
