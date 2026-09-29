/* Regras puras do CSV Moodle. Sem DOM, arquivos ou dependências externas. */
(function (root) {
  "use strict";

  const FIELDS = [
    {
      key: "matricula_esap",
      label: "Matricula ESAP",
      required: true,
      outputs: ["username"],
      aliases: ["matricula esap", "matricula", "registro academico", "ra", "username"],
    },
    {
      key: "nome_completo",
      label: "Nome completo",
      required: true,
      outputs: ["firstname", "lastname"],
      aliases: ["nome completo", "nome do aluno", "aluno", "nome_completo", "nome"],
    },
    {
      key: "turma",
      label: "Turma",
      required: true,
      outputs: ["cohort1"],
      aliases: ["turma", "classe", "coorte", "cohort", "cohort1"],
    },
    {
      key: "email",
      label: "E-mail",
      outputs: ["email"],
      aliases: ["email", "e mail", "correio eletronico"],
    },
    {
      key: "cpf",
      label: "CPF",
      outputs: ["profile_field_CPF"],
      aliases: ["cpf", "cadastro pessoa fisica"],
    },
    {
      key: "sexo",
      label: "Sexo",
      outputs: ["profile_field_genero"],
      aliases: ["sexo", "genero", "gênero"],
    },
    {
      key: "nomepai",
      label: "Nome do pai",
      outputs: ["profile_field_Pai"],
      aliases: ["nome do pai", "nome pai", "filiacao pai", "nomepai"],
    },
    {
      key: "nomemae",
      label: "Nome da mae",
      outputs: ["profile_field_Mae"],
      aliases: ["nome da mae", "nome mae", "filiacao mae", "nomemae"],
    },
    {
      key: "dtnasc",
      label: "Data de nascimento",
      outputs: ["profile_field_Data"],
      aliases: ["data de nascimento", "data nascimento", "nascimento", "dtnasc"],
    },
    {
      key: "celular",
      label: "Celular",
      outputs: ["profile_field_Telefone"],
      aliases: ["celular", "telefone celular", "telefone", "whatsapp"],
    },
    {
      key: "docidentif",
      label: "Documento de identificacao",
      outputs: ["profile_field_RegistroCivil"],
      aliases: ["documento de identificacao", "documento identificacao", "doc de identificacao", "doc identificacao", "registro civil", "registro geral", "identidade", "rg", "docidentif"],
    },
    {
      key: "orgexpident",
      label: "Orgao expedidor",
      outputs: ["profile_field_OrgaoEmissor"],
      aliases: ["orgao expedidor", "orgao emissor", "org expedidor", "orgexpident"],
    },
    {
      key: "dataexpedicao",
      label: "Data de expedicao",
      outputs: ["profile_field_DataExpedicao"],
      aliases: ["data de expedicao", "data expedicao", "data emissao", "dataexpedicao"],
    },
    {
      key: "endereco",
      label: "Endereco",
      outputs: ["profile_field_EnderecoResidencial"],
      aliases: ["endereco residencial", "endereco", "logradouro"],
    },
    {
      key: "bairro",
      label: "Bairro",
      outputs: ["profile_field_Bairro"],
      aliases: ["bairro", "distrito"],
    },
    {
      key: "cidade",
      label: "Cidade",
      outputs: ["city"],
      aliases: ["cidade", "municipio", "city"],
    },
    {
      key: "uf",
      label: "UF",
      outputs: ["profile_field_Estado"],
      aliases: ["uf", "estado", "unidade federativa"],
    },
    {
      key: "cep",
      label: "CEP",
      outputs: ["profile_field_CEP"],
      aliases: ["cep", "codigo postal"],
    },
  ];
  // Ordem e nomes iguais aos do modelo, exceto pela coluna Password dispensada.
  const OUTPUT_FIELDS = [FIELDS[1], FIELDS[0], ...FIELDS.slice(2)];

  function normalize(value) {
    return String(value == null ? "" : value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[_./\\-]+/g, " ")
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function valueToString(value) {
    if (value == null) return "";
    return String(value).replace(/\u0000/g, "").trim();
  }

  function splitName(fullName) {
    const parts = fullName.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    return [parts.shift() || "", parts.join(" ")];
  }

  function formatDate(value) {
    const text = valueToString(value);
    if (!text) return "";
    const parts = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (parts) {
      const shortYear = Number(parts[3]);
      const year = parts[3].length === 2 ? String(shortYear >= 50 ? 1900 + shortYear : 2000 + shortYear) : parts[3];
      return validDate(year, parts[2], parts[1]);
    }
    const iso = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (iso) return validDate(iso[1], iso[2], iso[3]);
    throw new Error(`Data inválida ou não reconhecida: ${text}. Corrija a planilha.`);
  }

  function validDate(year, month, day) {
    const yyyy = Number(year);
    const mm = Number(month);
    const dd = Number(day);
    const date = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (date.getUTCFullYear() !== yyyy || date.getUTCMonth() + 1 !== mm || date.getUTCDate() !== dd) {
      throw new Error(`Data inválida: ${day}/${month}/${year}.`);
    }
    return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  function transformValue(key, value) {
    if (key === "sexo") {
      const normalized = normalize(value);
      if (normalized === "f" || normalized === "feminino") return "FEMININO";
      if (normalized === "m" || normalized === "masculino") return "MASCULINO";
    }
    if (key === "dtnasc" || key === "dataexpedicao") return formatDate(value);
    if (key === "uf") return valueToString(value).toUpperCase();
    if (key === "cep") {
      const text = valueToString(value);
      const digits = text.replace(/\D/g, "");
      return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : text;
    }
    return valueToString(value);
  }

  function escapeCsvCell(value, quoteDates) {
    const text = valueToString(value);
    return /[,;"\r\n]/.test(text) || (quoteDates && /^\d{4}-\d{2}-\d{2}$/.test(text))
      ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function matrixToCsv(matrix, quoteDates = false) {
    return matrix.map((row) => row.map((cell) => escapeCsvCell(cell, quoteDates)).join(";")).join("\n");
  }

  function trimMatrix(matrix) {
    const rows = matrix.map((row) => Array.isArray(row) ? row : []);
    while (rows.length && rows[rows.length - 1].every((cell) => valueToString(cell) === "")) rows.pop();
    return rows;
  }

  function allKnownAliases() {
    return FIELDS.flatMap((field) => field.aliases.map(normalize));
  }

  function detectHeaderRow(matrix) {
    const aliases = allKnownAliases();
    let bestIndex = 0;
    let bestScore = -1;
    const limit = Math.min(matrix.length, 20);

    for (let index = 0; index < limit; index += 1) {
      const normalizedCells = matrix[index].map(normalize).filter(Boolean);
      if (!normalizedCells.length) continue;
      const matches = normalizedCells.filter((cell) => aliases.some((alias) => cell === alias)).length;
      const uniqueCount = new Set(normalizedCells).size;
      const score = matches * 20 + uniqueCount;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function makeHeaders(row) {
    const seen = new Map();
    return row.map((value, index) => {
      const base = valueToString(value) || `Coluna ${index + 1}`;
      const key = normalize(base) || `coluna ${index + 1}`;
      const count = (seen.get(key) || 0) + 1;
      seen.set(key, count);
      return { label: count > 1 ? `${base} (${count})` : base, normalized: key, index };
    });
  }

  function scoreHeader(field, header) {
    let best = 0;
    for (const rawAlias of field.aliases) {
      const alias = normalize(rawAlias);
      if (header.normalized === alias) best = Math.max(best, 100);
      else if (alias.length >= 5 && header.normalized.includes(alias)) best = Math.max(best, 75 - Math.abs(header.normalized.length - alias.length));
      else if (header.normalized.length >= 5 && alias.includes(header.normalized)) best = Math.max(best, 60 - Math.abs(header.normalized.length - alias.length));
    }
    return best;
  }

  function suggestMapping(headers) {
    const mapping = new Map();
    const selectedFields = new Set();
    const usedColumns = new Set();
    for (const field of FIELDS) {
      let winner = -1;
      let winnerScore = 0;
      for (const header of headers) {
        if (usedColumns.has(header.index)) continue;
        const score = scoreHeader(field, header);
        if (score > winnerScore) {
          winner = header.index;
          winnerScore = score;
        }
      }
      const threshold = field.required ? 40 : 54;
      const mapped = winnerScore >= threshold ? winner : -1;
      mapping.set(field.key, mapped);
      if (!field.required && mapped >= 0) selectedFields.add(field.key);
      if (mapped >= 0) usedColumns.add(mapped);
    }
    return { mapping, selectedFields };
  }

  function convertRows(rows, mapping, selectedFields) {
    const outputFields = OUTPUT_FIELDS.filter((field) => field.required || selectedFields.has(field.key));
    const output = [outputFields.flatMap((field) => field.outputs)];
    let skipped = 0;
    for (const row of rows) {
      const get = (key) => {
        const index = mapping.get(key);
        return index >= 0 ? valueToString(row[index]) : "";
      };
      if (!get("matricula_esap") || !get("nome_completo") || !get("turma")) {
        skipped += 1;
        continue;
      }
      const converted = [];
      for (const field of outputFields) {
        const value = get(field.key);
        if (field.key === "nome_completo") converted.push(...splitName(value));
        else converted.push(transformValue(field.key, value));
      }
      output.push(converted);
    }
    return { matrix: output, skipped };
  }

  const api = Object.freeze({ FIELDS, OUTPUT_FIELDS, normalize, valueToString, formatDate, transformValue, matrixToCsv, convertRows, trimMatrix, detectHeaderRow, makeHeaders, suggestMapping });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FerramentasCore = root.FerramentasCore || {};
  root.FerramentasCore.conversor = api;
})(typeof window !== "undefined" ? window : globalThis);
