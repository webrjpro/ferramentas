/* Copyright (c) 2026 Carlos Antonio de Oliveira Piquet. Todos os direitos reservados. */
(async function () {
  "use strict";

  const acceptanceKey = "ferramentas-locais-termos-2026-09-25";
  const termsUrl = new URL("../paginas/termos.html", document.currentScript.src);
  try {
    if (await window.AppPreferences.get(acceptanceKey) === "aceito") return;
  } catch (_error) {
    // A ferramenta continua disponível mesmo quando o navegador bloqueia IndexedDB.
  }

  const overlay = document.createElement("div");
  overlay.className = "legal-overlay";
  overlay.innerHTML = `
    <section class="legal-dialog" role="dialog" aria-modal="true" aria-labelledby="legal-title">
      <h2 id="legal-title">Termos de uso</h2>
      <p>
        Esta ferramenta e gratuita para uso permitido, mas seu codigo, layout e autoria
        pertencem a <strong>Carlos Antonio de Oliveira Piquet</strong>. Copia, revenda,
        redistribuicao e remocao dos creditos exigem autorizacao escrita.
      </p>
      <div class="legal-actions">
        <a href="${termsUrl.href}">Ler termos completos</a>
        <button id="accept-legal" type="button">Aceitar e continuar</button>
      </div>
    </section>`;

  document.body.appendChild(overlay);
  document.documentElement.classList.add("legal-lock");
  const acceptButton = overlay.querySelector("#accept-legal");
  acceptButton.addEventListener("click", async () => {
    try {
      await window.AppPreferences.set(acceptanceKey, "aceito");
    } catch (_error) {
      // A aceitação continua válida enquanto a página estiver aberta.
    }
    overlay.remove();
    document.documentElement.classList.remove("legal-lock");
  });
  acceptButton.focus();
})();
