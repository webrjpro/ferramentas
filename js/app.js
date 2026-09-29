/*
 * Copyright (c) 2026 Carlos Antonio de Oliveira Piquet.
 * Todos os direitos reservados. Uso sujeito ao arquivo LICENSE.
 */
(function () {
  "use strict";

  const { clamp, safeTargetMb, safeBaseName, uniqueOutputName } = window.FerramentasCore.pdf;

  const PROFILE_CONFIG = {
    quality: {
      label: "Maxima nitidez",
      maxScale: 2.2,
      maxQuality: 0.95,
      minScale: 0.82,
      minQuality: 0.58,
    },
    balanced: {
      label: "Equilibrado",
      maxScale: 1.8,
      maxQuality: 0.91,
      minScale: 0.65,
      minQuality: 0.46,
    },
    compact: {
      label: "Ultra compacto",
      maxScale: 1.45,
      maxQuality: 0.85,
      minScale: 0.48,
      minQuality: 0.34,
    },
  };

  const deviceMemory = Number(navigator.deviceMemory) || 4;
  const MAX_RENDER_PIXELS = deviceMemory >= 8 ? 22_000_000 : deviceMemory >= 4 ? 14_000_000 : 9_000_000;
  const MAX_COMPLEXITY_SAMPLES = 72;
  const MB = 1024 * 1024;

  const form = document.getElementById("compress-form");
  const pdfInput = document.getElementById("pdf-input");
  const dropZone = document.getElementById("drop-zone");
  const fileList = document.getElementById("file-list");
  const selectionSummary = document.getElementById("selection-summary");
  const maxMbInput = document.getElementById("max-mb");
  const qualityProfileInput = document.getElementById("quality-profile");
  const strictTargetInput = document.getElementById("strict-target");
  const pdfOptions = document.getElementById("pdf-options");
  const runBtn = document.getElementById("run-btn");
  const cancelBtn = document.getElementById("cancel-btn");
  const progressPanel = document.getElementById("progress-panel");
  const progressBar = document.getElementById("progress-bar");
  const progressTrack = document.querySelector(".progress-track");
  const progressPercent = document.getElementById("progress-percent");
  const status = document.getElementById("status");
  const substatus = document.getElementById("substatus");
  const resultsPanel = document.getElementById("results");
  const reportBody = document.getElementById("report-body");
  const downloadAgain = document.getElementById("download-again");

  let activeJob = null;
  let lastDelivery = null;

  if (!window.pdfjsLib || !window.jspdf || !window.JSZip) {
    progressPanel.classList.remove("hidden");
    status.textContent = "Nao foi possivel carregar as bibliotecas de PDF.";
    substatus.textContent = "Verifique a conexao com a internet e recarregue a pagina.";
    return;
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const jsPDF = window.jspdf.jsPDF;

  function bytesToSize(bytes) {
    if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / MB).toFixed(2)} MB`;
  }

  function selectedPdfFiles() {
    return Array.from(pdfInput.files || []).filter(
      (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name)
    );
  }

  function checkCancelled(job) {
    if (job.cancelled) throw new DOMException("Processamento cancelado.", "AbortError");
  }

  function setProgress(value, headline, detail) {
    const percent = clamp(Math.round(value), 0, 100);
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    progressTrack.setAttribute("aria-valuenow", String(percent));
    if (headline) status.textContent = headline;
    if (typeof detail === "string") substatus.textContent = detail;
  }

  function setBusy(isBusy) {
    runBtn.disabled = isBusy;
    pdfInput.disabled = isBusy;
    maxMbInput.disabled = isBusy;
    qualityProfileInput.disabled = isBusy;
    strictTargetInput.disabled = isBusy;
    cancelBtn.classList.toggle("hidden", !isBusy);
  }

  function renderSelectedFiles() {
    const files = selectedPdfFiles();
    fileList.replaceChildren();
    fileList.classList.toggle("hidden", files.length === 0);
    pdfOptions.classList.toggle("hidden", files.length === 0);
    selectionSummary.textContent = files.length
      ? `${files.length} ${files.length === 1 ? "arquivo" : "arquivos"} - ${bytesToSize(files.reduce((sum, file) => sum + file.size, 0))}`
      : "Nenhum arquivo";

    for (const file of files) {
      const row = document.createElement("div");
      row.className = "file-item";
      const name = document.createElement("span");
      name.className = "file-name";
      name.textContent = file.name;
      name.title = file.name;
      const size = document.createElement("span");
      size.className = "file-size";
      size.textContent = bytesToSize(file.size);
      row.append(name, size);
      fileList.appendChild(row);
    }
  }

  function chooseSamplePages(pageCount) {
    if (pageCount <= MAX_COMPLEXITY_SAMPLES) {
      return new Set(Array.from({ length: pageCount }, (_, index) => index));
    }
    const samples = new Set();
    for (let i = 0; i < MAX_COMPLEXITY_SAMPLES; i += 1) {
      samples.add(Math.round((i * (pageCount - 1)) / (MAX_COMPLEXITY_SAMPLES - 1)));
    }
    return samples;
  }

  function safeRenderScale(width, height, desiredScale) {
    const memoryScale = Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, width * height));
    return Math.max(0.1, Math.min(desiredScale, memoryScale));
  }

  async function renderPageCanvas(page, baseViewport, desiredScale) {
    const scale = safeRenderScale(baseViewport.width, baseViewport.height, desiredScale);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) throw new Error("O navegador nao conseguiu criar a area de renderizacao.");

    await page.render({ canvasContext: context, viewport, background: "rgb(255,255,255)" }).promise;
    return { canvas, scale };
  }

  function canvasToJpeg(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao codificar uma pagina."))),
        "image/jpeg",
        quality
      );
    });
  }

  function releaseCanvas(canvas) {
    canvas.width = 1;
    canvas.height = 1;
  }

  async function inspectDocument(pdf, onProgress, job) {
    const samplePages = chooseSamplePages(pdf.numPages);
    const pages = [];
    const factors = new Map();

    for (let index = 0; index < pdf.numPages; index += 1) {
      checkCancelled(job);
      const page = await pdf.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });
      pages.push({
        width: viewport.width,
        height: viewport.height,
        area: viewport.width * viewport.height,
      });

      if (samplePages.has(index)) {
        const thumbnailScale = Math.min(0.34, 220 / Math.max(viewport.width, viewport.height));
        const rendered = await renderPageCanvas(page, viewport, thumbnailScale);
        const sampleBlob = await canvasToJpeg(rendered.canvas, 0.48);
        const pixels = rendered.canvas.width * rendered.canvas.height;
        factors.set(index, clamp(sampleBlob.size / Math.max(1, pixels), 0.025, 1.5));
        releaseCanvas(rendered.canvas);
      }

      page.cleanup();
      onProgress((index + 1) / pdf.numPages, `Analisando pagina ${index + 1} de ${pdf.numPages}`);
      if (index % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const sampledIndexes = Array.from(factors.keys()).sort((a, b) => a - b);
    let sampleCursor = 0;
    for (let index = 0; index < pages.length; index += 1) {
      while (sampleCursor < sampledIndexes.length - 1 && sampledIndexes[sampleCursor + 1] <= index) {
        sampleCursor += 1;
      }
      const left = sampledIndexes[sampleCursor];
      const right = sampledIndexes[Math.min(sampleCursor + 1, sampledIndexes.length - 1)];
      let factor = factors.get(left) || 0.1;
      if (right !== left && index > left) {
        const mix = (index - left) / (right - left);
        factor = factor * (1 - mix) + (factors.get(right) || factor) * mix;
      }
      pages[index].weight = pages[index].area * (0.2 + factor);
    }

    return pages;
  }

  async function encodePageToBudget(page, pageInfo, budget, config, strictTarget, job) {
    const scaleFloor = strictTarget ? 0.34 : config.minScale;
    const qualityFloor = strictTarget ? 0.22 : config.minQuality;
    let desiredScale = config.maxScale;
    let smallest = null;

    for (let scaleAttempt = 0; scaleAttempt < 7; scaleAttempt += 1) {
      checkCancelled(job);
      const baseViewport = page.getViewport({ scale: 1 });
      const rendered = await renderPageCanvas(page, baseViewport, desiredScale);
      const canvas = rendered.canvas;
      const highBlob = await canvasToJpeg(canvas, config.maxQuality);

      if (!smallest || highBlob.size < smallest.blob.size) {
        smallest = { blob: highBlob, scale: rendered.scale, quality: config.maxQuality };
      }
      if (highBlob.size <= budget) {
        releaseCanvas(canvas);
        return { blob: highBlob, scale: rendered.scale, quality: config.maxQuality };
      }

      const lowBlob = await canvasToJpeg(canvas, qualityFloor);
      if (!smallest || lowBlob.size < smallest.blob.size) {
        smallest = { blob: lowBlob, scale: rendered.scale, quality: qualityFloor };
      }

      if (lowBlob.size <= budget) {
        let low = qualityFloor;
        let high = config.maxQuality;
        let best = { blob: lowBlob, scale: rendered.scale, quality: qualityFloor };
        for (let iteration = 0; iteration < 7; iteration += 1) {
          checkCancelled(job);
          const quality = (low + high) / 2;
          const candidate = await canvasToJpeg(canvas, quality);
          if (candidate.size <= budget) {
            best = { blob: candidate, scale: rendered.scale, quality };
            low = quality;
          } else {
            high = quality;
          }
        }
        releaseCanvas(canvas);
        return best;
      }

      releaseCanvas(canvas);
      if (rendered.scale <= scaleFloor + 0.015) break;
      const predicted = rendered.scale * Math.sqrt(budget / Math.max(1, lowBlob.size)) * 0.94;
      desiredScale = Math.max(scaleFloor, Math.min(rendered.scale * 0.84, predicted));
    }

    return smallest;
  }

  function setPdfProperties(outputPdf, metadata) {
    try {
      const info = (metadata && metadata.info) || {};
      outputPdf.setProperties({
        title: info.Title || "PDF comprimido",
        subject: info.Subject || "",
        author: info.Author || "",
        keywords: info.Keywords || "",
        creator: "Ferramentas locais",
      });
    } catch (_error) {
      // Metadados malformados nao devem impedir a compressao.
    }
  }

  async function compressPdf(file, maxBytes, profileName, strictTarget, onProgress, job) {
    if (file.size <= maxBytes) {
      return {
        outputBlob: file,
        method: "Original preservado (sem perdas)",
        targetMet: true,
        averageDpi: null,
        averageQuality: null,
      };
    }

    const sourceUrl = URL.createObjectURL(file);
    let pdf = null;
    try {
      const loadingTask = window.pdfjsLib.getDocument({
        url: sourceUrl,
        disableAutoFetch: false,
        disableStream: false,
        useWorkerFetch: true,
      });
      pdf = await loadingTask.promise;
      checkCancelled(job);

      const metadataPromise = pdf.getMetadata().catch(() => null);
      const pages = await inspectDocument(
        pdf,
        (ratio, detail) => onProgress(ratio * 0.18, detail),
        job
      );
      checkCancelled(job);

      const pageOverhead = Math.max(160 * 1024, pdf.numPages * 2300);
      const imageBudget = Math.max(64 * 1024, (maxBytes - pageOverhead) * 0.985);
      let remainingBudget = imageBudget;
      let remainingWeight = pages.reduce((sum, page) => sum + page.weight, 0);
      let outputPdf = null;
      let usedImageBytes = 0;
      let scaleSum = 0;
      let qualitySum = 0;
      const config = PROFILE_CONFIG[profileName] || PROFILE_CONFIG.quality;

      for (let index = 0; index < pages.length; index += 1) {
        checkCancelled(job);
        const page = await pdf.getPage(index + 1);
        const pageInfo = pages[index];
        const proportionalBudget = remainingWeight > 0
          ? remainingBudget * (pageInfo.weight / remainingWeight)
          : remainingBudget / Math.max(1, pages.length - index);
        const pagesLeft = pages.length - index;
        const safetyCap = remainingBudget - Math.max(0, pagesLeft - 1) * 1200;
        const pageBudget = Math.max(1200, Math.min(proportionalBudget, safetyCap));

        const encoded = await encodePageToBudget(
          page,
          pageInfo,
          pageBudget,
          config,
          strictTarget,
          job
        );
        if (!encoded || !encoded.blob) throw new Error(`Nao foi possivel codificar a pagina ${index + 1}.`);

        const widthPt = pageInfo.width;
        const heightPt = pageInfo.height;
        const orientation = widthPt > heightPt ? "landscape" : "portrait";
        if (!outputPdf) {
          outputPdf = new jsPDF({
            orientation,
            unit: "pt",
            format: [widthPt, heightPt],
            compress: true,
            putOnlyUsedFonts: true,
            floatPrecision: 12,
          });
          setPdfProperties(outputPdf, await metadataPromise);
        } else {
          outputPdf.addPage([widthPt, heightPt], orientation);
        }

        const imageBytes = new Uint8Array(await encoded.blob.arrayBuffer());
        outputPdf.addImage(
          imageBytes,
          "JPEG",
          0,
          0,
          widthPt,
          heightPt,
          `page-${index + 1}`,
          "NONE"
        );

        usedImageBytes += encoded.blob.size;
        remainingBudget = Math.max(0, imageBudget - usedImageBytes);
        remainingWeight = Math.max(0, remainingWeight - pageInfo.weight);
        scaleSum += encoded.scale;
        qualitySum += encoded.quality;
        page.cleanup();

        const ratio = 0.18 + ((index + 1) / pages.length) * 0.77;
        onProgress(
          ratio,
          `Otimizando pagina ${index + 1} de ${pages.length} - ${Math.round(encoded.scale * 72)} DPI`
        );
        if (index % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }

      checkCancelled(job);
      onProgress(0.97, "Montando o PDF final...");
      const outputBuffer = outputPdf.output("arraybuffer");
      const outputBlob = new Blob([outputBuffer], { type: "application/pdf" });
      onProgress(1, "PDF finalizado.");

      return {
        outputBlob: outputBlob.size < file.size ? outputBlob : file,
        method: outputBlob.size < file.size ? `Adaptativa - ${config.label}` : "Original mantido (compressao nao ajudou)",
        targetMet: Math.min(outputBlob.size, file.size) <= maxBytes,
        averageDpi: Math.round((scaleSum / pages.length) * 72),
        averageQuality: Math.round((qualitySum / pages.length) * 100),
      };
    } finally {
      if (pdf) await pdf.destroy().catch(() => {});
      URL.revokeObjectURL(sourceUrl);
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function prepareDelivery(processedFiles) {
    if (processedFiles.length === 1) {
      return { blob: processedFiles[0].outputBlob, name: processedFiles[0].outputName };
    }

    const zip = new window.JSZip();
    for (const result of processedFiles) zip.file(result.outputName, result.outputBlob);
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    return { blob, name: "pdfs_comprimidos.zip" };
  }

  function cell(text, className) {
    const element = document.createElement("td");
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function renderReport(rows) {
    reportBody.replaceChildren();
    for (const row of rows) {
      const reduction = row.originalBytes > 0
        ? Math.max(0, (1 - row.finalBytes / row.originalBytes) * 100)
        : 0;
      const tr = document.createElement("tr");
      const targetCell = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = `badge ${row.targetMet ? "ok" : "warn"}`;
      badge.textContent = row.targetMet ? "Atingida" : "Nao atingida";
      targetCell.appendChild(badge);

      let detail = row.method;
      if (row.averageDpi) detail += ` (${row.averageDpi} DPI, Q${row.averageQuality})`;
      tr.append(
        cell(row.inputName),
        cell(bytesToSize(row.originalBytes)),
        cell(bytesToSize(row.finalBytes)),
        cell(`${reduction.toFixed(1)}%`),
        targetCell,
        cell(detail)
      );
      reportBody.appendChild(tr);
    }
    resultsPanel.classList.remove("hidden");
  }

  function friendlyError(error) {
    if (error && error.name === "PasswordException") return "O PDF e protegido por senha. Remova a senha e tente novamente.";
    if (error && error.name === "InvalidPDFException") return "O arquivo parece estar corrompido ou nao e um PDF valido.";
    return error && error.message ? error.message : "Ocorreu uma falha inesperada.";
  }

  pdfInput.addEventListener("change", renderSelectedFiles);
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (!pdfInput.disabled) dropZone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
    });
  });
  dropZone.addEventListener("drop", (event) => {
    if (pdfInput.disabled || !event.dataTransfer) return;
    const transfer = new DataTransfer();
    for (const file of Array.from(event.dataTransfer.files)) {
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) transfer.items.add(file);
    }
    pdfInput.files = transfer.files;
    renderSelectedFiles();
  });

  cancelBtn.addEventListener("click", () => {
    if (activeJob) {
      activeJob.cancelled = true;
      status.textContent = "Cancelando com seguranca...";
      substatus.textContent = "Finalizando a pagina em processamento.";
    }
  });

  downloadAgain.addEventListener("click", () => {
    if (lastDelivery) downloadBlob(lastDelivery.blob, lastDelivery.name);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const files = selectedPdfFiles();
    if (!files.length) {
      progressPanel.classList.remove("hidden");
      setProgress(0, "Selecione pelo menos um PDF.", "Use a area acima para escolher os arquivos.");
      return;
    }

    const targetMb = safeTargetMb(maxMbInput.value);
    maxMbInput.value = String(targetMb);
    const maxBytes = targetMb * MB;
    const profile = PROFILE_CONFIG[qualityProfileInput.value] ? qualityProfileInput.value : "quality";
    const strictTarget = strictTargetInput.checked;
    const usedNames = new Set();
    const processed = [];

    activeJob = { cancelled: false };
    lastDelivery = null;
    setBusy(true);
    resultsPanel.classList.add("hidden");
    progressPanel.classList.remove("hidden");
    setProgress(0, "Preparando a compressao...", `${files.length} ${files.length === 1 ? "arquivo" : "arquivos"}`);
    progressPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });

    try {
      for (let index = 0; index < files.length; index += 1) {
        checkCancelled(activeJob);
        const file = files[index];
        const result = await compressPdf(
          file,
          maxBytes,
          profile,
          strictTarget,
          (ratio, detail) => {
            const overall = ((index + ratio) / files.length) * 100;
            setProgress(overall, `Comprimindo ${file.name}`, detail);
          },
          activeJob
        );
        const outputName = uniqueOutputName(safeBaseName(file.name), usedNames);
        processed.push({
          inputName: file.name,
          outputName,
          outputBlob: result.outputBlob,
          originalBytes: file.size,
          finalBytes: result.outputBlob.size,
          method: result.method,
          targetMet: result.targetMet,
          averageDpi: result.averageDpi,
          averageQuality: result.averageQuality,
        });
      }

      setProgress(99, "Preparando o download...", processed.length > 1 ? "Criando o pacote ZIP." : "Quase pronto.");
      lastDelivery = await prepareDelivery(processed);
      downloadBlob(lastDelivery.blob, lastDelivery.name);
      renderReport(processed);
      const allMet = processed.every((item) => item.targetMet);
      setProgress(
        100,
        allMet ? "Pronto. Meta atingida." : "Pronto. Confira o resultado.",
        `Download iniciado: ${lastDelivery.name}`
      );
      resultsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      const cancelled = error && error.name === "AbortError";
      setProgress(
        0,
        cancelled ? "Processamento cancelado." : "Nao foi possivel concluir.",
        cancelled ? "Nenhum arquivo incompleto foi baixado." : friendlyError(error)
      );
    } finally {
      activeJob = null;
      setBusy(false);
    }
  });
})();
