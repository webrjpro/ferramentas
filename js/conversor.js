/*
 * Copyright (c) 2026 Carlos Antonio de Oliveira Piquet.
 * Todos os direitos reservados. Uso sujeito ao arquivo LICENSE.
 */
(function () {
  "use strict";

  const PREVIEW_ROWS = 100;
  const PREVIEW_COLUMNS = 30;

  const { FIELDS, normalize, valueToString, matrixToCsv, convertRows, trimMatrix, detectHeaderRow, makeHeaders, suggestMapping } = window.FerramentasCore.conversor;

  const elements = {
    fileInput: document.getElementById("file-input"),
    dropZone: document.getElementById("drop-zone"),
    fileSummary: document.getElementById("file-summary"),
    fileName: document.getElementById("file-name"),
    fileSize: document.getElementById("file-size"),
    fileType: document.querySelector(".file-type"),
    removeFile: document.getElementById("remove-file"),
    sheetField: document.getElementById("sheet-field"),
    sheetSelect: document.getElementById("sheet-select"),
    mappingStage: document.getElementById("mapping-stage"),
    mappingGrid: document.getElementById("mapping-grid"),
    optionalMappingGrid: document.getElementById("optional-mapping-grid"),
    fieldSelection: document.getElementById("field-selection"),
    mappingDetails: document.getElementById("mapping-details"),
    selectAllFields: document.getElementById("select-all-fields"),
    clearFields: document.getElementById("clear-fields"),
    mappingMessage: document.getElementById("mapping-message"),
    sourceStats: document.getElementById("source-stats"),
    sourcePreviewStage: document.getElementById("source-preview-stage"),
    sourcePreviewNote: document.getElementById("source-preview-note"),
    sourceTable: document.getElementById("source-table"),
    convertButton: document.getElementById("convert-btn"),
    resultStage: document.getElementById("result-stage"),
    resultSummary: document.getElementById("result-summary"),
    resultTable: document.getElementById("result-table"),
    downloadMoodle: document.getElementById("download-moodle"),
    downloadFull: document.getElementById("download-full"),
    notifications: document.getElementById("notifications"),
  };

  const state = {
    file: null,
    workbook: null,
    sheetName: "",
    headers: [],
    rows: [],
    mapping: new Map(),
    selectedFields: new Set(),
    transformed: null,
    busy: false,
  };

  function bytesToSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function showNotification(message, type = "success") {
    const item = document.createElement("div");
    item.className = `notification ${type === "error" ? "error" : ""}`;
    item.setAttribute("role", type === "error" ? "alert" : "status");
    item.textContent = message;
    elements.notifications.appendChild(item);
    setTimeout(() => item.remove(), 4800);
  }

  function setBusy(busy) {
    state.busy = busy;
    elements.fileInput.disabled = busy;
    elements.removeFile.disabled = busy;
    elements.sheetSelect.disabled = busy;
    elements.convertButton.disabled = busy || !validateMapping(false);
    elements.convertButton.querySelector("span").textContent = busy ? "Processando..." : "Converter dados";
  }

  function resetTool() {
    state.file = null;
    state.workbook = null;
    state.sheetName = "";
    state.headers = [];
    state.rows = [];
    state.mapping.clear();
    state.selectedFields.clear();
    state.transformed = null;
    elements.fileInput.value = "";
    elements.sheetSelect.replaceChildren();
    elements.mappingGrid.replaceChildren();
    elements.optionalMappingGrid.replaceChildren();
    elements.fieldSelection.replaceChildren();
    elements.mappingDetails.open = false;
    elements.sourceTable.replaceChildren();
    elements.resultTable.replaceChildren();
    elements.fileSummary.classList.add("hidden");
    elements.sheetField.classList.add("hidden");
    elements.mappingStage.classList.add("hidden");
    elements.sourcePreviewStage.classList.add("hidden");
    elements.resultStage.classList.add("hidden");
  }

  function autoMapFields() {
    const suggested = suggestMapping(state.headers);
    state.mapping = suggested.mapping;
    state.selectedFields = suggested.selectedFields;
  }

  function createOption(value, text, selected) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = text;
    option.selected = selected;
    return option;
  }

  function renderMapping() {
    elements.mappingGrid.replaceChildren();
    elements.optionalMappingGrid.replaceChildren();
    elements.fieldSelection.replaceChildren();
    for (const field of FIELDS) {
      const row = document.createElement("div");
      row.className = "mapping-row";
      row.dataset.field = field.key;

      const label = document.createElement("div");
      label.className = "mapping-label";
      const labelText = document.createElement("span");
      labelText.textContent = field.label;
      label.appendChild(labelText);
      if (field.required) {
        const tag = document.createElement("span");
        tag.className = "required-tag";
        tag.textContent = "Obrigatorio";
        label.appendChild(tag);
      }

      const select = document.createElement("select");
      select.setAttribute("aria-label", `Coluna de origem para ${field.label}`);
      const mappedIndex = state.mapping.get(field.key) ?? -1;
      select.appendChild(createOption(-1, field.required ? "Selecione uma coluna" : "Nao importar", mappedIndex < 0));
      for (const header of state.headers) {
        select.appendChild(createOption(header.index, header.label, header.index === mappedIndex));
      }
      select.addEventListener("change", () => {
        state.mapping.set(field.key, Number(select.value));
        if (!field.required && Number(select.value) >= 0) state.selectedFields.add(field.key);
        if (!field.required) renderFieldSelection();
        state.transformed = null;
        elements.resultStage.classList.add("hidden");
        validateMapping(true);
      });

      row.append(label, select);
      (field.required ? elements.mappingGrid : elements.optionalMappingGrid).appendChild(row);
    }
    renderFieldSelection();
    validateMapping(true);
  }

  function renderFieldSelection() {
    elements.fieldSelection.replaceChildren();
    for (const field of FIELDS.filter((item) => !item.required)) {
      const label = document.createElement("label");
      label.className = "field-choice";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.selectedFields.has(field.key);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.selectedFields.add(field.key);
        else state.selectedFields.delete(field.key);
        state.transformed = null;
        elements.resultStage.classList.add("hidden");
        validateMapping(true);
      });
      const name = document.createElement("span");
      name.textContent = field.label;
      label.append(checkbox, name);
      elements.fieldSelection.appendChild(label);
    }
  }

  function validateMapping(showMessage) {
    const missing = FIELDS.filter((field) => (field.required || state.selectedFields.has(field.key)) && (state.mapping.get(field.key) ?? -1) < 0);
    for (const field of FIELDS) {
      const row = (field.required ? elements.mappingGrid : elements.optionalMappingGrid).querySelector(`[data-field="${field.key}"]`);
      if (row) row.classList.toggle("missing", missing.includes(field));
    }

    if (showMessage) {
      if (missing.length) {
        elements.mappingMessage.className = "validation-message error";
        elements.mappingMessage.textContent = `Selecione: ${missing.map((field) => field.label).join(", ")}.`;
        if (missing.some((field) => !field.required)) elements.mappingDetails.open = true;
      } else {
        const selectedOptional = state.selectedFields.size;
        elements.mappingMessage.className = "validation-message";
        elements.mappingMessage.textContent = `${selectedOptional} ${selectedOptional === 1 ? "campo opcional selecionado" : "campos opcionais selecionados"}.`;
      }
    }
    if (elements.convertButton) elements.convertButton.disabled = state.busy || missing.length > 0;
    return missing.length === 0;
  }

  function renderStats() {
    elements.sourceStats.replaceChildren();
    const items = [
      `${state.rows.length.toLocaleString("pt-BR")} linhas`,
      `${state.headers.length.toLocaleString("pt-BR")} colunas`,
      state.sheetName,
    ];
    for (const text of items) {
      const pill = document.createElement("span");
      pill.className = "stat-pill";
      pill.textContent = text;
      elements.sourceStats.appendChild(pill);
    }
  }

  function renderTable(container, matrix) {
    container.replaceChildren();
    if (!matrix.length || !matrix[0].length) return;
    const rowLimit = Math.min(matrix.length, PREVIEW_ROWS + 1);
    const columnLimit = Math.min(matrix[0].length, PREVIEW_COLUMNS);
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (let column = 0; column < columnLimit; column += 1) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = valueToString(matrix[0][column]);
      th.title = th.textContent;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let rowIndex = 1; rowIndex < rowLimit; rowIndex += 1) {
      const tr = document.createElement("tr");
      for (let column = 0; column < columnLimit; column += 1) {
        const td = document.createElement("td");
        td.textContent = valueToString(matrix[rowIndex][column]);
        td.title = td.textContent;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);
  }

  function loadSelectedSheet() {
    const sheetName = elements.sheetSelect.value;
    const sheet = state.workbook.Sheets[sheetName];
    if (!sheet) throw new Error("A aba selecionada nao foi encontrada.");

    const matrix = trimMatrix(window.XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
      dateNF: "dd/mm/yyyy",
      blankrows: false,
    }));
    if (!matrix.length) throw new Error("A aba selecionada esta vazia.");

    const headerIndex = detectHeaderRow(matrix);
    const maximumColumns = matrix.reduce((largest, row) => Math.max(largest, row.length), 0);
    const headerRow = Array.from({ length: maximumColumns }, (_, index) => matrix[headerIndex][index] ?? "");
    state.sheetName = sheetName;
    state.headers = makeHeaders(headerRow);
    state.rows = matrix
      .slice(headerIndex + 1)
      .map((row) => state.headers.map((header) => valueToString(row[header.index])))
      .filter((row) => row.some(Boolean));
    state.transformed = null;

    if (!state.headers.length) throw new Error("Nao foi possivel identificar as colunas da planilha.");
    autoMapFields();
    renderMapping();
    renderStats();
    renderTable(elements.sourceTable, [state.headers.map((header) => header.label), ...state.rows]);

    const clippedRows = state.rows.length > PREVIEW_ROWS;
    const clippedColumns = state.headers.length > PREVIEW_COLUMNS;
    elements.sourcePreviewNote.textContent = clippedRows || clippedColumns
      ? `Previa limitada a ${PREVIEW_ROWS} linhas e ${PREVIEW_COLUMNS} colunas`
      : "Todos os dados estao visiveis na previa";
    elements.mappingStage.classList.remove("hidden");
    elements.sourcePreviewStage.classList.remove("hidden");
    elements.resultStage.classList.add("hidden");
  }

  async function loadFile(file) {
    if (state.busy || !file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      showNotification("Selecione um arquivo .xlsx, .xls ou .csv.", "error");
      return;
    }
    if (!window.XLSX) {
      showNotification("A biblioteca de planilhas nao foi carregada. Verifique a conexao e tente novamente.", "error");
      return;
    }

    setBusy(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, {
        type: "array",
        cellDates: true,
        dense: false,
      });
      if (!workbook.SheetNames.length) throw new Error("O arquivo nao possui abas legiveis.");

      state.file = file;
      state.workbook = workbook;
      elements.fileName.textContent = file.name;
      elements.fileName.title = file.name;
      elements.fileSize.textContent = bytesToSize(file.size);
      elements.fileType.textContent = (file.name.split(".").pop() || "XLS").toUpperCase().slice(0, 4);
      elements.fileSummary.classList.remove("hidden");

      elements.sheetSelect.replaceChildren();
      for (const name of workbook.SheetNames) elements.sheetSelect.appendChild(createOption(name, name, false));
      elements.sheetField.classList.toggle("hidden", workbook.SheetNames.length < 2);
      loadSelectedSheet();
      elements.mappingStage.scrollIntoView({ behavior: "smooth", block: "start" });
      showNotification("Planilha importada com sucesso.");
    } catch (error) {
      resetTool();
      const message = /password|encrypted/i.test(error && error.message)
        ? "A planilha esta protegida. Salve uma copia sem protecao e tente novamente."
        : (error && error.message) || "Nao foi possivel ler a planilha.";
      showNotification(message, "error");
    } finally {
      setBusy(false);
    }
  }

  function convertData() {
    if (!validateMapping(true)) return;
    setBusy(true);
    try {
      const { matrix: output, skipped } = convertRows(state.rows, state.mapping, state.selectedFields);
      if (output.length === 1) throw new Error("Nenhuma linha possui Matricula, Nome e Turma preenchidos.");
      state.transformed = { matrix: output, skipped };
      renderTable(elements.resultTable, output);
      const validRows = output.length - 1;
      elements.resultSummary.textContent = `${validRows.toLocaleString("pt-BR")} ${validRows === 1 ? "linha convertida" : "linhas convertidas"}${skipped ? `, ${skipped.toLocaleString("pt-BR")} ignoradas por falta de dados obrigatorios` : ""}.`;
      elements.resultStage.classList.remove("hidden");
      elements.resultStage.scrollIntoView({ behavior: "smooth", block: "start" });
      showNotification("Conversao concluida.");
    } catch (error) {
      showNotification((error && error.message) || "Nao foi possivel converter os dados.", "error");
    } finally {
      setBusy(false);
    }
  }

  function safeFileBase(name) {
    return name.replace(/\.(xlsx|xls|csv)$/i, "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") || "planilha";
  }

  function downloadMatrix(matrix, filename, quoteDates = false) {
    const csv = `\uFEFF${matrixToCsv(matrix, quoteDates)}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function downloadMoodle() {
    if (!state.transformed) {
      showNotification("Converta os dados antes de baixar.", "error");
      return;
    }
    downloadMatrix(state.transformed.matrix, "moodle_import.csv", true);
  }

  function downloadFull() {
    if (!state.rows.length) {
      showNotification("Importe uma planilha antes de baixar.", "error");
      return;
    }
    downloadMatrix([state.headers.map((header) => header.label), ...state.rows], `${safeFileBase(state.file.name)}_completo.csv`);
  }

  elements.fileInput.addEventListener("change", () => loadFile(elements.fileInput.files[0]));
  elements.removeFile.addEventListener("click", resetTool);
  elements.sheetSelect.addEventListener("change", () => {
    try {
      loadSelectedSheet();
    } catch (error) {
      showNotification((error && error.message) || "Nao foi possivel abrir a aba.", "error");
    }
  });
  elements.convertButton.addEventListener("click", convertData);
  elements.selectAllFields.addEventListener("click", () => {
    for (const field of FIELDS.filter((item) => !item.required)) state.selectedFields.add(field.key);
    renderFieldSelection();
    state.transformed = null;
    elements.resultStage.classList.add("hidden");
    validateMapping(true);
  });
  elements.clearFields.addEventListener("click", () => {
    state.selectedFields.clear();
    renderFieldSelection();
    state.transformed = null;
    elements.resultStage.classList.add("hidden");
    validateMapping(true);
  });
  elements.downloadMoodle.addEventListener("click", downloadMoodle);
  elements.downloadFull.addEventListener("click", downloadFull);

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (!state.busy) elements.dropZone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("dragging");
    });
  });
  elements.dropZone.addEventListener("drop", (event) => {
    if (!state.busy && event.dataTransfer && event.dataTransfer.files.length) loadFile(event.dataTransfer.files[0]);
  });

  window.addEventListener("unhandledrejection", (event) => {
    showNotification((event.reason && event.reason.message) || "Ocorreu uma falha inesperada.", "error");
  });
})();
