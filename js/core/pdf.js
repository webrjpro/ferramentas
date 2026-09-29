/* Regras puras, independentes da interface. */
(function (root) {
  "use strict";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function safeTargetMb(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? clamp(parsed, 1, 500) : 15;
  }

  function safeBaseName(name) {
    const base = name.replace(/^.*[\\/]/, "").replace(/\.pdf$/i, "");
    return (base || "arquivo").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  }

  function uniqueOutputName(base, usedNames) {
    let index = 0;
    let candidate;
    do {
      candidate = `${base}_comprimido${index ? `_${index}` : ""}.pdf`;
      index += 1;
    } while (usedNames.has(candidate.toLowerCase()));
    usedNames.add(candidate.toLowerCase());
    return candidate;
  }

  const api = Object.freeze({ clamp, safeTargetMb, safeBaseName, uniqueOutputName });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FerramentasCore = root.FerramentasCore || {};
  root.FerramentasCore.pdf = api;
})(typeof window !== "undefined" ? window : globalThis);
