/*
 * Copyright (c) 2026 Carlos Antonio de Oliveira Piquet.
 * Todos os direitos reservados. Uso sujeito ao arquivo LICENSE.
 */
(function () {
  "use strict";

  const { CATEGORIES, IGNORED, normalize, classify, safeName, uniqueName } = window.FerramentasCore.documentos;

  const elements = {
    input: document.getElementById("student-folder-input"),
    drop: document.getElementById("student-drop-zone"),
    upload: document.getElementById("student-upload-stage"),
    audit: document.getElementById("student-audit-stage"),
    progress: document.getElementById("student-progress-stage"),
    reset: document.getElementById("student-reset"),
    generate: document.getElementById("student-generate"),
    cancel: document.getElementById("student-cancel"),
    search: document.getElementById("student-search"),
    list: document.getElementById("student-list"),
    issues: document.getElementById("student-issues"),
    studentCount: document.getElementById("student-count"),
    fileCount: document.getElementById("student-file-count"),
    generalCount: document.getElementById("student-general-count"),
    issueCount: document.getElementById("student-issue-count"),
    progressTitle: document.getElementById("student-progress-title"),
    progressDetail: document.getElementById("student-progress-detail"),
    progressPercent: document.getElementById("student-progress-percent"),
    progressBar: document.getElementById("student-progress-bar"),
    notifications: document.getElementById("student-notifications"),
  };
  const state = { students: new Map(), issues: [], records: [], cancelled: false, busy: false };

  function notify(message, type = "success") {
    const node = document.createElement("div");
    node.className = `notification ${type === "error" ? "error" : ""}`;
    node.setAttribute("role", type === "error" ? "alert" : "status");
    node.textContent = message;
    elements.notifications.appendChild(node);
    setTimeout(() => node.remove(), 4800);
  }

  function sizeText(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function analyze(records) {
    state.students.clear();
    state.issues = [];
    state.records = records;
    let ignoredAtRoot = 0;
    let ignoredSystem = 0;
    let emptyFiles = 0;

    for (const record of records) {
      const path = String(record.path || record.file.webkitRelativePath || record.file.name).replace(/\\/g, "/");
      const parts = path.split("/").filter(Boolean);
      if (record.file.name.startsWith(".") || IGNORED.has(record.file.name.toLowerCase())) {
        ignoredSystem += 1;
        continue;
      }
      if (parts.length < 3) {
        ignoredAtRoot += 1;
        continue;
      }
      const studentName = parts[1].trim();
      if (!studentName) {
        ignoredAtRoot += 1;
        continue;
      }
      if (record.file.size === 0) emptyFiles += 1;
      const category = classify(record.file.name);
      if (!state.students.has(studentName)) state.students.set(studentName, []);
      state.students.get(studentName).push({ file: record.file, path, category, outputName: "" });
    }

    for (const [student, files] of state.students) {
      const usedByCategory = new Map();
      for (const item of files) {
        if (!usedByCategory.has(item.category)) usedByCategory.set(item.category, new Set());
        const outputName = uniqueName(item.file.name, usedByCategory.get(item.category));
        item.outputName = outputName;
        if (outputName !== safeName(item.file.name)) {
          state.issues.push({ type: "renamed", student, file: item.file.name, detail: `Renomeado para ${outputName}` });
        }
      }
    }

    if (ignoredAtRoot) state.issues.push({ type: "structure", detail: `${ignoredAtRoot} arquivo(s) fora de uma pasta de aluno foram ignorados.` });
    if (ignoredSystem) state.issues.push({ type: "system", detail: `${ignoredSystem} arquivo(s) de sistema foram ignorados.` });
    if (emptyFiles) state.issues.push({ type: "empty", detail: `${emptyFiles} arquivo(s) vazio(s) foram mantidos e sinalizados.` });
    const totalSize = Array.from(state.students.values()).flat().reduce((sum, item) => sum + item.file.size, 0);
    if (totalSize > 700 * 1024 * 1024) state.issues.push({ type: "memory", detail: "O lote ultrapassa 700 MB e pode exigir bastante memoria do navegador." });

    if (!state.students.size) throw new Error("Nenhuma pasta de aluno foi reconhecida. Use: Pasta principal / Nome do aluno / documentos.");
    renderAudit();
  }

  function categoryCounts(files) {
    const counts = new Map();
    for (const item of files) counts.set(item.category, (counts.get(item.category) || 0) + 1);
    return counts;
  }

  function renderAudit() {
    const allFiles = Array.from(state.students.values()).flat();
    const general = allFiles.filter((item) => item.category === "Geral").length;
    elements.studentCount.textContent = state.students.size.toLocaleString("pt-BR");
    elements.fileCount.textContent = allFiles.length.toLocaleString("pt-BR");
    elements.generalCount.textContent = general.toLocaleString("pt-BR");
    elements.issueCount.textContent = state.issues.length.toLocaleString("pt-BR");
    elements.issues.classList.toggle("ok", state.issues.length === 0);
    elements.issues.textContent = state.issues.length
      ? state.issues.map((issue) => issue.detail).join(" ")
      : "Estrutura valida. Nenhum conflito ou arquivo perdido foi detectado.";
    renderStudents();
    elements.upload.classList.add("hidden");
    elements.audit.classList.remove("hidden");
    elements.progress.classList.add("hidden");
    elements.audit.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderStudents() {
    const query = normalize(elements.search.value);
    const entries = Array.from(state.students.entries())
      .filter(([name]) => !query || normalize(name).includes(query))
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
    elements.list.replaceChildren();
    for (const [name, files] of entries) {
      const row = document.createElement("div");
      row.className = "audit-row";
      const nameCell = document.createElement("div");
      nameCell.className = "audit-name";
      nameCell.textContent = name;
      nameCell.title = name;
      const count = document.createElement("div");
      count.className = "audit-meta";
      count.textContent = `${files.length} arquivo${files.length === 1 ? "" : "s"}`;
      const tags = document.createElement("div");
      tags.className = "tag-row";
      for (const [category, amount] of categoryCounts(files)) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = `${category}: ${amount}`;
        tags.appendChild(tag);
      }
      row.append(nameCell, count, tags);
      elements.list.appendChild(row);
    }
  }

  function setProgress(percent, title, detail) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    elements.progressBar.style.width = `${value}%`;
    elements.progressPercent.textContent = `${value}%`;
    if (title) elements.progressTitle.textContent = title;
    if (detail) elements.progressDetail.textContent = detail;
  }

  function csvCell(value) {
    const text = String(value == null ? "" : value);
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  async function generateBatch() {
    if (state.busy || !state.students.size) return;
    if (!window.JSZip) {
      notify("A biblioteca de compactacao nao foi carregada. Verifique a conexao.", "error");
      return;
    }
    state.busy = true;
    state.cancelled = false;
    elements.cancel.disabled = false;
    elements.audit.classList.add("hidden");
    elements.progress.classList.remove("hidden");
    setProgress(0, "Gerando lote", "Preparando arquivos...");
    const report = [["aluno", "arquivo_original", "categoria", "arquivo_no_zip", "tamanho_bytes", "status"]];

    try {
      const master = new window.JSZip();
      const usedStudentZips = new Set();
      const entries = Array.from(state.students.entries()).sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
      for (let index = 0; index < entries.length; index += 1) {
        if (state.cancelled) throw new DOMException("Operacao cancelada.", "AbortError");
        const [student, files] = entries[index];
        setProgress((index / entries.length) * 88, `Organizando ${student}`, `${index + 1} de ${entries.length} alunos`);
        const studentZip = new window.JSZip();
        for (const category of [...Object.keys(CATEGORIES), "Geral"]) studentZip.folder(category);
        for (const item of files) {
          studentZip.folder(item.category).file(item.outputName, item.file);
          report.push([student, item.file.name, item.category, item.outputName, item.file.size, item.file.size === 0 ? "arquivo vazio" : "ok"]);
        }
        const blob = await studentZip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
        const zipName = uniqueName(`${safeName(student, "Aluno")}.zip`, usedStudentZips);
        master.file(zipName, blob, { compression: "STORE" });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const reportCsv = `\uFEFF${report.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
      master.file("relatorio_do_lote.csv", reportCsv);
      master.file("LEIA-ME.txt", `Lote organizado por aluno.\r\nGerado em: ${new Date().toLocaleString("pt-BR")}\r\nAutor da ferramenta: Carlos Antonio de Oliveira Piquet.\r\n`);
      setProgress(92, "Finalizando lote", "Montando o arquivo mestre...");
      const output = await master.generateAsync({ type: "blob", compression: "STORE" }, (meta) => setProgress(92 + meta.percent * 0.08, "Finalizando lote", "Montando o arquivo mestre..."));
      if (state.cancelled) throw new DOMException("Operacao cancelada.", "AbortError");
      const url = URL.createObjectURL(output);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Lote_Alunos_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setProgress(100, "Lote concluido", `${entries.length} alunos organizados. Download iniciado.`);
      notify("Lote organizado e relatorio gerado.");
      setTimeout(() => {
        elements.progress.classList.add("hidden");
        elements.audit.classList.remove("hidden");
      }, 1200);
    } catch (error) {
      const cancelled = error && error.name === "AbortError";
      notify(cancelled ? "Processamento cancelado." : ((error && error.message) || "Falha ao gerar o lote."), cancelled ? "success" : "error");
      elements.progress.classList.add("hidden");
      elements.audit.classList.remove("hidden");
    } finally {
      state.busy = false;
    }
  }

  function recordsFromInput(files) {
    return Array.from(files).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
  }

  function readFileEntry(entry, path) {
    return new Promise((resolve, reject) => entry.file((file) => resolve({ file, path: `${path}${file.name}` }), reject));
  }

  async function walkEntry(entry, parent = "") {
    if (entry.isFile) return [await readFileEntry(entry, parent)];
    if (!entry.isDirectory) return [];
    const directoryPath = `${parent}${entry.name}/`;
    const reader = entry.createReader();
    const children = [];
    while (true) {
      const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      children.push(...batch);
    }
    const nested = [];
    for (const child of children) nested.push(...await walkEntry(child, directoryPath));
    return nested;
  }

  async function recordsFromDrop(dataTransfer) {
    const entries = Array.from(dataTransfer.items || []).map((item) => item.webkitGetAsEntry && item.webkitGetAsEntry()).filter(Boolean);
    if (!entries.length) return recordsFromInput(dataTransfer.files || []);
    const records = [];
    for (const entry of entries) records.push(...await walkEntry(entry));
    return records;
  }

  async function handleRecords(records) {
    try {
      analyze(records);
      notify(`${state.students.size} aluno(s) reconhecido(s).`);
    } catch (error) {
      notify((error && error.message) || "Nao foi possivel analisar a pasta.", "error");
    }
  }

  function reset() {
    if (state.busy) return;
    state.students.clear();
    state.issues = [];
    state.records = [];
    elements.input.value = "";
    elements.search.value = "";
    elements.list.replaceChildren();
    elements.audit.classList.add("hidden");
    elements.progress.classList.add("hidden");
    elements.upload.classList.remove("hidden");
    elements.upload.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  elements.input.addEventListener("change", () => handleRecords(recordsFromInput(elements.input.files)));
  elements.search.addEventListener("input", renderStudents);
  elements.generate.addEventListener("click", generateBatch);
  elements.cancel.addEventListener("click", () => { state.cancelled = true; elements.cancel.disabled = true; elements.progressDetail.textContent = "Cancelando com seguranca..."; });
  elements.reset.addEventListener("click", reset);
  ["dragenter", "dragover"].forEach((name) => elements.drop.addEventListener(name, (event) => { event.preventDefault(); elements.drop.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach((name) => elements.drop.addEventListener(name, (event) => { event.preventDefault(); elements.drop.classList.remove("dragging"); }));
  elements.drop.addEventListener("drop", async (event) => {
    try { await handleRecords(await recordsFromDrop(event.dataTransfer)); }
    catch (error) { notify((error && error.message) || "Nao foi possivel ler a pasta arrastada.", "error"); }
  });
})();
