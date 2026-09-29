/* Regras puras, independentes da interface. */
(function (root) {
  "use strict";

  const CATEGORIES = {
    Principal: ["\\brg\\b", "\\bcpf\\b", "certidao.*nascimento", "nascimento.*certidao", "3[x/]4", "diploma.*graduacao"],
    "E-mail": ["e[-_ ]?mail"],
    Atestado: ["atestado"],
    Formulario: ["formulario"],
    Termo: ["termo"],
    "Declaracao e Diploma": ["declaracao", "diploma"],
  };
  const IGNORED = new Set([".ds_store", "thumbs.db", "desktop.ini", ".gitkeep"]);
  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function classify(fileName) {
    const name = normalize(fileName);
    for (const [category, patterns] of Object.entries(CATEGORIES)) {
      if (patterns.some((pattern) => new RegExp(pattern, "i").test(name))) return category;
    }
    return "Geral";
  }

  function safeName(value, fallback = "arquivo") {
    const cleaned = String(value || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
    return cleaned || fallback;
  }

  function uniqueName(name, used) {
    const safe = safeName(name);
    const dot = safe.lastIndexOf(".");
    const base = dot > 0 ? safe.slice(0, dot) : safe;
    const extension = dot > 0 ? safe.slice(dot) : "";
    let candidate = safe;
    let index = 2;
    while (used.has(candidate.toLowerCase())) candidate = `${base} (${index++})${extension}`;
    used.add(candidate.toLowerCase());
    return candidate;
  }

  const api = Object.freeze({ CATEGORIES, IGNORED, normalize, classify, safeName, uniqueName });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FerramentasCore = root.FerramentasCore || {};
  root.FerramentasCore.documentos = api;
})(typeof window !== "undefined" ? window : globalThis);
