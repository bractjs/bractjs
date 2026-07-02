/**
 * BractJS DevTools Panel (E3).
 *
 * In dev mode this module is imported by the HMR client and registers a
 * `<bractjs-devtools>` custom element.  The element reads shared state from
 * `window.__BRACTJS_DEVTOOLS__` which is populated by ClientRouter.
 *
 * Ctrl+Shift+B toggles the panel.
 * Zero production overhead — this file is never imported in production because
 * it is only loaded via `if (__BRACT_DEV__)` in the HMR client.
 */

export interface DevtoolsState {
  route: string | null;
  loaderData: Record<string, unknown>;
  navState: string;
  cacheEntries: Array<{ key: string; age: number; staleTime: number; gcTime: number }>;
  beforeLoadTrace: string[];
}

declare global {
  interface Window {
    __BRACTJS_DEVTOOLS__?: DevtoolsState;
  }
}

const PANEL_ID = "bractjs-devtools-panel";
const REFRESH_MS = 1000;

function readState(): DevtoolsState {
  return (
    window.__BRACTJS_DEVTOOLS__ ?? {
      route: null,
      loaderData: {},
      navState: "idle",
      cacheEntries: [],
      beforeLoadTrace: [],
    }
  );
}

class BractJSDevtools extends HTMLElement {
  private open = false;
  private panel: HTMLDivElement | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly handleKeydown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === "B") {
      e.preventDefault();
      this.togglePanel();
    }
  };

  connectedCallback() {
    this.style.cssText = "position:fixed;bottom:0;right:0;z-index:2147483647;font-family:monospace;";

    if (!this.querySelector("button")) {
      const toggle = document.createElement("button");
      toggle.textContent = "⚡ BractJS";
      toggle.style.cssText =
        "background:#1e1e1e;color:#61dafb;border:none;padding:4px 10px;cursor:pointer;font-size:12px;";
      toggle.onclick = () => this.togglePanel();
      this.appendChild(toggle);
    }

    document.addEventListener("keydown", this.handleKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener("keydown", this.handleKeydown);
    this.stopRefresh();
  }

  private togglePanel() {
    if (this.open) {
      this.open = false;
      this.stopRefresh();
      if (this.panel) {
        this.panel.remove();
        this.panel = null;
      }
      return;
    }

    this.open = true;
    this.ensurePanel();
    this.renderPanel();
    this.startRefresh();
  }

  private ensurePanel() {
    if (this.panel) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText =
      "background:#1e1e1e;color:#ccc;width:480px;max-height:60vh;overflow:auto;" +
      "border-top:2px solid #61dafb;border-left:2px solid #61dafb;padding:12px;font-size:11px;";

    this.panel = panel;
    this.appendChild(panel);
  }

  private startRefresh() {
    this.stopRefresh();
    this.refreshTimer = setInterval(() => {
      if (!this.open || !this.panel) return;
      this.renderPanel();
    }, REFRESH_MS);
  }

  private stopRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private renderPanel() {
    if (!this.panel) return;
    const state = readState();
    const panel = this.panel;
    panel.replaceChildren();

    const header = document.createElement("div");
    header.style.cssText = "color:#61dafb;font-weight:bold;margin-bottom:8px;font-size:13px;";
    header.textContent = "BractJS DevTools";
    panel.appendChild(header);

    this.section(panel, "Route", state.route ?? "(none)");
    this.section(panel, "Navigation state", state.navState);
    this.section(panel, "Loader data", JSON.stringify(state.loaderData, null, 2));

    if (state.cacheEntries.length > 0) {
      const cacheText = state.cacheEntries
        .map((e) => `${e.key}\n  age=${e.age}ms stale=${e.staleTime}ms gc=${e.gcTime}ms`)
        .join("\n");
      this.section(panel, `Cache (${state.cacheEntries.length})`, cacheText);
    }

    if (state.beforeLoadTrace.length > 0) {
      this.section(panel, "beforeLoad trace", state.beforeLoadTrace.join("\n"));
    }
  }

  private section(parent: HTMLElement, title: string, content: string) {
    const h = document.createElement("div");
    h.style.cssText = "color:#61dafb;margin-top:8px;margin-bottom:2px;";
    h.textContent = title;
    parent.appendChild(h);

    const pre = document.createElement("pre");
    pre.style.cssText = "margin:0;white-space:pre-wrap;word-break:break-all;color:#ccc;";
    pre.textContent = content;
    parent.appendChild(pre);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("bractjs-devtools")) {
  customElements.define("bractjs-devtools", BractJSDevtools);
}

/**
 * Inject the `<bractjs-devtools>` element into the document body.
 * Called by the HMR client in dev mode.
 */
export function injectDevtools(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector("bractjs-devtools")) return;
  const el = document.createElement("bractjs-devtools");
  document.body.appendChild(el);
}

/**
 * Update the shared devtools state object.
 * Called by ClientRouter on every navigation.
 */
export function updateDevtoolsState(state: Partial<DevtoolsState>): void {
  window.__BRACTJS_DEVTOOLS__ = { ...window.__BRACTJS_DEVTOOLS__, ...state } as DevtoolsState;
}
