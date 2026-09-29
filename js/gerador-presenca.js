/* Copyright 2026 Carlos Antonio de Oliveira Piquet. Todos os direitos reservados. */
(() => {
  "use strict";
  const { toCsv, csvEscape, withBom, makeSessionsCsv, sessionDescription, sanitizeFileName, createSessionFiles, parseSessionHeader, chooseDate, interpretStatus, isBlankCell, cleanCell, normalizeText, normalizeKey, makeUtcDate, formatIsoDate, formatBrDate, formatSessionDate, formatMoodleSessionDate, pad, timeToMinutes, minutesToTime } = window.FerramentasCore.presenca;

  const state = {
    workbook: null,
    sourceName: "",
    parsed: null,
    selectedModuleId: null,
    selectedSessionId: null,
    selectedModuleIds: new Set(),
    sessionFilter: "",
    previewFilter: "",
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", () => {
    cacheDom();
    bindEvents();
    refreshSheetSelectors();
    setStatus("Aguardando planilha");
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });

  function cacheDom() {
    [
      "statusText",
      "generateZipBtn",
      "exportSelectedPdfBtn",
      "exportSelectedReportPdfBtn",
      "fileInput",
      "dropZone",
      "autoZipInput",
      "fileName",
      "attendanceSheetSelect",
      "rosterSheetSelect",
      "moduleRowInput",
      "dateRowInput",
      "firstStudentRowInput",
      "maxColumnsInput",
      "nameColInput",
      "registrationColInput",
      "admissionColInput",
      "leaveColInput",
      "observationColInput",
      "identifierFieldSelect",
      "presentStatusInput",
      "absentStatusInput",
      "lateStatusInput",
      "specialStatusInput",
      "specialAsExcusedInput",
      "blankAsPresentInput",
      "remarksModeSelect",
      "delimiterSelect",
      "initialYearInput",
      "sessionStartInput",
      "sessionEndInput",
      "session2StartInput",
      "session2EndInput",
      "session3StartInput",
      "session3EndInput",
      "courseShortnameInput",
      "groupNameInput",
      "reanalyzeBtn",
      "detectLayoutBtn",
      "downloadSessionBtn",
      "downloadSessionPdfBtn",
      "downloadModulePdfBtn",
      "downloadModuleReportPdfBtn",
      "activeModuleTitle",
      "activeModuleMeta",
      "activeSessionTotal",
      "activeRecordTotal",
      "activeAbsentTotal",
      "activeSpecialTotal",
      "moduleCount",
      "sessionCount",
      "studentCount",
      "warningCount",
      "modulesTbody",
      "sessionsTbody",
      "previewTbody",
      "sessionSearchInput",
      "previewSearchInput",
      "warningsBox",
      "selectAllModulesBtn",
      "clearModulesBtn",
    ].forEach((id) => {
      dom[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    dom.fileInput.addEventListener("change", handleFileInput);
    bindDropZone();
    dom.generateZipBtn.addEventListener("click", generateZip);
    dom.exportSelectedPdfBtn.addEventListener("click", downloadSelectedModulesPdf);
    dom.exportSelectedReportPdfBtn.addEventListener("click", downloadSelectedModulesReportPdf);
    dom.reanalyzeBtn.addEventListener("click", analyzeWorkbook);
    dom.detectLayoutBtn.addEventListener("click", () => {
      if (state.workbook) {
        applyDetectedLayout();
        analyzeWorkbook();
      }
    });
    dom.downloadSessionBtn.addEventListener("click", downloadSelectedSessionCsv);
    dom.downloadSessionPdfBtn.addEventListener("click", downloadSelectedSessionPdf);
    dom.downloadModulePdfBtn.addEventListener("click", downloadSelectedModulePdf);
    dom.downloadModuleReportPdfBtn.addEventListener("click", downloadSelectedModuleReportPdf);
    dom.sessionSearchInput.addEventListener("input", () => {
      state.sessionFilter = dom.sessionSearchInput.value;
      renderSessions(getSelectedModule());
    });
    dom.previewSearchInput.addEventListener("input", () => {
      state.previewFilter = dom.previewSearchInput.value;
      renderPreview(getSelectedSession());
    });
    dom.selectAllModulesBtn.addEventListener("click", () => setAllModulesSelected(true));
    dom.clearModulesBtn.addEventListener("click", () => setAllModulesSelected(false));

    const settingIds = [
      "attendanceSheetSelect",
      "rosterSheetSelect",
      "moduleRowInput",
      "dateRowInput",
      "firstStudentRowInput",
      "maxColumnsInput",
      "nameColInput",
      "registrationColInput",
      "admissionColInput",
      "leaveColInput",
      "observationColInput",
      "identifierFieldSelect",
      "presentStatusInput",
      "absentStatusInput",
      "lateStatusInput",
      "specialStatusInput",
      "specialAsExcusedInput",
      "blankAsPresentInput",
      "remarksModeSelect",
      "delimiterSelect",
      "initialYearInput",
      "sessionStartInput",
      "sessionEndInput",
      "session2StartInput",
      "session2EndInput",
      "session3StartInput",
      "session3EndInput",
      "courseShortnameInput",
      "groupNameInput",
    ];

    settingIds.forEach((id) => {
      dom[id].addEventListener("change", () => {
        if (state.workbook) {
          analyzeWorkbook();
        }
      });
    });
  }

  function bindDropZone() {
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      document.addEventListener(eventName, (event) => {
        if (event.dataTransfer && [...event.dataTransfer.types].includes("Files")) {
          event.preventDefault();
        }
      });
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      dom.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dom.dropZone.classList.add("drag-over");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dom.dropZone.addEventListener(eventName, () => {
        dom.dropZone.classList.remove("drag-over");
      });
    });

    dom.dropZone.addEventListener("drop", async (event) => {
      event.preventDefault();
      const file = firstSpreadsheetFile(event.dataTransfer.files);
      if (!file) {
        setStatus("Solte um arquivo Excel .xlsx, .xls ou .xlsm");
        return;
      }
      await loadWorkbookFile(file, dom.autoZipInput.checked);
    });
  }

  async function handleFileInput(event) {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }
    await loadWorkbookFile(file, dom.autoZipInput.checked);
  }

  async function loadWorkbookFile(file, autoZip) {
    if (!isSpreadsheetFile(file)) {
      setStatus("Escolha um arquivo Excel .xlsx, .xls ou .xlsm");
      return;
    }
    if (!window.XLSX) {
      setStatus("Biblioteca de planilhas indisponível. Verifique a conexão e recarregue a página.");
      return;
    }
    const buffer = await file.arrayBuffer();
    loadWorkbook(buffer, file.name, { autoZip });
  }

  function loadWorkbook(buffer, fileName, options = {}) {
    try {
      state.workbook = window.XLSX.read(buffer, {
        type: "array",
        cellDates: true,
        dateNF: "dd/mm/yyyy",
      });
      state.sourceName = fileName;
      dom.fileName.textContent = fileName;
      refreshSheetSelectors();
      applyDetectedLayout();
      analyzeWorkbook();
      if (options.autoZip) {
        window.setTimeout(() => generateZip(), 0);
      }
    } catch (error) {
      console.error(error);
      setStatus("Erro ao ler a planilha");
    }
  }

  function firstSpreadsheetFile(fileList) {
    return [...(fileList || [])].find(isSpreadsheetFile) || null;
  }

  function isSpreadsheetFile(file) {
    return Boolean(file && /\.(xlsx|xls|xlsm)$/i.test(file.name));
  }

  function refreshSheetSelectors() {
    const sheetNames = state.workbook ? state.workbook.SheetNames : [];
    fillSelect(dom.attendanceSheetSelect, sheetNames);
    fillSelect(dom.rosterSheetSelect, sheetNames);

    if (!sheetNames.length) {
      return;
    }

    const attendance = sheetNames.find((name) => normalizeText(name).includes("PRESENCA")) || sheetNames[0];
    const roster =
      sheetNames.find((name) => normalizeText(name).includes("TURMA") && name !== attendance) ||
      sheetNames.find((name) => name !== attendance) ||
      sheetNames[0];

    dom.attendanceSheetSelect.value = attendance;
    dom.rosterSheetSelect.value = roster;
  }

  function fillSelect(select, values) {
    select.innerHTML = "";
    if (!values.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Sem planilha";
      select.appendChild(option);
      return;
    }

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value.trim() || value;
      select.appendChild(option);
    });
  }

  function applyDetectedLayout() {
    if (!state.workbook) {
      return;
    }

    const attendanceSheet = state.workbook.Sheets[dom.attendanceSheetSelect.value];
    if (!attendanceSheet) {
      return;
    }

    const rows = sheetRows(attendanceSheet);
    const layout = detectAttendanceLayout(rows);
    if (!layout) {
      setStatus("Não consegui detectar o layout da presença automaticamente");
      return;
    }

    dom.moduleRowInput.value = layout.moduleRow;
    dom.dateRowInput.value = layout.dateRow;
    dom.firstStudentRowInput.value = layout.firstStudentRow;
    dom.nameColInput.value = layout.nameCol;
    dom.registrationColInput.value = layout.registrationCol;
    dom.maxColumnsInput.value = layout.maxColumns;
    dom.observationColInput.value = layout.observationCol || layout.maxColumns + 1;
  }

  function detectAttendanceLayout(rows) {
    let best = null;

    for (let rowNumber = 1; rowNumber <= rows.length; rowNumber += 1) {
      const row = rows[rowNumber - 1] || [];
      const dateCols = [];
      for (let index = 0; index < row.length; index += 1) {
        const text = cleanCell(row[index], true);
        if (parseSessionHeader(text)) {
          dateCols.push(index + 1);
        }
      }
      if (dateCols.length < 2) {
        continue;
      }

      const headerRow = row;
      const nameCol =
        findHeaderIndex(headerRow, ["NOME"]) >= 0 ? findHeaderIndex(headerRow, ["NOME"]) + 1 : 1;
      const registrationCol =
        findHeaderIndex(headerRow, ["MATRICULA"]) >= 0 ? findHeaderIndex(headerRow, ["MATRICULA"]) + 1 : 2;
      const observationCol =
        findHeaderIndex(headerRow, ["OBSERVACAO", "OBSERVACOES"]) >= 0
          ? findHeaderIndex(headerRow, ["OBSERVACAO", "OBSERVACOES"]) + 1
          : findObservationColumn(rows, rowNumber, dateCols);
      const moduleRow = findModuleRow(rows, rowNumber, dateCols);
      const maxColumns = Math.max(...dateCols, observationCol || 0, 20);

      const score = dateCols.length + (moduleRow ? 10 : 0) + (nameCol ? 3 : 0) + (registrationCol ? 3 : 0);
      const candidate = {
        moduleRow: moduleRow || Math.max(1, rowNumber - 1),
        dateRow: rowNumber,
        firstStudentRow: rowNumber + 1,
        nameCol,
        registrationCol,
        observationCol,
        maxColumns,
        score,
      };

      if (!best || candidate.score > best.score) {
        best = candidate;
      }
    }

    return best;
  }

  function findModuleRow(rows, dateRowNumber, dateCols) {
    for (let rowNumber = dateRowNumber - 1; rowNumber >= Math.max(1, dateRowNumber - 5); rowNumber -= 1) {
      const row = rows[rowNumber - 1] || [];
      const titles = dateCols
        .map((col) => cleanCell(row[col - 1]))
        .filter((value) => isModuleTitle(value));
      if (titles.length) {
        return rowNumber;
      }
    }
    return Math.max(1, dateRowNumber - 1);
  }

  function findObservationColumn(rows, headerRowNumber, dateCols = []) {
    for (let rowNumber = Math.max(1, headerRowNumber - 2); rowNumber <= Math.min(rows.length, headerRowNumber + 2); rowNumber += 1) {
      const found = findHeaderIndex(rows[rowNumber - 1] || [], ["OBSERVACAO", "OBSERVACOES"]);
      if (found >= 0) {
        return found + 1;
      }
    }

    const startColumn = dateCols.length ? Math.max(...dateCols) + 1 : 1;
    const scores = new Map();
    for (let rowNumber = headerRowNumber + 1; rowNumber <= Math.min(rows.length, headerRowNumber + 45); rowNumber += 1) {
      const row = rows[rowNumber - 1] || [];
      for (let index = startColumn - 1; index < row.length; index += 1) {
        const value = cleanCell(row[index], true);
        if (!value || isTotalHeader(value)) {
          continue;
        }
        if (/[A-Za-zÀ-ÿ]/.test(value) && value.length > 12) {
          scores.set(index + 1, (scores.get(index + 1) || 0) + 1);
        }
      }
    }

    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    return ranked.length && ranked[0][1] >= 2 ? ranked[0][0] : null;
  }

  function analyzeWorkbook() {
    if (!state.workbook) {
      return;
    }

    const settings = getSettings();
    const attendanceSheet = state.workbook.Sheets[settings.attendanceSheet];
    const rosterSheet = state.workbook.Sheets[settings.rosterSheet];

    if (!attendanceSheet) {
      setStatus("Aba de presença não encontrada");
      return;
    }

    const attendanceRows = sheetRows(attendanceSheet);
    const rosterRows = rosterSheet ? sheetRows(rosterSheet) : [];
    const warnings = [];
    const roster = buildRoster(rosterRows, warnings, settings);
    const students = collectStudents(attendanceRows, roster, settings, warnings);
    const modules = collectModules(attendanceRows, students, settings, warnings);

    state.parsed = {
      settings,
      modules,
      students,
      warnings: uniqueMessages(warnings),
    };

    const moduleIds = new Set(modules.map((module) => module.id));
    state.selectedModuleIds = new Set(
      [...state.selectedModuleIds].filter((id) => moduleIds.has(id))
    );
    if (!state.selectedModuleIds.size) {
      modules.forEach((module) => state.selectedModuleIds.add(module.id));
    }

    if (!modules.some((module) => module.id === state.selectedModuleId)) {
      state.selectedModuleId = modules[0] ? modules[0].id : null;
    }

    const selectedModule = modules.find((module) => module.id === state.selectedModuleId);
    if (!selectedModule || !selectedModule.sessions.some((session) => session.id === state.selectedSessionId)) {
      state.selectedSessionId = selectedModule && selectedModule.sessions[0] ? selectedModule.sessions[0].id : null;
    }

    render();
    setStatus(`${modules.length} módulos, ${sum(modules, (module) => module.sessions.length)} sessões`);
  }

  function sheetRows(sheet) {
    return window.XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
  }

  function getSettings() {
    return {
      attendanceSheet: dom.attendanceSheetSelect.value,
      rosterSheet: dom.rosterSheetSelect.value,
      moduleRow: readNumber(dom.moduleRowInput, 6),
      dateRow: readNumber(dom.dateRowInput, 7),
      firstStudentRow: readNumber(dom.firstStudentRowInput, 8),
      maxColumns: readNumber(dom.maxColumnsInput, 240),
      nameCol: readNumber(dom.nameColInput, 2),
      registrationCol: readNumber(dom.registrationColInput, 1),
      admissionCol: readNumber(dom.admissionColInput, 3),
      leaveCol: readNumber(dom.leaveColInput, 4),
      observationCol: readNumber(dom.observationColInput, 179),
      identifierField: dom.identifierFieldSelect.value,
      presentStatus: dom.presentStatusInput.value.trim() || "Pr",
      absentStatus: dom.absentStatusInput.value.trim() || "Au",
      lateStatus: dom.lateStatusInput.value.trim() || "At",
      specialStatus: dom.specialStatusInput.value.trim() || "Di",
      specialAsExcused: dom.specialAsExcusedInput.checked,
      blankAsPresent: dom.blankAsPresentInput.checked,
      remarksMode: dom.remarksModeSelect.value,
      delimiter: dom.delimiterSelect.value,
      initialYear: readNumber(dom.initialYearInput, 2024),
      sessionStart: dom.sessionStartInput.value || "13:40",
      sessionEnd: dom.sessionEndInput.value || "16:10",
      session2Start: dom.session2StartInput.value || "16:30",
      session2End: dom.session2EndInput.value || "19:00",
      session3Start: dom.session3StartInput.value || "19:10",
      session3End: dom.session3EndInput.value || "21:40",
      courseShortname: dom.courseShortnameInput.value.trim(),
      groupName: dom.groupNameInput.value.trim(),
    };
  }

  function readNumber(input, fallback) {
    const value = Number.parseInt(input.value, 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function buildRoster(rows, warnings, settings) {
    const headerRowIndex = rows.findIndex((row, index) => {
      if (index > 30) {
        return false;
      }
      return findHeaderIndex(row || [], ["NOME"]) >= 0 && findHeaderIndex(row || [], ["MATRICULA"]) >= 0;
    });
    const header = headerRowIndex >= 0 ? rows[headerRowIndex] || [] : [];
    const indexes = {
      name: findHeaderIndex(header, ["NOME"]),
      registration: findHeaderIndex(header, ["MATRICULA"]),
      email: findHeaderIndex(header, ["EMAIL", "E-MAIL"]),
    };
    const byRegistration = new Map();
    const byName = new Map();

    if (headerRowIndex < 0) {
      if (settings.identifierField === "email") {
        warnings.push("Não encontrei uma aba de alunos com nome, matrícula e email. Use idnumber ou selecione a aba correta.");
      }
      return { byRegistration, byName };
    }

    if (settings.identifierField === "email" && indexes.email < 0) {
      warnings.push("A aba de alunos não tem coluna de email. Use idnumber ou selecione uma aba com email.");
    }

    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const name = cleanCell(row[indexes.name]);
      const registration = cleanCell(row[indexes.registration]);
      const email = cleanCell(row[indexes.email]);
      if (!name && !registration) {
        continue;
      }
      const record = { name, registration, email };
      if (registration) {
        byRegistration.set(normalizeKey(registration), record);
      }
      if (name) {
        byName.set(normalizeKey(name), record);
      }
    }

    return { byRegistration, byName };
  }

  function findHeaderIndex(header, needles) {
    return header.findIndex((value) => {
      const normalized = normalizeText(cleanCell(value));
      return needles.some((needle) => normalized.includes(needle));
    });
  }

  function collectStudents(rows, roster, settings, warnings) {
    const students = [];

    for (let rowNumber = settings.firstStudentRow; rowNumber <= rows.length; rowNumber += 1) {
      const name = cleanCell(getCell(rows, rowNumber, settings.nameCol));
      const registration = cleanCell(getCell(rows, rowNumber, settings.registrationCol));

      if (!name && !registration) {
        continue;
      }
      if (!registration || isFooterName(name)) {
        continue;
      }

      const rosterRecord =
        roster.byRegistration.get(normalizeKey(registration)) ||
        roster.byName.get(normalizeKey(name)) ||
        {};

      const email = cleanCell(rosterRecord.email);
      const username = email ? email.split("@")[0] : "";
      const observation = cleanCell(getCell(rows, rowNumber, settings.observationCol), true);

      students.push({
        rowNumber,
        name,
        registration,
        email,
        idnumber: registration,
        username,
        observation,
        admission: cleanCell(getCell(rows, rowNumber, settings.admissionCol)),
        leave: cleanCell(getCell(rows, rowNumber, settings.leaveCol)),
      });
    }

    if (!students.length) {
      warnings.push("Nenhum aluno foi identificado na aba de presença.");
    }

    return students;
  }

  function isFooterName(name) {
    const normalized = normalizeText(name);
    return (
      normalized === "REGIME ESPECIAL DE APRENDIZAGEM" ||
      normalized === "REGIME ESPECIAL DE APRENDIZAGEM" ||
      normalized === "DESLIGADO" ||
      normalized === "DESLIGADOS"
    );
  }

  function collectModules(rows, students, settings, warnings) {
    const modulesByKey = new Map();

    for (let sessionColumn = 1; sessionColumn <= settings.maxColumns; sessionColumn += 1) {
      if (isIgnoredTotalColumn(rows, settings.moduleRow, settings.dateRow, sessionColumn)) {
        continue;
      }

      const header = cleanCell(getCell(rows, settings.dateRow, sessionColumn), true);
      const parsedHeader = parseSessionHeader(header);
      if (!parsedHeader) {
        continue;
      }

      const moduleInfo = findModuleForSessionColumn(rows, settings.moduleRow, sessionColumn);
      if (!moduleInfo) {
        warnings.push(`Não encontrei o módulo da coluna ${sessionColumn} (${header}).`);
        continue;
      }

      const key = `${moduleInfo.startColumn}:${moduleInfo.title}`;
      if (!modulesByKey.has(key)) {
        modulesByKey.set(key, {
          id: `module-${moduleInfo.startColumn}`,
          startColumn: moduleInfo.startColumn,
          endColumn: sessionColumn,
          title: moduleInfo.title,
          sessions: [],
          stats: createStats(),
        });
      }

      const module = modulesByKey.get(key);
      module.endColumn = Math.max(module.endColumn, sessionColumn);
      module.sessions.push({
        id: `session-${sessionColumn}`,
        column: sessionColumn,
        moduleId: module.id,
        rawHeader: header,
        title: parsedHeader.title,
        lesson: parsedHeader.lesson,
        day: parsedHeader.day,
        month: parsedHeader.month,
        explicitYear: parsedHeader.year,
        date: null,
        iso: "",
        dateDisplay: "",
        records: [],
        stats: createStats(),
        fileName: "",
      });
    }

    const modules = [...modulesByKey.values()].sort((a, b) => a.startColumn - b.startColumn);

    assignSessionYears(modules, settings.initialYear);
    buildSessionRecords(rows, modules, students, settings, warnings);
    removeEmptySessions(modules, warnings);
    applySessionTimes(modules, settings);
    assignFileNames(modules);
    return modules.filter((module) => module.sessions.length);
  }

  function isIgnoredTotalColumn(rows, moduleRow, dateRow, column) {
    const nearbyValues = [];
    for (let row = Math.max(1, moduleRow - 1); row <= dateRow + 1; row += 1) {
      nearbyValues.push(cleanCell(getCell(rows, row, column), true));
    }
    return nearbyValues.some((value) => isTotalHeader(value));
  }

  function removeEmptySessions(modules, warnings) {
    modules.forEach((module) => {
      const kept = [];
      module.sessions.forEach((session) => {
        if (session.stats.explicit > 0) {
          kept.push(session);
        } else {
          warnings.push(`Sessão ignorada sem registros: ${module.title} / ${session.rawHeader}.`);
        }
      });
      module.sessions = kept;
      module.stats = createStats();
      module.sessions.forEach((session) => addStats(module.stats, session.stats));
    });
  }

  function findModuleForSessionColumn(rows, moduleRow, sessionColumn) {
    const row = rows[moduleRow - 1] || [];
    for (let column = sessionColumn; column >= 1; column -= 1) {
      const title = cleanCell(row[column - 1]);
      if (isModuleTitle(title)) {
        return { title, startColumn: column };
      }
    }
    return null;
  }

  function isModuleTitle(value) {
    if (!value) {
      return false;
    }
    const normalized = normalizeText(value);
    return (
      normalized !== "TOTAL FALTAS" &&
      normalized !== "TOTAL FALTA" &&
      normalized !== "OBSERVACAO" &&
      normalized !== "OBSERVACOES" &&
      normalized !== "ATIVOS" &&
      normalized !== "DESLIGADOS" &&
      normalized !== "MATRICULA" &&
      normalized !== "NOME" &&
      normalized !== "NOME / SOBRENOME" &&
      normalized !== "SOBRENOME" &&
      !parseSessionHeader(value) &&
      !normalized.startsWith("TOTAL")
    );
  }

  function isTotalHeader(value) {
    const normalized = normalizeText(value);
    return (
      normalized === "FALTAS" ||
      normalized === "FALTA" ||
      normalized.startsWith("TOTAL") ||
      normalized.includes("TOTAL FALTA") ||
      normalized.includes("TOTAL FALTAS")
    );
  }

  function findModuleEndColumn(rows, moduleRow, startColumn, maxColumns) {
    for (let column = startColumn + 1; column <= maxColumns; column += 1) {
      const marker = cleanCell(getCell(rows, moduleRow, column));
      if (marker) {
        return column - 1;
      }
    }
    return maxColumns;
  }

  function assignSessionYears(modules, initialYear) {
    let previous = null;
    const sessions = modules
      .flatMap((module) => module.sessions)
      .sort((a, b) => a.column - b.column);

    sessions.forEach((session) => {
      session.date = chooseDate(session.day, session.month, session.explicitYear, previous, initialYear);
      session.iso = formatIsoDate(session.date);
      session.dateDisplay = formatBrDate(session.date);
      previous = session.date;
    });
  }

  function buildSessionRecords(rows, modules, students, settings, warnings) {
    modules.forEach((module) => {
      module.sessions.forEach((session) => {
        const stats = createStats();
        const records = [];

        students.forEach((student) => {
          const rawValue = getCell(rows, student.rowNumber, session.column);
          if (!isBlankCell(rawValue)) {
            stats.explicit += 1;
          }
          const interpreted = interpretStatus(rawValue, settings);

          if (interpreted.kind === "blank") {
            stats.skipped += 1;
            return;
          }
          if (interpreted.kind === "unknown") {
            warnings.push(
              `Valor não reconhecido em ${student.name}, ${module.title}, ${session.rawHeader}: "${cleanCell(rawValue)}".`
            );
            stats.skipped += 1;
            return;
          }

          const identifier = getStudentIdentifier(student, settings.identifierField);
          if (!identifier) {
            warnings.push(
              `${student.name} não tem identificador "${settings.identifierField}" para importar no Moodle.`
            );
            stats.skipped += 1;
            return;
          }

          const remarks = getRemarks(student.observation, session, settings, interpreted.remark);
          records.push({
            identifier,
            status: interpreted.status,
            kind: interpreted.kind,
            name: student.name,
            registration: student.registration,
            remarks,
          });

          stats.records += 1;
          stats[interpreted.kind] += 1;
        });

        session.records = records;
        session.stats = stats;
        addStats(module.stats, stats);
      });
    });
  }

  function getStudentIdentifier(student, field) {
    if (field === "email") {
      return student.email;
    }
    if (field === "idnumber") {
      return student.idnumber;
    }
    if (field === "username") {
      return student.username;
    }
    return "";
  }

  function getRemarks(observation, session, settings, rawRemark) {
    const extras = [];
    if (rawRemark) {
      extras.push(rawRemark);
    }
    if (settings.remarksMode === "none" || !observation) {
      return extras.join(" | ");
    }
    if (settings.remarksMode === "full") {
      extras.push(observation);
      return uniqueMessages(extras).join(" | ");
    }

    const matchedLines = observation
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && lineMentionsSessionDate(line, session.date));

    extras.push(...matchedLines);
    return uniqueMessages(extras).join(" | ");
  }

  function lineMentionsSessionDate(line, date) {
    const day = date.getUTCDate();
    const month = date.getUTCMonth() + 1;
    const year = date.getUTCFullYear();
    const dd = pad(day);
    const mm = pad(month);
    const yyyy = String(year);
    const yy = yyyy.slice(-2);
    const escaped = line.replace(/\s+/g, " ");

    const directPatterns = [
      `${dd}/${mm}/${yyyy}`,
      `${day}/${month}/${yyyy}`,
      `${dd}/${mm}/${yy}`,
      `${dd}/${mm}`,
      `${day}/${month}`,
      `${dd}.${mm}.${yyyy}`,
      `${dd}.${mm}`,
    ];

    if (directPatterns.some((pattern) => escaped.includes(pattern))) {
      return true;
    }

    const dayPattern = `0?${day}`;
    const monthPattern = `0?${month}`;
    const grouped = new RegExp(
      `(^|\\D)${dayPattern}\\s*(e|,|/)\\s*\\d{1,2}\\s*[/.]\\s*${monthPattern}\\s*[/.]\\s*${year}(\\D|$)`,
      "i"
    );
    const groupedReverse = new RegExp(
      `(^|\\D)\\d{1,2}\\s*(e|,|/)\\s*${dayPattern}\\s*[/.]\\s*${monthPattern}\\s*[/.]\\s*${year}(\\D|$)`,
      "i"
    );

    return grouped.test(escaped) || groupedReverse.test(escaped);
  }

  function applySessionTimes(modules, settings) {
    modules.forEach((module) => {
      const byDate = new Map();
      module.sessions.forEach((session) => {
        if (!byDate.has(session.iso)) {
          byDate.set(session.iso, []);
        }
        byDate.get(session.iso).push(session);
      });

      byDate.forEach((sessions) => {
        sessions.sort((a, b) => a.column - b.column);
        const slots = getOrderedTimeSlots(settings, sessions.length);
        sessions.forEach((session, index) => {
          const slot = slots[index];
          session.from = slot.from;
          session.to = slot.to;
        });
      });
    });
  }

  function getOrderedTimeSlots(settings, count) {
    const base = [
      { from: settings.sessionStart, to: settings.sessionEnd },
      { from: settings.session2Start, to: settings.session2End },
      { from: settings.session3Start, to: settings.session3End },
    ];
    const slots = [];

    for (let index = 0; index < count; index += 1) {
      const template = base[Math.min(index, base.length - 1)];
      const extraMinutes = Math.max(0, index - (base.length - 1)) * 10;
      slots.push(shiftSlot(template.from, template.to, extraMinutes));
    }

    return slots;
  }

  function shiftSlot(from, to, minutes) {
    const fromMinutes = timeToMinutes(from) + minutes;
    let toMinutes = timeToMinutes(to) + minutes;
    if (toMinutes <= fromMinutes) {
      toMinutes = fromMinutes + 60;
    }
    return {
      from: minutesToTime(fromMinutes),
      to: minutesToTime(toMinutes),
    };
  }

  function assignFileNames(modules) {
    modules.forEach((module) => {
      const used = new Set();
      module.sessions.forEach((session) => {
        const lessonSlug = slugify(session.lesson || "aula");
        let base = `${session.iso}_${lessonSlug || "aula"}.csv`;
        let fileName = base;
        let counter = 2;
        while (used.has(fileName)) {
          fileName = base.replace(/\.csv$/i, `_${counter}.csv`);
          counter += 1;
        }
        used.add(fileName);
        session.fileName = fileName;
      });
    });
  }

  function render() {
    const parsed = state.parsed;
    if (!parsed) {
      return;
    }

    const modules = parsed.modules;
    const sessionTotal = sum(modules, (module) => module.sessions.length);
    const selectedModules = getSelectedModules();
    const selectedModule = getSelectedModule();

    dom.moduleCount.textContent = String(modules.length);
    dom.sessionCount.textContent = String(sessionTotal);
    dom.studentCount.textContent = String(parsed.students.length);
    dom.warningCount.textContent = String(parsed.warnings.length);
    dom.generateZipBtn.disabled = !selectedModules.length;
    dom.exportSelectedPdfBtn.disabled = !selectedModules.length;
    dom.exportSelectedReportPdfBtn.disabled = !selectedModules.length;
    dom.reanalyzeBtn.disabled = false;
    dom.detectLayoutBtn.disabled = false;
    dom.downloadSessionBtn.disabled = !getSelectedSession();
    dom.downloadSessionPdfBtn.disabled = !getSelectedSession();
    dom.downloadModulePdfBtn.disabled = !selectedModule;
    dom.downloadModuleReportPdfBtn.disabled = !selectedModule;

    renderActiveContext(selectedModule);
    renderModules(modules);
    renderSessions(selectedModule);
    renderPreview(getSelectedSession());
    renderWarnings(parsed.warnings);
  }

  function renderActiveContext(module) {
    if (!module) {
      dom.activeModuleTitle.textContent = "Nenhum módulo selecionado";
      dom.activeModuleMeta.textContent = "Selecione um módulo na tabela para abrir as sessões";
      dom.activeSessionTotal.textContent = "0";
      dom.activeRecordTotal.textContent = "0";
      dom.activeAbsentTotal.textContent = "0";
      dom.activeSpecialTotal.textContent = "0";
      return;
    }

    const session = getSelectedSession();
    dom.activeModuleTitle.textContent = module.title;
    dom.activeModuleMeta.textContent = session
      ? `${session.dateDisplay} | ${session.from}-${session.to} | ${session.lesson}`
      : `Colunas ${module.startColumn}-${module.endColumn}`;
    dom.activeSessionTotal.textContent = String(module.sessions.length);
    dom.activeRecordTotal.textContent = String(module.stats.records);
    dom.activeAbsentTotal.textContent = String(module.stats.absent);
    dom.activeSpecialTotal.textContent = String(module.stats.special);
  }

  function renderModules(modules) {
    if (!modules.length) {
      dom.modulesTbody.innerHTML = `<tr><td colspan="7" class="empty-state">Sem módulos encontrados</td></tr>`;
      return;
    }

    dom.modulesTbody.innerHTML = modules
      .map((module) => {
        const checked = state.selectedModuleIds.has(module.id) ? "checked" : "";
        const active = module.id === state.selectedModuleId ? " active" : "";
        return `
          <tr class="module-row${active}" data-module-id="${escapeAttr(module.id)}">
            <td class="check-cell">
              <input type="checkbox" data-module-check="${escapeAttr(module.id)}" ${checked}>
            </td>
            <td class="module-name">
              ${escapeHtml(module.title)}
              <span class="small-muted">colunas ${module.startColumn}-${module.endColumn}</span>
            </td>
            <td>${module.sessions.length}</td>
            <td>${module.stats.records}</td>
            <td>${module.stats.late}</td>
            <td>${module.stats.absent}</td>
            <td>${module.stats.special}</td>
          </tr>
        `;
      })
      .join("");

    dom.modulesTbody.querySelectorAll("[data-module-id]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.matches("input[type='checkbox']")) {
          return;
        }
        state.selectedModuleId = row.dataset.moduleId;
        const module = getSelectedModule();
        state.selectedSessionId = module && module.sessions[0] ? module.sessions[0].id : null;
        render();
      });
    });

    dom.modulesTbody.querySelectorAll("[data-module-check]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const id = checkbox.dataset.moduleCheck;
        if (checkbox.checked) {
          state.selectedModuleIds.add(id);
        } else {
          state.selectedModuleIds.delete(id);
        }
        render();
      });
    });
  }

  function renderSessions(module) {
    if (!module) {
      dom.sessionsTbody.innerHTML = `<tr><td colspan="7" class="empty-state">Sem módulo</td></tr>`;
      return;
    }

    const query = normalizeSearchQuery(state.sessionFilter);
    const sessions = module.sessions.filter((session) => sessionMatchesFilter(session, query));
    if (!sessions.length) {
      dom.sessionsTbody.innerHTML = `<tr><td colspan="7" class="empty-state">Nenhuma sessão encontrada</td></tr>`;
      return;
    }

    dom.sessionsTbody.innerHTML = sessions
      .map((session) => {
        const active = session.id === state.selectedSessionId ? " active" : "";
        return `
          <tr class="module-row${active}" data-session-id="${escapeAttr(session.id)}">
            <td>${escapeHtml(session.dateDisplay)}<span class="small-muted">${escapeHtml(session.from)} - ${escapeHtml(session.to)}</span></td>
            <td>${escapeHtml(session.lesson)}<span class="small-muted">${escapeHtml(session.rawHeader)}</span></td>
            <td><button class="csv-link" type="button" data-download-session="${escapeAttr(session.id)}">${escapeHtml(session.fileName)}</button></td>
            <td>${session.stats.present}</td>
            <td>${session.stats.late}</td>
            <td>${session.stats.special}</td>
            <td>${session.stats.absent}</td>
          </tr>
        `;
      })
      .join("");

    dom.sessionsTbody.querySelectorAll("[data-session-id]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.matches("[data-download-session]")) {
          return;
        }
        state.selectedSessionId = row.dataset.sessionId;
        render();
      });
    });

    dom.sessionsTbody.querySelectorAll("[data-download-session]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedSessionId = button.dataset.downloadSession;
        downloadSelectedSessionCsv();
        render();
      });
    });
  }

  function renderPreview(session) {
    if (!session) {
      dom.previewTbody.innerHTML = `<tr><td colspan="4" class="empty-state">Sem sessão</td></tr>`;
      return;
    }

    const query = normalizeSearchQuery(state.previewFilter);
    const rows = session.records.filter((record) => recordMatchesFilter(record, query));
    if (!rows.length) {
      dom.previewTbody.innerHTML = `<tr><td colspan="4" class="empty-state">Sem registros para esta sessão</td></tr>`;
      return;
    }

    dom.previewTbody.innerHTML = rows
      .map((record) => {
        return `
          <tr>
            <td>${escapeHtml(record.identifier)}</td>
            <td>${statusPill(record)}</td>
            <td>${escapeHtml(record.name)}<span class="small-muted">${escapeHtml(record.registration)}</span></td>
            <td>${escapeHtml(record.remarks)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function normalizeSearchQuery(value) {
    return normalizeText(value || "");
  }

  function sessionMatchesFilter(session, query) {
    if (!query) {
      return true;
    }
    return textMatchesQuery([
      session.dateDisplay,
      session.from,
      session.to,
      session.lesson,
      session.rawHeader,
      session.fileName,
      session.stats.present,
      session.stats.late,
      session.stats.special,
      session.stats.absent,
    ], query);
  }

  function recordMatchesFilter(record, query) {
    if (!query) {
      return true;
    }
    return textMatchesQuery([
      record.identifier,
      record.status,
      record.kind,
      record.name,
      record.registration,
      record.remarks,
    ], query);
  }

  function textMatchesQuery(values, query) {
    return normalizeText(values.filter((value) => value !== null && value !== undefined).join(" ")).includes(query);
  }

  function statusPill(record) {
    const className =
      record.kind === "present"
        ? "present"
        : record.kind === "absent"
          ? "absent"
          : record.kind === "late"
            ? "late"
            : "special";
    return `<span class="status-pill ${className}">${escapeHtml(record.status)}</span>`;
  }

  function renderWarnings(warnings) {
    if (!warnings.length) {
      dom.warningsBox.classList.remove("has-warnings");
      dom.warningsBox.textContent = "Nenhum aviso";
      return;
    }
    dom.warningsBox.classList.add("has-warnings");
    dom.warningsBox.textContent = warnings.join("\n");
  }

  function getSelectedModule() {
    if (!state.parsed) {
      return null;
    }
    return state.parsed.modules.find((module) => module.id === state.selectedModuleId) || null;
  }

  function getSelectedModules() {
    if (!state.parsed) {
      return [];
    }
    return state.parsed.modules.filter((module) => state.selectedModuleIds.has(module.id));
  }

  function getSelectedSession() {
    const module = getSelectedModule();
    if (!module) {
      return null;
    }
    return module.sessions.find((session) => session.id === state.selectedSessionId) || null;
  }

  function setAllModulesSelected(selected) {
    if (!state.parsed) {
      return;
    }
    state.selectedModuleIds = new Set(selected ? state.parsed.modules.map((module) => module.id) : []);
    render();
  }

  async function generateZip() {
    if (!state.parsed) {
      return;
    }
    if (!window.JSZip) {
      setStatus("Biblioteca ZIP indisponível. Verifique a conexão e recarregue a página.");
      return;
    }

    const selectedModules = getSelectedModules().filter((module) => module.sessions.length > 0);
    if (!selectedModules.length) {
      setStatus("Selecione pelo menos um módulo");
      return;
    }

    dom.generateZipBtn.disabled = true;
    setStatus("Gerando ZIP...");

    try {
      const zip = new window.JSZip();
      const settings = state.parsed.settings;
      zip.file("LEIA-ME.txt", buildReadme(selectedModules, settings));
      for (const file of createSessionFiles(selectedModules, settings)) zip.file(file.path, file.content);
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `sessoes_moodle_${dateStamp()}.zip`);
      setStatus("ZIP de sessões gerado");
    } catch (error) {
      console.error(error);
      setStatus("Erro ao gerar ZIP");
    } finally {
      dom.generateZipBtn.disabled = false;
    }
  }

  function downloadSelectedSessionCsv() {
    const session = getSelectedSession();
    if (!session || !state.parsed) {
      return;
    }
    downloadBlob(
      new Blob([makeAttendanceCsv(session, state.parsed.settings)], { type: "text/csv;charset=utf-8" }),
      session.fileName
    );
  }

  async function downloadSelectedSessionPdf() {
    const module = getSelectedModule();
    const session = getSelectedSession();
    if (!module || !session || !state.parsed) {
      setStatus("Selecione uma aula");
      return;
    }

    const jsPdf = window.jspdf && window.jspdf.jsPDF;
    if (!jsPdf) {
      setStatus("Biblioteca PDF não carregada");
      return;
    }

    const doc = new jsPdf({ orientation: "landscape", unit: "pt", format: "a4" });
    if (typeof doc.autoTable !== "function") {
      setStatus("Biblioteca de tabela PDF não carregada");
      return;
    }

    dom.downloadSessionPdfBtn.disabled = true;
    setStatus("Gerando PDF da aula...");
    await nextFrame();

    try {
      addSessionPreviewPdf(doc, module, session);
      addPdfPageNumbers(doc);
      doc.save(`${session.fileName.replace(/\.csv$/i, "")}_previa.pdf`);
      setStatus("PDF da aula gerado");
    } catch (error) {
      console.error(error);
      setStatus("Erro ao gerar PDF da aula");
    } finally {
      render();
    }
  }

  async function downloadSelectedModulePdf() {
    const module = getSelectedModule();
    if (!module || !state.parsed) {
      setStatus("Selecione um módulo");
      return;
    }

    await downloadModulesPreviewPdf(
      [module],
      `${slugify(module.title) || "modulo"}_previa_sessoes_${dateStamp()}.pdf`,
      "Gerando PDF do módulo..."
    );
  }

  async function downloadSelectedModulesPdf() {
    const modules = getSelectedModules();
    if (!modules.length || !state.parsed) {
      setStatus("Selecione pelo menos um módulo");
      return;
    }

    await downloadModulesPreviewPdf(
      modules,
      `previa_sessoes_modulos_selecionados_${dateStamp()}.pdf`,
      "Gerando PDF dos módulos selecionados..."
    );
  }

  async function downloadModulesPreviewPdf(modules, fileName, statusMessage) {
    const jsPdf = window.jspdf && window.jspdf.jsPDF;
    if (!jsPdf) {
      setStatus("Biblioteca PDF não carregada");
      return;
    }

    const doc = new jsPdf({ orientation: "landscape", unit: "pt", format: "a4" });
    if (typeof doc.autoTable !== "function") {
      setStatus("Biblioteca de tabela PDF não carregada");
      return;
    }

    dom.downloadModulePdfBtn.disabled = true;
    dom.exportSelectedPdfBtn.disabled = true;
    setStatus(statusMessage);
    await nextFrame();

    try {
      let hasPage = false;
      modules.forEach((module) => {
        module.sessions.forEach((session) => {
          if (hasPage) {
            doc.addPage();
          }
          addSessionPreviewPdf(doc, module, session);
          hasPage = true;
        });
      });

      if (!hasPage) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("Nenhuma sessão encontrada", 32, 40);
      }

      addPdfPageNumbers(doc);
      doc.save(fileName);
      setStatus("PDF gerado");
    } catch (error) {
      console.error(error);
      setStatus("Erro ao gerar PDF");
    } finally {
      render();
    }
  }

  async function downloadSelectedModuleReportPdf() {
    const module = getSelectedModule();
    if (!module || !state.parsed) {
      setStatus("Selecione um módulo");
      return;
    }

    await downloadModulesReportPdf(
      [module],
      `${slugify(module.title) || "modulo"}_relatorio_${dateStamp()}.pdf`,
      "Gerando relatório do módulo..."
    );
  }

  async function downloadSelectedModulesReportPdf() {
    const modules = getSelectedModules();
    if (!modules.length || !state.parsed) {
      setStatus("Selecione pelo menos um módulo");
      return;
    }

    await downloadModulesReportPdf(
      modules,
      `relatorio_modulos_selecionados_${dateStamp()}.pdf`,
      "Gerando relatório dos módulos selecionados..."
    );
  }

  async function downloadModulesReportPdf(modules, fileName, statusMessage) {
    const jsPdf = window.jspdf && window.jspdf.jsPDF;
    if (!jsPdf) {
      setStatus("Biblioteca PDF não carregada");
      return;
    }

    const doc = new jsPdf({ orientation: "landscape", unit: "pt", format: "a4" });
    if (typeof doc.autoTable !== "function") {
      setStatus("Biblioteca de tabela PDF não carregada");
      return;
    }

    dom.downloadModuleReportPdfBtn.disabled = true;
    dom.exportSelectedReportPdfBtn.disabled = true;
    setStatus(statusMessage);
    await nextFrame();

    try {
      let hasPage = false;
      const students = state.parsed.students;
      modules.forEach((module) => {
        if (hasPage) {
          doc.addPage();
        }
        addModuleReportPdf(doc, module, state.parsed.settings, students);
        hasPage = true;
      });

      if (!hasPage) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("Nenhum módulo encontrado", 32, 40);
      }

      addPdfPageNumbers(doc);
      doc.save(fileName);
      setStatus("PDF gerado");
    } catch (error) {
      console.error(error);
      setStatus("Erro ao gerar PDF");
    } finally {
      render();
    }
  }

  function addModuleReportPdf(doc, module, settings, students) {
    const marginY = 80;

    const sessionHeaders = module.sessions.map(s => {
      const dateParts = s.dateDisplay.split("/");
      const dateStr = dateParts.length >= 2 ? `${dateParts[0]}/${dateParts[1]}` : s.dateDisplay;
      return `${dateStr}\nAula ${s.lesson || ""}`.trim();
    });

    const head = [
      ["Nome", "Matrícula", "Admissão", "Desligamento", ...sessionHeaders, "P", "F", "Freq.", "Situação / observação"]
    ];

    const body = students.map((student) => {
      let pCount = 0;
      let fCount = 0;

      const sessionCells = module.sessions.map((session) => {
        const record = session.records.find(r => r.name === student.name && r.registration === student.registration);
        if (!record) {
          return "-";
        }

        let cellText = "-";
        if (record.kind === "present" || record.kind === "late") { cellText = "P"; pCount++; }
        else if (record.kind === "absent") { cellText = "F"; fCount++; }
        else if (record.kind === "special") { cellText = "AD"; pCount++; }

        return cellText;
      });

      const total = pCount + fCount;
      const freq = total > 0 ? Math.round((pCount / total) * 100) + "%" : "-";

      return [
        student.name,
        student.registration || "-",
        student.admission || "-",
        student.leave || "-",
        ...sessionCells,
        pCount.toString(),
        fCount.toString(),
        freq,
        student.observation || "-",
      ];
    });

    doc.autoTable({
      head,
      body,
      startY: marginY,
      margin: { top: marginY, right: 20, bottom: 30, left: 20 },
      rowPageBreak: "avoid",
      styles: {
        font: "helvetica",
        fontSize: 6,
        cellPadding: 2,
        overflow: "linebreak",
        valign: "middle",
        lineColor: [217, 226, 236],
        lineWidth: 0.5,
        textColor: [19, 34, 56],
      },
      headStyles: {
        fillColor: [25, 48, 77],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: {
        0: { cellWidth: 100, halign: "left" },
        1: { cellWidth: 45, halign: "center" },
        2: { cellWidth: 45, halign: "center" },
        3: { cellWidth: 45, halign: "center" },
        [4 + module.sessions.length]: { cellWidth: 15, halign: "center" },
        [4 + module.sessions.length + 1]: { cellWidth: 15, halign: "center" },
        [4 + module.sessions.length + 2]: { cellWidth: 25, halign: "center" },
      },
      didParseCell(data) {
        if (data.section === "body" && data.column.index >= 4 && data.column.index < 4 + module.sessions.length) {
            data.cell.styles.halign = "center";
            const val = data.cell.raw;
            if (val === "P") { data.cell.styles.fillColor = [220, 245, 235]; data.cell.styles.textColor = [35, 116, 85]; }
            else if (val === "F") { data.cell.styles.fillColor = [255, 235, 235]; data.cell.styles.textColor = [179, 59, 50]; }
            else if (val === "AD") { data.cell.styles.fillColor = [235, 235, 255]; data.cell.styles.textColor = [94, 106, 210]; }
        }
      },
      didDrawPage() {
        const width = doc.internal.pageSize.getWidth();
        doc.setFillColor(25, 48, 77);
        doc.rect(0, 0, width, 70, "F");

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("PROCURADORIA GERAL DO ESTADO", width / 2, 20, { align: "center" });
        const groupText = settings.groupName || settings.courseShortname ? ` | ${settings.groupName || settings.courseShortname}` : "";
        doc.text(`ESCOLA SUPERIOR DE ADVOCACIA PÚBLICA - ESAP${groupText}`, width / 2, 32, { align: "center" });

        doc.setFontSize(9);
        doc.text(module.title, width / 2, 45, { align: "center", maxWidth: width - 40 });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.text("P = Presença (0) | F = Falta (1) | AD = Aproveitamento de disciplina | - = Sem registro", width / 2, 58, { align: "center" });
      },
    });
  }

  function addSelectedModulesPdfToZip(zip, modules) {
    const jsPdf = window.jspdf && window.jspdf.jsPDF;
    if (!jsPdf) {
      return null;
    }

    const doc = new jsPdf({ orientation: "landscape", unit: "pt", format: "a4" });
    if (typeof doc.autoTable !== "function") {
      return null;
    }

    let hasPage = false;
    modules.forEach((module) => {
      module.sessions.forEach((session) => {
        if (hasPage) {
          doc.addPage();
        }
        addSessionPreviewPdf(doc, module, session);
        hasPage = true;
      });
    });

    if (!hasPage) {
      return null;
    }

    addPdfPageNumbers(doc);
    zip.file("previa_sessoes_modulos_selecionados.pdf", doc.output("blob"));
    return true;
  }

  function addSessionPreviewPdf(doc, module, session) {
    const topMargin = 118;
    const records = session.records || [];
    const body = records.length
      ? records.map((record) => [
          record.identifier,
          record.status,
          [record.name, record.registration].filter(Boolean).join("\n"),
          record.remarks,
        ])
      : [["", "", "Sem registros para esta sessão", ""]];

    doc.autoTable({
      head: [["ID", "Status", "Nome", "Observação"]],
      body,
      startY: topMargin,
      margin: { top: topMargin, right: 32, bottom: 36, left: 32 },
      rowPageBreak: "avoid",
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        cellPadding: 5,
        overflow: "linebreak",
        valign: "top",
        lineColor: [230, 237, 243],
        lineWidth: 0.5,
        textColor: [19, 34, 56],
      },
      headStyles: {
        fillColor: [248, 251, 253],
        textColor: [49, 66, 85],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 96 },
        1: { cellWidth: 58, halign: "center", fontStyle: "bold" },
        2: { cellWidth: 210 },
        3: { cellWidth: "auto" },
      },
      didParseCell(data) {
        if (data.section !== "body" || data.column.index !== 1 || !records[data.row.index]) {
          return;
        }
        data.cell.styles.fillColor = statusPdfColor(records[data.row.index].kind);
        data.cell.styles.textColor = [255, 255, 255];
      },
      didDrawPage() {
        drawSessionPdfHeader(doc, module, session);
      },
    });
  }

  function drawSessionPdfHeader(doc, module, session) {
    const marginX = 32;
    const width = doc.internal.pageSize.getWidth();

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, width, 108, "F");
    doc.setTextColor(19, 34, 56);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Prévia de presença", marginX, 30);

    doc.setFontSize(11);
    doc.text(module.title, marginX, 50, { maxWidth: width - marginX * 2 - 180 });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(96, 112, 134);
    doc.text(`${session.dateDisplay} | ${session.from} - ${session.to} | ${session.lesson}`, marginX, 68);
    doc.text(sessionDescription(module, session), marginX, 84, { maxWidth: width - marginX * 2 - 220 });

    doc.setTextColor(19, 34, 56);
    doc.text(
      `Registros ${session.stats.records}   Pr ${session.stats.present}   At ${session.stats.late}   Di ${session.stats.special}   Au ${session.stats.absent}`,
      width - marginX,
      68,
      { align: "right" }
    );
    doc.setTextColor(96, 112, 134);
    doc.text(session.fileName, width - marginX, 84, { align: "right" });

    doc.setDrawColor(217, 226, 236);
    doc.line(marginX, 100, width - marginX, 100);
  }

  function addPdfPageNumbers(doc) {
    const totalPages = doc.internal.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(96, 112, 134);
      doc.text(
        `Página ${page} de ${totalPages}`,
        doc.internal.pageSize.getWidth() - 32,
        doc.internal.pageSize.getHeight() - 16,
        { align: "right" }
      );
    }
  }

  function statusPdfColor(kind) {
    if (kind === "present") {
      return [35, 116, 85];
    }
    if (kind === "absent") {
      return [179, 59, 50];
    }
    if (kind === "late") {
      return [94, 106, 210];
    }
    return [165, 106, 18];
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function makeAttendanceCsv(session, settings) {
    const identifierHeader = settings.identifierField;
    const rows = [[
      identifierHeader,
      "status",
      "Nome",
      "Sobrenome",
      "remarks"
    ]];
    session.records.forEach((record) => {
      rows.push([
        record.identifier,
        record.status,
        firstName(record.name),
        lastName(record.name),
        record.remarks
      ]);
    });
    return withBom(toCsv(rows, settings.delimiter));
  }

  function makeModuleSummaryCsv(module, settings) {
    const rows = [["data", "tempo", "tipo", "descricao", "arquivo", "registros", "presentes", "atrasos", "ausentes", "dispensas", "ignorados"]];
    module.sessions.forEach((session) => {
      rows.push([
        session.dateDisplay,
        `${session.from} - ${session.to}`,
        sessionTypeLabel(settings),
        sessionDescription(module, session),
        session.fileName,
        session.stats.records,
        session.stats.present,
        session.stats.late,
        session.stats.absent,
        session.stats.special,
        session.stats.skipped,
      ]);
    });
    return withBom(toCsv(rows, settings.delimiter));
  }

  function sessionTypeLabel(settings) {
    return settings.groupName ? `Grupo: ${settings.groupName}` : "Todos os estudantes";
  }

  function firstName(fullName) {
    const parts = cleanCell(fullName).split(" ").filter(Boolean);
    return parts[0] || "";
  }

  function lastName(fullName) {
    const parts = cleanCell(fullName).split(" ").filter(Boolean);
    return parts.slice(1).join(" ");
  }

  function makeRemarksCsv(module, settings) {
    const rows = [["data", "aula", settings.identifierField, "nome", "matricula", "status", "remarks"]];
    module.sessions.forEach((session) => {
      session.records
        .filter((record) => record.remarks)
        .forEach((record) => {
          rows.push([
            session.dateDisplay,
            session.lesson,
            record.identifier,
            record.name,
            record.registration,
            record.status,
            record.remarks,
          ]);
        });
    });
    return withBom(toCsv(rows, settings.delimiter));
  }

  function buildReadme(modules, settings) {
    return [
      "CRIAÇÃO DE SESSÕES NO MOODLE",
      "",
      "Este ZIP contém somente os CSVs para criar sessões de presença.",
      "Cada pasta corresponde a um módulo selecionado.",
      "",
      "No Moodle, abra Presença > Adicionar sessão > Upload sessions.",
      "Envie o arquivo IMPORTAR_SESSOES_NO_MOODLE.csv da pasta desejada.",
      `Separador: ${settings.delimiter === "," ? "vírgula" : "ponto e vírgula"}; codificação: UTF-8.`,
      "Data no CSV: AAAA-MM-DD.",
      settings.courseShortname ? `Curso incluído: ${settings.courseShortname}.` : "Selecione o curso no Moodle antes do upload.",
      "",
      "Módulos:",
      ...modules.map((module) => `- ${module.title}: ${module.sessions.length} sessões`),
      "",
    ].join("\r\n");
  }

  function downloadBlob(blobOrText, fileName) {
    const blob =
      blobOrText instanceof Blob
        ? blobOrText
        : new Blob([blobOrText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function getCell(rows, rowNumber, columnNumber) {
    const row = rows[rowNumber - 1] || [];
    return row[columnNumber - 1];
  }

  function createStats() {
    return {
      explicit: 0,
      records: 0,
      present: 0,
      late: 0,
      absent: 0,
      special: 0,
      skipped: 0,
    };
  }

  function addStats(target, source) {
    Object.keys(target).forEach((key) => {
      target[key] += source[key] || 0;
    });
  }

  function sum(items, getter) {
    return items.reduce((total, item) => total + getter(item), 0);
  }

  function uniqueMessages(messages) {
    return [...new Set(messages.filter(Boolean))];
  }

  function slugify(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  function dateStamp() {
    const now = new Date();
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function setStatus(message) {
    dom.statusText.textContent = message;
  }
})();
