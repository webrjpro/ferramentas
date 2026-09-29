/* Regras puras, independentes da interface. */
(function (root) {
  "use strict";

  function nameTokens(value) {
    return String(value || "").replace(/\.[^.]+$/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }

  function strictNameKey(value) {
    return nameTokens(value).join("|");
  }

  function extractStudentName(text) {
    const match = String(text || "").match(/\baluno\s*:\s*(.+?)(?=\s+(?:curso|delibera(?:ç|c)ão|credenciamento|ano\s+de\s+conclusão|data\s+de\s+impressão)\s*:|$)/i);
    return match ? match[1].replace(/\s+/g, " ").trim() : "";
  }

  const api = Object.freeze({ nameTokens, strictNameKey, extractStudentName });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FerramentasCore = root.FerramentasCore || {};
  root.FerramentasCore.qr = api;
})(typeof window !== "undefined" ? window : globalThis);
