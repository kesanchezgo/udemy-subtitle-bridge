(() => {
  const MARK = "__usg_net_bridge_installed__";
  if (window[MARK]) {
    return;
  }
  window[MARK] = true;

  const shouldCapture = (url, contentType) => {
    const u = String(url || "").toLowerCase();
    const c = String(contentType || "").toLowerCase();
    if (u.includes("/graphql")) {
      return true;
    }
    if (u.includes("caption") || u.includes("subtitle") || u.includes("transcript") || u.includes(".vtt")) {
      return true;
    }
    if (c.includes("text/vtt")) {
      return true;
    }
    return false;
  };

  const emit = (payload) => {
    try {
      document.dispatchEvent(new CustomEvent("USG_NET_CAPTURE", { detail: payload }));
    } catch (_error) {
      // Keep bridge silent and resilient.
    }
  };

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function (...args) {
      const req = args[0];
      const url = typeof req === "string" ? req : (req && req.url) || "";
      const method = (args[1] && args[1].method) || (req && req.method) || "GET";
      const response = await originalFetch.apply(this, args);
      try {
        const contentType = response.headers && response.headers.get
          ? (response.headers.get("content-type") || "")
          : "";
        if (shouldCapture(url, contentType)) {
          const clone = response.clone();
          const text = await clone.text();
          emit({
            url,
            method,
            status: response.status,
            contentType,
            body: text.slice(0, 2500000)
          });
        }
      } catch (_error) {
        // Ignore capture parse errors.
      }
      return response;
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (OriginalXHR && OriginalXHR.prototype) {
    const open = OriginalXHR.prototype.open;
    const send = OriginalXHR.prototype.send;

    OriginalXHR.prototype.open = function (method, url, ...rest) {
      this.__usg_url = url;
      this.__usg_method = method;
      return open.call(this, method, url, ...rest);
    };

    OriginalXHR.prototype.send = function (...args) {
      this.addEventListener("load", function () {
        try {
          const url = this.__usg_url || "";
          const method = this.__usg_method || "GET";
          const contentType = this.getResponseHeader
            ? (this.getResponseHeader("content-type") || "")
            : "";
          if (!shouldCapture(url, contentType)) {
            return;
          }
          const body = typeof this.responseText === "string" ? this.responseText : "";
          emit({
            url,
            method,
            status: this.status,
            contentType,
            body: body.slice(0, 2500000)
          });
        } catch (_error) {
          // Ignore capture parse errors.
        }
      });
      return send.apply(this, args);
    };
  }
})();
