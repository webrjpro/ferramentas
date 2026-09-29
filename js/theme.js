/* Copyright (c) 2026 Carlos Antonio de Oliveira Piquet. Todos os direitos reservados. */
(function () {
  "use strict";

  const root = document.documentElement;
  const key = "tema";
  let theme = "light";
  let changedByUser = false;
  let button;

  function apply(value) {
    theme = value === "dark" ? "dark" : "light";
    root.dataset.theme = theme;
    document.querySelector?.('meta[name="theme-color"]')?.setAttribute(
      "content", theme === "dark" ? "#08111f" : "#f3f7fb"
    );
    if (button) {
      button.textContent = theme === "light" ? "☀ Tema claro" : "☾ Tema escuro";
      button.setAttribute("aria-label", `Tema ${theme === "light" ? "claro" : "escuro"}. Clique para mudar para o tema ${theme === "light" ? "escuro" : "claro"}.`);
      button.setAttribute("aria-pressed", String(theme === "dark"));
    }
  }

  // O tema claro aparece imediatamente enquanto a leitura assíncrona do banco termina.
  apply(theme);

  function mount() {
    button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    button.addEventListener("click", () => {
      changedByUser = true;
      apply(theme === "light" ? "dark" : "light");
      window.AppPreferences.set(key, theme).catch(() => {
        button.title = "O navegador não permitiu salvar a preferência. O tema vale nesta página.";
      });
    });
    const host = document.querySelector?.("[data-theme-toggle-host]");
    if (host) button.classList.add("theme-toggle--inline");
    (host || document.body).appendChild(button);
    apply(theme);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }

  window.AppPreferences.get(key).then((saved) => {
    if (!changedByUser && (saved === "light" || saved === "dark")) apply(saved);
  }).catch(() => {});
})();
