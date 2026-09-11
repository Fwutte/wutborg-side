(function (global) {
  "use strict";

  // Keep playing, including new records, when browser storage is unavailable.
  const memory = new Map();
  let warned = false;
  function warn() {
    if (warned) return;
    warned = true;
    const notice = document.createElement("div");
    notice.setAttribute("role", "status");
    notice.style.cssText = "position:fixed;top:12px;left:12px;right:12px;z-index:10000;max-width:540px;margin:auto;padding:12px 16px;border:2px solid #fff;border-radius:8px;background:#19232f;color:#fff;font:14px/1.5 system-ui;pointer-events:none";
    document.body.append(notice);
    notice.textContent = "Browseren kan ikke gemme. Du kan stadig spille; nye rekorder og valg huskes kun, mens siden er åben.";
    global.setTimeout(() => notice.remove(), 7000);
  }

  global.WutborgGameStorage = {
    getItem(key) {
      if (memory.has(key)) return memory.get(key);
      try {
        const value = global.localStorage.getItem(key);
        memory.set(key, value);
        return value;
      } catch {
        warn();
        return null;
      }
    },
    setItem(key, value) {
      const text = String(value);
      memory.set(key, text);
      try {
        global.localStorage.setItem(key, text);
      } catch {
        warn();
      }
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
