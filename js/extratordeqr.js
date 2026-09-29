/* Copyright 2026 Carlos Antonio de Oliveira Piquet. Todos os direitos reservados. */
(() => {
  "use strict";

  const { strictNameKey, extractStudentName } = window.FerramentasCore.qr;
  const $ = (id) => document.getElementById(id);
  const MAX_BATCH_CERTIFICATES = 300;
  const state = {
    singlePdf: null,
    singleQr: null,
    singleQrResult: null,
    pendingQrResult: null,
    pdfBytes: null,
    pdfView: null,
    currentPage: 1,
    placements: new Map(),
    qrUrl: "",
    batchPdfs: [],
    batchQrs: [],
    qrSources: [],
    pairs: [],
    batchAudit: [],
    batchTemplate: null,
    batchQrUrl: "",
    batchPreviewDoc: null,
    batchPreviewPage: 1,
    extractPdfs: [],
    cancelled: false,
    busy: false,
  };

  const ui = {
    tabs: [...document.querySelectorAll(".mode-tab")],
    panels: { single: $("single-panel"), batch: $("batch-panel"), extract: $("extract-panel") },
    singlePdf: $("single-pdf"), singleQr: $("single-qr"), editor: $("single-editor"),
    qrModal: $("qr-modal"), openQrModal: $("open-qr-modal"), confirmQr: $("confirm-qr"), qrModalPreview: $("qr-modal-preview"), qrModalPreviewWrap: $("qr-modal-preview-wrap"), qrModalName: $("qr-modal-name"), qrModalStatus: $("qr-modal-status"),
    pdfCanvas: $("pdf-canvas"), pageWrap: $("pdf-page-wrap"), placement: $("qr-placement"), qrPreview: $("qr-preview"),
    prev: $("previous-page"), next: $("next-page"), pageCounter: $("page-counter"),
    placeQr: $("place-qr"), removeQr: $("remove-qr"), saveSingle: $("save-single"),
    batchPdfs: $("batch-pdfs"), batchQrs: $("batch-qrs"), batchReport: $("batch-report"), batchIssue: $("batch-issue"), analyzeBatch: $("analyze-batch"), runBatch: $("run-batch"),
    configureBatch: $("configure-batch"), batchPositionModal: $("batch-position-modal"), closeBatchPosition: $("close-batch-position"), confirmBatchPosition: $("confirm-batch-position"), batchCanvas: $("batch-canvas"), batchPageWrap: $("batch-page-wrap"), batchPlacement: $("batch-placement"), batchQrPreview: $("batch-qr-preview"), batchTemplateName: $("batch-template-name"), batchPreviewPrevious: $("batch-preview-previous"), batchPreviewNext: $("batch-preview-next"), batchPreviewCounter: $("batch-preview-counter"),
    extractPdfs: $("extract-pdfs"), runExtract: $("run-extract"),
    progress: $("job-progress"), status: $("job-status"), percent: $("job-percent"), bar: $("job-bar"), cancel: $("cancel-job"),
    notifications: $("notifications"),
  };

  function notify(message, type = "") {
    const item = document.createElement("div");
    item.className = `notification ${type}`.trim();
    item.textContent = message;
    ui.notifications.append(item);
    window.setTimeout(() => item.remove(), 4800);
  }

  function bytesLabel(bytes) {
    if (!Number.isFinite(bytes)) return "";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
    return `${size.toLocaleString("pt-BR", { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`;
  }

  function fileSummary(files) {
    if (!files.length) return "Nenhum arquivo";
    const size = files.reduce((sum, file) => sum + file.size, 0);
    return `${files.length} arquivo${files.length > 1 ? "s" : ""} · ${bytesLabel(size)}`;
  }

  function batchFileSummary(files) {
    return `${fileSummary(files)}${files.length ? ` · ${files.length}/${MAX_BATCH_CERTIFICATES}` : ""}`;
  }

  function safeName(name) {
    return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").slice(0, 150) || "arquivo";
  }

  function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function requireLibraries(names) {
    const missing = names.filter((name) => !window[name]);
    if (missing.length) throw new Error(`Bibliotecas indisponíveis: ${missing.join(", ")}. Verifique sua conexão e recarregue a página.`);
  }

  function setProgress(label, value) {
    const percent = Math.max(0, Math.min(100, Math.round(value)));
    ui.progress.classList.remove("hidden");
    ui.status.textContent = label;
    ui.percent.textContent = `${percent}%`;
    ui.bar.style.width = `${percent}%`;
    ui.bar.parentElement.setAttribute("aria-valuenow", String(percent));
  }

  function setBusy(value) {
    state.busy = value;
    ui.runBatch.disabled = value || !state.pairs.length || !state.batchTemplate;
    ui.analyzeBatch.disabled = value || !state.batchPdfs.length || !state.batchQrs.length;
    ui.configureBatch.disabled = value || !state.pairs.length;
    ui.runExtract.disabled = value || !state.extractPdfs.length;
    ui.saveSingle.disabled = value || !state.placements.size;
    ui.cancel.disabled = !value;
  }

  function switchMode(mode) {
    if (state.busy) return;
    ui.tabs.forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    Object.entries(ui.panels).forEach(([key, panel]) => panel.classList.toggle("hidden", key !== mode));
  }

  async function loadSingle() {
    if (!state.singlePdf || !state.singleQrResult) return;
    try {
      requireLibraries(["pdfjsLib", "PDFLib"]);
      if (state.qrUrl) URL.revokeObjectURL(state.qrUrl);
      state.qrUrl = URL.createObjectURL(state.singleQrResult.blob);
      ui.qrPreview.src = state.qrUrl;
      state.pdfBytes = new Uint8Array(await state.singlePdf.arrayBuffer());
      state.pdfView = await window.pdfjsLib.getDocument({ data: state.pdfBytes.slice() }).promise;
      state.currentPage = 1;
      state.placements.clear();
      ui.editor.classList.remove("hidden");
      await renderPage();
      updatePlacementSummary();
      notify("Arquivos conferidos. Posicione o QR na página desejada.");
    } catch (error) {
      console.error(error);
      ui.editor.classList.add("hidden");
      notify(error.message || "Não foi possível abrir este PDF.", "error");
    }
  }

  async function renderPage() {
    if (!state.pdfView) return;
    const page = await state.pdfView.getPage(state.currentPage);
    const viewport = page.getViewport({ scale: 1.35 });
    const canvas = ui.pdfCanvas;
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport }).promise;
    ui.pageCounter.textContent = `${state.currentPage} de ${state.pdfView.numPages}`;
    ui.prev.disabled = state.currentPage === 1;
    ui.next.disabled = state.currentPage === state.pdfView.numPages;
    showPlacement();
  }

  function showPlacement() {
    const item = state.placements.get(state.currentPage);
    ui.placement.classList.toggle("hidden", !item);
    ui.removeQr.classList.toggle("hidden", !item);
    ui.placeQr.textContent = item ? "Reposicionar ao centro" : "Adicionar QR";
    if (!item) return;
    const width = ui.pdfCanvas.width;
    const height = ui.pdfCanvas.height;
    Object.assign(ui.placement.style, {
      left: `${item.x * width}px`, top: `${item.y * height}px`,
      width: `${item.w * width}px`, height: `${item.h * height}px`,
    });
  }

  function savePlacementFromElement() {
    if (ui.placement.classList.contains("hidden")) return;
    const canvasWidth = ui.pdfCanvas.width;
    const canvasHeight = ui.pdfCanvas.height;
    state.placements.set(state.currentPage, {
      x: parseFloat(ui.placement.style.left) / canvasWidth,
      y: parseFloat(ui.placement.style.top) / canvasHeight,
      w: parseFloat(ui.placement.style.width) / canvasWidth,
      h: parseFloat(ui.placement.style.height) / canvasHeight,
    });
    updatePlacementSummary();
  }

  function centerPlacement() {
    const side = Math.max(70, Math.min(150, ui.pdfCanvas.width * 0.18));
    Object.assign(ui.placement.style, {
      width: `${side}px`, height: `${side}px`,
      left: `${(ui.pdfCanvas.width - side) / 2}px`, top: `${(ui.pdfCanvas.height - side) / 2}px`,
    });
    ui.placement.classList.remove("hidden");
    savePlacementFromElement();
    showPlacement();
  }

  function updatePlacementSummary() {
    const count = state.placements.size;
    $("placement-summary").textContent = count ? `${count} página${count > 1 ? "s" : ""} com QR` : "Nenhuma página configurada";
    ui.saveSingle.disabled = state.busy || !count;
  }

  function configurePlacementPointer() {
    let action = null;
    let start = null;
    ui.placement.addEventListener("pointerdown", (event) => {
      action = event.target.classList.contains("resize-handle") ? "resize" : "move";
      start = {
        pointerX: event.clientX, pointerY: event.clientY,
        left: parseFloat(ui.placement.style.left), top: parseFloat(ui.placement.style.top),
        width: parseFloat(ui.placement.style.width), height: parseFloat(ui.placement.style.height),
      };
      ui.placement.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    ui.placement.addEventListener("pointermove", (event) => {
      if (!action || !start) return;
      const dx = event.clientX - start.pointerX;
      const dy = event.clientY - start.pointerY;
      if (action === "move") {
        const left = Math.max(0, Math.min(ui.pdfCanvas.width - start.width, start.left + dx));
        const top = Math.max(0, Math.min(ui.pdfCanvas.height - start.height, start.top + dy));
        ui.placement.style.left = `${left}px`; ui.placement.style.top = `${top}px`;
      } else {
        const side = Math.max(45, Math.min(Math.min(ui.pdfCanvas.width - start.left, ui.pdfCanvas.height - start.top), Math.max(start.width + dx, start.height + dy)));
        ui.placement.style.width = `${side}px`; ui.placement.style.height = `${side}px`;
      }
      savePlacementFromElement();
    });
    const finish = () => { action = null; start = null; };
    ui.placement.addEventListener("pointerup", finish);
    ui.placement.addEventListener("pointercancel", finish);
  }

  async function embedImage(pdfDoc, file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name || "")) return pdfDoc.embedJpg(bytes);
    return pdfDoc.embedPng(bytes);
  }

  async function saveSinglePdf() {
    if (!state.pdfBytes || !state.singleQrResult || !state.placements.size) return;
    setBusy(true);
    try {
      requireLibraries(["PDFLib"]);
      setProgress("Inserindo QR no documento…", 35);
      const doc = await window.PDFLib.PDFDocument.load(state.pdfBytes.slice());
      const image = await embedImage(doc, state.singleQrResult.blob);
      for (const [pageNumber, position] of state.placements) {
        const page = doc.getPage(pageNumber - 1);
        const { width, height } = page.getSize();
        page.drawImage(image, { x: position.x * width, y: height - ((position.y + position.h) * height), width: position.w * width, height: position.h * height });
      }
      setProgress("Preparando download…", 80);
      const bytes = await doc.save();
      download(new Blob([bytes], { type: "application/pdf" }), `${safeName(state.singlePdf.name.replace(/\.pdf$/i, ""))}_com_qr.pdf`);
      setProgress("PDF concluído", 100);
      notify("PDF gerado com sucesso.");
    } catch (error) {
      console.error(error); notify(error.message || "Falha ao gerar o PDF.", "error");
    } finally { setBusy(false); }
  }

  async function scanQrPdf(file, options = {}) {
    requireLibraries(["pdfjsLib", "jsQR"]);
    const documentView = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const results = [];
    try {
      for (let pageNumber = 1; pageNumber <= documentView.numPages; pageNumber += 1) {
        if (state.cancelled) throw new Error("Processamento cancelado.");
        if (options.onPage) options.onPage(pageNumber, documentView.numPages);
        const page = await documentView.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str || "").join(" ");
        const viewport = page.getViewport({ scale: 2.25 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        await page.render({ canvasContext: context, viewport }).promise;
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
        if (code) {
          const blob = await cropQr(canvas, code.location);
          canvas.width = 1; canvas.height = 1;
          if (page.cleanup) page.cleanup();
          results.push({ file, blob, data: code.data || "", text: pageText, studentName: extractStudentName(pageText), pageNumber });
          if (options.firstOnly) return results;
        } else if (options.includeMissing) {
          results.push({ file, pageNumber, text: pageText, studentName: extractStudentName(pageText), error: "QR não encontrado nesta página" });
          canvas.width = 1; canvas.height = 1;
          if (page.cleanup) page.cleanup();
        } else {
          canvas.width = 1; canvas.height = 1;
          if (page.cleanup) page.cleanup();
        }
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      if (!results.length) throw new Error("Nenhum QR encontrado no PDF.");
      return results;
    } finally {
      if (documentView.destroy) await documentView.destroy();
    }
  }

  function appendBatchRow(documentName, qrName, status, className) {
    const row = document.createElement("div"); row.className = "report-row";
    [documentName || "—", qrName || "—", status].forEach((text, index) => {
      const cell = document.createElement("span"); cell.textContent = text; if (index === 2) cell.className = className; row.append(cell);
    });
    ui.batchReport.append(row);
  }

  function pairBatchFiles() {
    state.pairs = [];
    state.batchAudit = [];
    ui.batchReport.replaceChildren();
    const readable = state.qrSources.filter((item) => !item.error);
    const certificateGroups = new Map(); const qrGroups = new Map();
    state.batchPdfs.forEach((pdf) => { const key = strictNameKey(pdf.name); if (!certificateGroups.has(key)) certificateGroups.set(key, []); certificateGroups.get(key).push(pdf); });
    readable.forEach((qr) => { const key = strictNameKey(qr.studentName); if (!qrGroups.has(key)) qrGroups.set(key, []); qrGroups.get(key).push(qr); });
    const usedPdfs = new Set(); const usedQrs = new Set();
    certificateGroups.forEach((pdfs, key) => {
      const qrs = key ? (qrGroups.get(key) || []) : [];
      if (pdfs.length === 1 && qrs.length === 1) {
        const pair = { pdf: pdfs[0], qrResult: qrs[0], reason: "nome externo igual ao campo Aluno" };
        state.pairs.push(pair); usedPdfs.add(pdfs[0]); usedQrs.add(qrs[0]);
      }
    });
    state.pairs.sort((a, b) => a.pdf.name.localeCompare(b.pdf.name, "pt-BR")).forEach((pair) => {
      const source = `${pair.qrResult.file.name} · pág. ${pair.qrResult.pageNumber} · ${pair.qrResult.studentName}`;
      appendBatchRow(pair.pdf.name, source, "Pronto · nomes exatamente iguais", "status-ok");
      state.batchAudit.push({ status: "CASADO", certificate: pair.pdf.name, student: pair.qrResult.studentName, source: `${pair.qrResult.file.name} - página ${pair.qrResult.pageNumber}`, detail: "Nomes exatamente iguais" });
    });
    state.batchPdfs.filter((pdf) => !usedPdfs.has(pdf)).forEach((pdf) => {
      const key = strictNameKey(pdf.name); const sameCertificates = certificateGroups.get(key) || []; const sameQrs = qrGroups.get(key) || [];
      const detail = sameCertificates.length > 1 ? "Nome externo duplicado entre certificados" : sameQrs.length > 1 ? "Nome interno duplicado no PDF de QR" : "Nenhum campo Aluno exatamente igual";
      appendBatchRow(pdf.name, "—", `Ignorado · ${detail}`, "status-error");
      state.batchAudit.push({ status: "IGNORADO", certificate: pdf.name, student: "", source: "", detail });
    });
    readable.filter((qr) => !usedQrs.has(qr)).forEach((qr) => {
      const detail = qr.studentName ? "Nenhum certificado com nome externo exatamente igual" : "Campo Aluno não encontrado";
      appendBatchRow("—", `${qr.file.name} · pág. ${qr.pageNumber}`, `${qr.studentName || "Aluno não identificado"} · ignorado`, "status-warn");
      state.batchAudit.push({ status: "SEM CERTIFICADO", certificate: "", student: qr.studentName || "Não identificado", source: `${qr.file.name} - página ${qr.pageNumber}`, detail });
    });
    state.qrSources.filter((item) => item.error).forEach((item) => {
      const source = `${item.file.name}${item.pageNumber ? ` - página ${item.pageNumber}` : ""}`;
      appendBatchRow("—", source, item.error, "status-error");
      state.batchAudit.push({ status: "NÃO ENCONTRADO", certificate: "", student: item.studentName || "Não identificado", source, detail: item.error });
    });
    ui.batchReport.classList.remove("hidden");
    const problems = (state.batchPdfs.length - state.pairs.length) + (state.qrSources.length - state.pairs.length);
    ui.batchIssue.classList.toggle("ok", problems === 0 && state.pairs.length > 0);
    ui.batchIssue.textContent = `${state.pairs.length} casamento(s) seguro(s)${problems ? ` · ${problems} pendência(s). Apenas os pares verdes serão gerados.` : " · Todos os nomes conferem."}`;
    ui.configureBatch.disabled = state.busy || !state.pairs.length;
    ui.runBatch.disabled = state.busy || !state.pairs.length || !state.batchTemplate;
  }

  async function analyzeBatch() {
    if (!state.batchPdfs.length || !state.batchQrs.length) return;
    if (state.batchPdfs.length > MAX_BATCH_CERTIFICATES) {
      notify(`O limite seguro é de ${MAX_BATCH_CERTIFICATES} certificados por lote.`, "error");
      return;
    }
    setBusy(true); state.cancelled = false; state.qrSources = []; state.pairs = []; state.batchTemplate = null;
    try {
      requireLibraries(["pdfjsLib", "jsQR"]);
      for (let index = 0; index < state.batchQrs.length; index += 1) {
        if (state.cancelled) throw new Error("Processamento cancelado.");
        const file = state.batchQrs[index];
        setProgress(`Extraindo QR de ${file.name}`, (index / state.batchQrs.length) * 90);
        try {
          const results = await scanQrPdf(file, { includeMissing: true, onPage: (page, total) => setProgress(`Lendo ${file.name} · página ${page} de ${total}`, ((index + (page / total)) / state.batchQrs.length) * 90) });
          state.qrSources.push(...results);
          if (state.qrSources.length > MAX_BATCH_CERTIFICATES) throw new Error(`Foram encontradas mais de ${MAX_BATCH_CERTIFICATES} páginas. Divida os PDFs de QR em dois lotes.`);
        }
        catch (error) { state.qrSources.push({ file, error: error.message || "Falha ao ler QR" }); }
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      pairBatchFiles(); setProgress("Leitura e casamento concluídos", 100);
      notify(`${state.pairs.length} aluno(s) casado(s). Posicione o QR no primeiro documento.`);
    } catch (error) { notify(error.message || "Falha ao analisar os PDFs com QR.", "error"); }
    finally { setBusy(false); pairBatchFiles(); }
  }

  async function renderBatchPositionPage(pageNumber) {
    if (!state.batchPreviewDoc) return;
    state.batchPreviewPage = Math.max(1, Math.min(state.batchPreviewDoc.numPages, pageNumber));
    const page = await state.batchPreviewDoc.getPage(state.batchPreviewPage);
    const viewport = page.getViewport({ scale: 1.25 });
    ui.batchCanvas.width = Math.ceil(viewport.width); ui.batchCanvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: ui.batchCanvas.getContext("2d", { alpha: false }), viewport }).promise;
    ui.batchPreviewCounter.textContent = `Página ${state.batchPreviewPage} de ${state.batchPreviewDoc.numPages}`;
    ui.batchPreviewPrevious.disabled = state.batchPreviewPage === 1;
    ui.batchPreviewNext.disabled = state.batchPreviewPage === state.batchPreviewDoc.numPages;
    $("batch-page").value = String(state.batchPreviewPage);
    const saved = state.batchTemplate && state.batchTemplate.page === state.batchPreviewPage ? state.batchTemplate : null;
    const side = saved ? saved.w * ui.batchCanvas.width : Math.max(70, Math.min(145, ui.batchCanvas.width * 0.16));
    Object.assign(ui.batchPlacement.style, {
      width: `${side}px`, height: `${saved ? saved.h * ui.batchCanvas.height : side}px`,
      left: `${saved ? saved.x * ui.batchCanvas.width : ui.batchCanvas.width - side - 28}px`,
      top: `${saved ? saved.y * ui.batchCanvas.height : ui.batchCanvas.height - side - 28}px`,
    });
  }

  async function openBatchPosition() {
    if (!state.pairs.length) return;
    const pair = state.pairs[0];
    try {
      if (state.batchPreviewDoc?.destroy) await state.batchPreviewDoc.destroy();
      state.batchPreviewDoc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await pair.pdf.arrayBuffer()) }).promise;
      if (state.batchQrUrl) URL.revokeObjectURL(state.batchQrUrl);
      state.batchQrUrl = URL.createObjectURL(pair.qrResult.blob);
      ui.batchQrPreview.src = state.batchQrUrl;
      ui.batchTemplateName.textContent = `${pair.pdf.name} · Aluno: ${pair.qrResult.studentName || "nome identificado pelo arquivo"}`;
      const requestedPage = Math.max(1, Number.parseInt($("batch-page").value, 10) || 1);
      await renderBatchPositionPage(requestedPage);
      ui.batchPositionModal.showModal();
    } catch (error) { notify(error.message || "Não foi possível abrir o primeiro certificado.", "error"); }
  }

  async function closeBatchPosition() {
    if (ui.batchPositionModal.open) ui.batchPositionModal.close();
  }

  function configureBatchPlacementPointer() {
    let action = null; let start = null;
    ui.batchPlacement.addEventListener("pointerdown", (event) => {
      action = event.target.classList.contains("resize-handle") ? "resize" : "move";
      start = { x: event.clientX, y: event.clientY, left: parseFloat(ui.batchPlacement.style.left), top: parseFloat(ui.batchPlacement.style.top), width: parseFloat(ui.batchPlacement.style.width), height: parseFloat(ui.batchPlacement.style.height) };
      ui.batchPlacement.setPointerCapture(event.pointerId); event.preventDefault();
    });
    ui.batchPlacement.addEventListener("pointermove", (event) => {
      if (!action || !start) return;
      const dx = event.clientX - start.x; const dy = event.clientY - start.y;
      if (action === "move") {
        ui.batchPlacement.style.left = `${Math.max(0, Math.min(ui.batchCanvas.width - start.width, start.left + dx))}px`;
        ui.batchPlacement.style.top = `${Math.max(0, Math.min(ui.batchCanvas.height - start.height, start.top + dy))}px`;
      } else {
        const side = Math.max(45, Math.min(Math.min(ui.batchCanvas.width - start.left, ui.batchCanvas.height - start.top), Math.max(start.width + dx, start.height + dy)));
        ui.batchPlacement.style.width = `${side}px`; ui.batchPlacement.style.height = `${side}px`;
      }
    });
    const finish = () => { action = null; start = null; };
    ui.batchPlacement.addEventListener("pointerup", finish); ui.batchPlacement.addEventListener("pointercancel", finish);
  }

  function confirmBatchPosition() {
    state.batchTemplate = {
      page: state.batchPreviewPage,
      x: parseFloat(ui.batchPlacement.style.left) / ui.batchCanvas.width,
      y: parseFloat(ui.batchPlacement.style.top) / ui.batchCanvas.height,
      w: parseFloat(ui.batchPlacement.style.width) / ui.batchCanvas.width,
      h: parseFloat(ui.batchPlacement.style.height) / ui.batchCanvas.height,
    };
    closeBatchPosition(); ui.runBatch.disabled = false;
    ui.batchIssue.textContent = `${state.pairs.length} casamento(s) pronto(s) · posição confirmada no primeiro documento.`;
    notify("Posição confirmada. O lote pode ser gerado.");
  }

  function reportLines(font, text, size, maxWidth) {
    const rawWords = String(text || "").replace(/[\u0000-\u001f]+/g, " ").replace(/[–—]/g, "-").replace(/[^\u0020-\u00ff]/g, "?").split(/\s+/).filter(Boolean);
    const words = [];
    rawWords.forEach((word) => {
      if (font.widthOfTextAtSize(word, size) <= maxWidth) { words.push(word); return; }
      let part = "";
      [...word].forEach((character) => {
        if (part && font.widthOfTextAtSize(part + character, size) > maxWidth) { words.push(part); part = character; }
        else part += character;
      });
      if (part) words.push(part);
    });
    const lines = []; let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else { if (line) lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  async function createBatchReportPdf(processReport) {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const width = 595.28; const height = 841.89; const margin = 42; let page; let y;
    const addPage = () => { page = doc.addPage([width, height]); y = height - margin; };
    const ensure = (needed) => { if (y - needed < 54) addPage(); };
    const drawText = (text, options = {}) => {
      const useFont = options.bold ? bold : font; const size = options.size || 9; const color = options.color || rgb(0.12, 0.17, 0.24);
      const lines = reportLines(useFont, text, size, width - (margin * 2));
      ensure(lines.length * (size + 4));
      lines.forEach((line) => { page.drawText(line, { x: margin, y, size, font: useFont, color }); y -= size + 4; });
    };
    addPage();
    drawText("RELATÓRIO DE PAREAMENTO - CERTIFICADOS E QR", { bold: true, size: 16, color: rgb(0.03, 0.36, 0.25) });
    y -= 4;
    drawText(`Gerado em ${new Date().toLocaleString("pt-BR")}`);
    drawText(`Casados: ${state.pairs.length} | Ignorados ou pendentes: ${state.batchAudit.length - state.pairs.length}`);
    drawText("Regra aplicada: o nome externo do certificado deve ser exatamente igual ao campo Aluno do PDF de QR. Acentos, maiúsculas, espaços, hífens e sublinhados não alteram a comparação.");
    y -= 10;
    const processingByCertificate = new Map(processReport.slice(1).map((row) => [row[0], row]));
    state.batchAudit.forEach((item, index) => {
      ensure(76);
      const process = processingByCertificate.get(item.certificate);
      const finalStatus = process && process[2] === "ERRO" ? "ERRO AO GERAR" : item.status;
      const color = finalStatus === "CASADO" ? rgb(0.04, 0.45, 0.3) : finalStatus === "ERRO AO GERAR" || finalStatus === "NÃO ENCONTRADO" ? rgb(0.72, 0.15, 0.15) : rgb(0.65, 0.4, 0.05);
      drawText(`${index + 1}. ${finalStatus}`, { bold: true, size: 10, color });
      if (item.certificate) drawText(`Certificado: ${item.certificate}`);
      if (item.student) drawText(`Aluno no PDF de QR: ${item.student}`);
      if (item.source) drawText(`Origem: ${item.source}`);
      drawText(`Detalhe: ${process && process[2] === "ERRO" ? process[3] : item.detail}`);
      y -= 7;
    });
    const pages = doc.getPages();
    pages.forEach((reportPage, index) => {
      reportPage.drawText(`Página ${index + 1} de ${pages.length}`, { x: width - 105, y: 24, size: 8, font, color: rgb(0.4, 0.45, 0.52) });
      reportPage.drawText("Carlos Antonio de Oliveira Piquet", { x: margin, y: 24, size: 8, font, color: rgb(0.4, 0.45, 0.52) });
    });
    return doc.save();
  }

  async function runBatch() {
    if (!state.pairs.length) return;
    setBusy(true); state.cancelled = false;
    const report = [["PDF", "QR", "Status", "Detalhe"]];
    try {
      requireLibraries(["PDFLib", "JSZip"]);
      const zip = new window.JSZip();
      const pageNumber = state.batchTemplate.page;
      const sourceBytes = state.pairs.reduce((total, pair) => total + pair.pdf.size, 0);
      if (sourceBytes > 900 * 1024 * 1024) notify("Lote muito grande. Mantenha esta aba aberta durante todo o processamento.");
      for (let index = 0; index < state.pairs.length; index += 1) {
        if (state.cancelled) throw new Error("Processamento cancelado.");
        const pair = state.pairs[index];
        setProgress(`Processando ${pair.pdf.name}`, (index / state.pairs.length) * 85);
        try {
          const doc = await window.PDFLib.PDFDocument.load(new Uint8Array(await pair.pdf.arrayBuffer()));
          if (pageNumber > doc.getPageCount()) throw new Error(`O PDF tem apenas ${doc.getPageCount()} página(s).`);
          const image = await embedImage(doc, pair.qrResult.blob);
          const page = doc.getPage(pageNumber - 1);
          const { width, height } = page.getSize();
          page.drawImage(image, { x: state.batchTemplate.x * width, y: height - ((state.batchTemplate.y + state.batchTemplate.h) * height), width: state.batchTemplate.w * width, height: state.batchTemplate.h * height });
          const output = await doc.save();
          zip.file(`${safeName(pair.pdf.name.replace(/\.pdf$/i, ""))}_com_qr.pdf`, output, { compression: "STORE" });
          report.push([pair.pdf.name, `${pair.qrResult.file.name} - página ${pair.qrResult.pageNumber}`, "OK", `${pair.qrResult.studentName || "nome não extraído"}; inserido na página ${pageNumber}`]);
        } catch (error) { report.push([pair.pdf.name, pair.qrResult.file.name, "ERRO", error.message]); }
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      const auditRows = [["status", "certificado", "aluno_no_pdf_qr", "origem", "detalhe"], ...state.batchAudit.map((item) => [item.status, item.certificate, item.student, item.source, item.detail])];
      report.slice(1).filter((row) => row[2] === "ERRO").forEach((row) => auditRows.push(["ERRO AO GERAR", row[0], "", row[1], row[3]]));
      zip.file("relatorio_de_pareamento.csv", `\ufeff${auditRows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`);
      zip.file("relatorio_de_pareamento.pdf", await createBatchReportPdf(report));
      setProgress("Compactando os resultados…", 92);
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE", streamFiles: true }, (metadata) => {
        if (state.cancelled) throw new Error("Processamento cancelado.");
        setProgress(`Montando ZIP · ${metadata.currentFile || "relatórios"}`, 92 + (metadata.percent * 0.08));
      });
      download(blob, "pdfs_com_qr.zip");
      setProgress("Lote concluído", 100);
      const errors = report.slice(1).filter((row) => row[2] === "ERRO").length;
      notify(errors ? `Lote concluído com ${errors} erro(s). Consulte o relatório.` : "Lote concluído sem erros.", errors ? "error" : "");
    } catch (error) { notify(error.message || "Falha no processamento em lote.", "error"); }
    finally { setBusy(false); }
  }

  function cropQr(canvas, location) {
    const points = [location.topLeftCorner, location.topRightCorner, location.bottomLeftCorner, location.bottomRightCorner];
    const padding = 14;
    const minX = Math.max(0, Math.floor(Math.min(...points.map((p) => p.x)) - padding));
    const minY = Math.max(0, Math.floor(Math.min(...points.map((p) => p.y)) - padding));
    const maxX = Math.min(canvas.width, Math.ceil(Math.max(...points.map((p) => p.x)) + padding));
    const maxY = Math.min(canvas.height, Math.ceil(Math.max(...points.map((p) => p.y)) + padding));
    const output = document.createElement("canvas"); output.width = maxX - minX; output.height = maxY - minY;
    output.getContext("2d").drawImage(canvas, minX, minY, output.width, output.height, 0, 0, output.width, output.height);
    return new Promise((resolve, reject) => output.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao criar a imagem do QR.")), "image/png"));
  }

  async function runExtraction() {
    if (!state.extractPdfs.length) return;
    setBusy(true); state.cancelled = false;
    const report = [["PDF", "Página", "Status", "Conteúdo lido"]];
    let scanned = 0; let totalPages = 0; let found = 0;
    try {
      requireLibraries(["pdfjsLib", "JSZip", "jsQR"]);
      const zip = new window.JSZip();
      const documents = [];
      for (const file of state.extractPdfs) {
        const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        documents.push({ file, doc }); totalPages += doc.numPages;
      }
      for (const { file, doc } of documents) {
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          if (state.cancelled) throw new Error("Processamento cancelado.");
          setProgress(`Lendo ${file.name} · página ${pageNumber}`, (scanned / Math.max(1, totalPages)) * 88);
          const page = await doc.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 2.25 });
          const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d", { willReadFrequently: true });
          await page.render({ canvasContext: context, viewport }).promise;
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = window.jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
          if (code) {
            const blob = await cropQr(canvas, code.location); found += 1;
            zip.file(`${safeName(file.name.replace(/\.pdf$/i, ""))}_pagina_${pageNumber}_qr.png`, blob);
            report.push([file.name, pageNumber, "ENCONTRADO", code.data]);
          } else { report.push([file.name, pageNumber, "NÃO ENCONTRADO", ""]); }
          canvas.width = 1; canvas.height = 1; scanned += 1;
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }
      zip.file("relatorio.csv", `\ufeff${report.map((row) => row.map(csvCell).join(";")).join("\r\n")}`);
      setProgress("Compactando o resultado…", 94);
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      download(blob, "qrs_extraidos.zip");
      setProgress("Extração concluída", 100);
      notify(found ? `${found} QR(s) extraído(s).` : "Nenhum QR foi localizado. O relatório foi gerado.", found ? "" : "error");
    } catch (error) { notify(error.message || "Falha ao extrair os QRs.", "error"); }
    finally { setBusy(false); }
  }

  function bindEvents() {
    ui.tabs.forEach((tab) => tab.addEventListener("click", () => switchMode(tab.dataset.mode)));
    ui.singlePdf.addEventListener("change", () => { state.singlePdf = ui.singlePdf.files[0] || null; $("single-pdf-summary").textContent = state.singlePdf ? `${state.singlePdf.name} · ${bytesLabel(state.singlePdf.size)}` : "Nenhum arquivo"; loadSingle(); });
    ui.openQrModal.addEventListener("click", () => ui.qrModal.showModal());
    ui.singleQr.addEventListener("change", async () => {
      const file = ui.singleQr.files[0] || null;
      state.pendingQrResult = null;
      ui.confirmQr.disabled = true;
      ui.qrModalPreviewWrap.classList.add("hidden");
      if (!file) return;
      ui.qrModalStatus.textContent = "Lendo as páginas e procurando o QR…";
      try {
        const [result] = await scanQrPdf(file, { firstOnly: true, onPage: (page, total) => { ui.qrModalStatus.textContent = `Procurando QR · página ${page} de ${total}`; } });
        if (ui.singleQr.files[0] !== file) return;
        state.pendingQrResult = result;
        if (ui.qrModalPreview.src.startsWith("blob:")) URL.revokeObjectURL(ui.qrModalPreview.src);
        ui.qrModalPreview.src = URL.createObjectURL(result.blob);
        ui.qrModalName.textContent = `${result.studentName ? `Aluno: ${result.studentName} · ` : ""}${file.name} · página ${result.pageNumber}`;
        ui.qrModalPreviewWrap.classList.remove("hidden");
        ui.qrModalStatus.textContent = result.studentName ? "QR e nome do aluno identificados." : "QR encontrado; o nome não foi identificado no texto.";
        ui.confirmQr.disabled = false;
      } catch (error) {
        ui.qrModalStatus.textContent = error.message || "Não foi possível extrair o QR deste PDF.";
      }
    });
    ui.confirmQr.addEventListener("click", () => {
      state.singleQr = ui.singleQr.files[0] || null;
      state.singleQrResult = state.pendingQrResult;
      if (!state.singleQr || !state.singleQrResult) return;
      $("single-qr-summary").textContent = `${state.singleQrResult.studentName || state.singleQr.name} · QR da página ${state.singleQrResult.pageNumber}`;
      if (ui.qrModalPreview.src.startsWith("blob:")) URL.revokeObjectURL(ui.qrModalPreview.src);
      ui.qrModal.close();
      loadSingle();
    });
    ui.prev.addEventListener("click", async () => { if (state.currentPage > 1) { state.currentPage -= 1; await renderPage(); } });
    ui.next.addEventListener("click", async () => { if (state.currentPage < state.pdfView.numPages) { state.currentPage += 1; await renderPage(); } });
    ui.placeQr.addEventListener("click", centerPlacement);
    ui.removeQr.addEventListener("click", () => { state.placements.delete(state.currentPage); showPlacement(); updatePlacementSummary(); });
    ui.saveSingle.addEventListener("click", saveSinglePdf);
    const resetBatchAnalysis = () => {
      state.pairs = []; state.qrSources = []; state.batchAudit = []; state.batchTemplate = null; ui.batchReport.replaceChildren(); ui.batchReport.classList.add("hidden");
      ui.batchIssue.classList.remove("ok"); ui.batchIssue.textContent = state.batchPdfs.length && state.batchQrs.length ? "Arquivos selecionados. Clique em “Ler QRs e conferir nomes”." : "Selecione os dois conjuntos para iniciar a leitura.";
      ui.analyzeBatch.disabled = state.busy || !state.batchPdfs.length || !state.batchQrs.length; ui.configureBatch.disabled = true; ui.runBatch.disabled = true;
    };
    ui.batchPdfs.addEventListener("change", () => {
      state.batchPdfs = [...ui.batchPdfs.files]; $("batch-pdfs-summary").textContent = batchFileSummary(state.batchPdfs); resetBatchAnalysis();
      if (state.batchPdfs.length > MAX_BATCH_CERTIFICATES) { ui.analyzeBatch.disabled = true; notify(`Selecione no máximo ${MAX_BATCH_CERTIFICATES} certificados por lote.`, "error"); }
    });
    ui.batchQrs.addEventListener("change", () => { state.batchQrs = [...ui.batchQrs.files]; $("batch-qrs-summary").textContent = fileSummary(state.batchQrs); resetBatchAnalysis(); });
    ui.analyzeBatch.addEventListener("click", analyzeBatch);
    ui.configureBatch.addEventListener("click", openBatchPosition);
    ui.closeBatchPosition.addEventListener("click", closeBatchPosition);
    ui.confirmBatchPosition.addEventListener("click", confirmBatchPosition);
    ui.batchPreviewPrevious.addEventListener("click", () => renderBatchPositionPage(state.batchPreviewPage - 1));
    ui.batchPreviewNext.addEventListener("click", () => renderBatchPositionPage(state.batchPreviewPage + 1));
    ui.batchPositionModal.addEventListener("close", async () => {
      if (state.batchPreviewDoc?.destroy) await state.batchPreviewDoc.destroy();
      state.batchPreviewDoc = null;
    });
    $("batch-page").addEventListener("change", () => { state.batchTemplate = null; ui.runBatch.disabled = true; });
    ui.runBatch.addEventListener("click", runBatch);
    ui.extractPdfs.addEventListener("change", () => { state.extractPdfs = [...ui.extractPdfs.files]; $("extract-summary").textContent = fileSummary(state.extractPdfs); ui.runExtract.disabled = !state.extractPdfs.length; });
    ui.runExtract.addEventListener("click", runExtraction);
    ui.cancel.addEventListener("click", () => { state.cancelled = true; ui.cancel.disabled = true; ui.status.textContent = "Cancelando com segurança…"; });
    window.addEventListener("beforeunload", () => { if (state.qrUrl) URL.revokeObjectURL(state.qrUrl); if (state.batchQrUrl) URL.revokeObjectURL(state.batchQrUrl); });
    configurePlacementPointer();
    configureBatchPlacementPointer();
  }

  try {
    if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    bindEvents();
  } catch (error) { console.error(error); notify("Não foi possível iniciar a ferramenta.", "error"); }
})();
