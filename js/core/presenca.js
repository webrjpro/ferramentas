/* Regras puras, independentes da interface. */
(function (root) {
  "use strict";

  function toCsv(rows, delimiter) {
    return rows.map((row) => row.map((value) => csvEscape(value, delimiter)).join(delimiter)).join("\r\n");
  }

  function csvEscape(value, delimiter) {
    const text = value === null || value === undefined ? "" : String(value);
    const mustQuote = text.includes(delimiter) || text.includes('"') || /[\r\n]/.test(text);
    const escaped = text.replace(/"/g, '""');
    return mustQuote ? `"${escaped}"` : escaped;
  }

  function withBom(text) {
    return `\uFEFF${text}`;
  }

  const MS_DAY = 24 * 60 * 60 * 1000;

  function parseSessionHeader(header) {
    const title = header.replace(/\s+/g, " ").trim();
    const matches = [...title.matchAll(/\b(\d{1,2})[/.:-](\d{1,2})(?:[/.:-](\d{2,4}))?\b/g)];
    if (!matches.length) {
      return null;
    }

    const startsWithDate = /^\s*\d{1,2}\s*[/.:-]\s*\d{1,2}/.test(title);
    const dateMatch = startsWithDate ? matches[0] : matches[matches.length - 1];
    const day = Number.parseInt(dateMatch[1], 10);
    const month = Number.parseInt(dateMatch[2], 10);
    const rawYear = dateMatch[3] ? Number.parseInt(dateMatch[3], 10) : null;
    const year = rawYear ? (rawYear < 100 ? 2000 + rawYear : rawYear) : null;
    const aulaMatch = title.match(/aula\s*0*(\d+)/i);
    const isReplacement = /reposi|remarca/i.test(title);
    let lesson = aulaMatch ? `Aula ${Number.parseInt(aulaMatch[1], 10)}` : title;

    if (!aulaMatch && isReplacement) {
      lesson = "Reposição";
    } else if (aulaMatch && isReplacement) {
      lesson = `${lesson} - reposição`;
    }

    if (!day || !month || day > 31 || month > 12) {
      return null;
    }

    return { title, lesson, day, month, year };
  }

  function chooseDate(day, month, explicitYear, previous, initialYear) {
    if (explicitYear) {
      return makeUtcDate(explicitYear, month, day);
    }
    if (!previous) {
      return makeUtcDate(initialYear, month, day);
    }

    const baseYear = previous.getUTCFullYear();
    const candidates = [];
    for (let year = baseYear - 1; year <= baseYear + 2; year += 1) {
      candidates.push(makeUtcDate(year, month, day));
    }
    candidates.push(makeUtcDate(initialYear, month, day));
    candidates.push(makeUtcDate(initialYear + 1, month, day));
    candidates.push(makeUtcDate(initialYear + 2, month, day));

    return candidates
      .filter((date, index, list) => list.findIndex((item) => item.getTime() === date.getTime()) === index)
      .map((date) => {
        const delta = (date.getTime() - previous.getTime()) / MS_DAY;
        let score = Math.abs(delta);
        if (delta < -50) {
          score += 420;
        }
        if (delta > 220) {
          score += 90;
        }
        return { date, score };
      })
      .sort((a, b) => a.score - b.score)[0].date;
  }

  function interpretStatus(value, settings) {
    if (isBlankCell(value)) {
      if (settings.blankAsPresent) {
        return { kind: "present", status: settings.presentStatus, remark: "" };
      }
      return { kind: "blank" };
    }

    if (typeof value === "number") {
      if (value === 0) {
        return { kind: "present", status: settings.presentStatus, remark: "" };
      }
      if (value === 1) {
        return { kind: "absent", status: settings.absentStatus, remark: "" };
      }
    }

    const text = cleanCell(value);
    const normalized = normalizeText(text);

    if (normalized === "0") {
      return { kind: "present", status: settings.presentStatus, remark: "" };
    }
    if (normalized === "1" || normalized === "1.") {
      return { kind: "absent", status: settings.absentStatus, remark: "" };
    }
    if (normalized === "2" || normalized === "AT" || normalized.includes("ATRAS")) {
      return { kind: "late", status: settings.lateStatus, remark: normalized.includes("ATRAS") ? text : "" };
    }
    if (normalized === "DI" || normalized.includes("DISPENSA")) {
      return { kind: "special", status: settings.specialStatus, remark: text };
    }

    if (settings.specialAsExcused && text) {
      return {
        kind: "special",
        status: settings.specialStatus,
        remark: text.replace(/\s+/g, " ").trim(),
      };
    }

    return { kind: "unknown" };
  }

  function isBlankCell(value) {
    return value === null || value === undefined || cleanCell(value) === "";
  }

  function cleanCell(value, keepLineBreaks = false) {
    if (value === null || value === undefined) {
      return "";
    }
    if (value instanceof Date) {
      return formatBrDate(value);
    }
    const text = String(value).replace(/\u00a0/g, " ");
    return keepLineBreaks
      ? text.replace(/[ \t]+/g, " ").trim()
      : text.replace(/\s+/g, " ").trim();
  }

  function normalizeText(value) {
    return cleanCell(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim();
  }

  function normalizeKey(value) {
    return normalizeText(value).replace(/\s+/g, " ");
  }

  function makeUtcDate(year, month, day) {
    return new Date(Date.UTC(year, month - 1, day));
  }

  function formatIsoDate(date) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }

  function formatBrDate(date) {
    if (!(date instanceof Date)) {
      return "";
    }
    return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
  }

  // Data ISO evita ambiguidade entre dia e mês no upload de sessões.
  function formatSessionDate(date, settings) {
    if (!(date instanceof Date)) {
      return "";
    }
    const dd = pad(date.getUTCDate());
    const mm = pad(date.getUTCMonth() + 1);
    const yyyy = date.getUTCFullYear();
    // YYYY-MM-DD (ISO 8601): Aceito universalmente pelo strtotime do PHP no Moodle
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatMoodleSessionDate(date) {
    if (!(date instanceof Date)) {
      return "";
    }
    return `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function timeToMinutes(time) {
    const [hours, minutes] = time.split(":").map((part) => Number.parseInt(part, 10));
    return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
  }

  function minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${pad(hours)}:${pad(mins)}`;
  }

  function makeSessionsCsv(module, settings, includeCourse) {
    const baseHeaders = [
      "groups",
      "sessiondate",
      "from",
      "to",
      "description",
      "studentscanmark",
      "calendarevent",
    ];
    const headers = includeCourse ? ["course", ...baseHeaders] : baseHeaders;
    const rows = [headers];

    module.sessions.forEach((session) => {
      const sessionDateStr = formatSessionDate(session.date, settings);
      const row = [
        settings.groupName,
        sessionDateStr,
        session.from,
        session.to,
        sessionDescription(module, session),
        "0",
        "1",
      ];
      rows.push(includeCourse ? [settings.courseShortname, ...row] : row);
    });

    return withBom(toCsv(rows, settings.delimiter));
  }

  function sessionDescription(module, session) {
    return `${module.title} - ${session.lesson} - ${session.dateDisplay}`;
  }

  function sanitizeFileName(value) {
    const cleaned = cleanCell(value)
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned || "modulo";
  }

  function createSessionFiles(modules, settings) {
    const files = [];
    modules.forEach((module, index) => {
      const folder = `${String(index + 1).padStart(2, "0")}_${sanitizeFileName(module.title)}`;
      files.push({
        path: `${folder}/IMPORTAR_SESSOES_NO_MOODLE.csv`,
        content: makeSessionsCsv(module, settings, Boolean(settings.courseShortname)),
      });
    });
    return files;
  }

  const api = Object.freeze({ toCsv, csvEscape, withBom, makeSessionsCsv, sessionDescription, sanitizeFileName, createSessionFiles, parseSessionHeader, chooseDate, interpretStatus, isBlankCell, cleanCell, normalizeText, normalizeKey, makeUtcDate, formatIsoDate, formatBrDate, formatSessionDate, formatMoodleSessionDate, pad, timeToMinutes, minutesToTime });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FerramentasCore = root.FerramentasCore || {};
  root.FerramentasCore.presenca = api;
})(typeof window !== "undefined" ? window : globalThis);
