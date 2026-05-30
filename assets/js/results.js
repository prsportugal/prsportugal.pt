import { refreshGoogleTranslate } from "./translate.js";

const config = window.PRS_CONFIG || {};
const locale = config.locale || "pt-PT";
const RESULTS_PREFIX = "resultados_";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const cleaned = raw
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  if (!cleaned || cleaned === "-" || cleaned === ".") {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function readCellRaw(cell) {
  if (!cell) {
    return "";
  }

  if (cell.v == null) {
    return "";
  }

  return cell.v;
}

function readCellDisplay(cell) {
  if (!cell) {
    return "";
  }

  if (typeof cell.f === "string" && cell.f.trim().length > 0) {
    return cell.f.trim();
  }

  if (cell.v == null) {
    return "";
  }

  return String(cell.v).trim();
}

function parseYearFromSheetName(name) {
  const match = String(name).match(/resultados_(\d{4})$/i);
  return match ? Number(match[1]) : null;
}

function isFinalColumn(header) {
  return normalizeHeader(header) === "final";
}

function isUltimateColumn(header) {
  const n = normalizeHeader(header);
  return n.includes("ultimate") || n.includes("finale");
}

function isMatchColumn(header) {
  const n = normalizeHeader(header);
  return n.includes("prova") || isUltimateColumn(header);
}

function parseResultsTable(payload, sheetName) {
  const cols = payload?.table?.cols || [];
  const rows = payload?.table?.rows || [];

  if (cols.length < 2 || rows.length === 0) {
    return null;
  }

  const headers = cols.map((col, idx) => {
    const label = String(col?.label || "").trim();
    return label || `COL_${idx + 1}`;
  });

  const shooterIndex = headers.findIndex((h) => normalizeHeader(h) === "atirador");
  const nameIndex = shooterIndex >= 0 ? shooterIndex : 0;
  const finalIndex = headers.findIndex((h) => isFinalColumn(h));
  const ultimateIndex = headers.findIndex((h) => isUltimateColumn(h));

  // Prevent accepting fallback sheets (e.g. "competicoes") when resultados_{ano} does not exist.
  if (shooterIndex < 0 || finalIndex < 0) {
    return null;
  }

  const hasAnyMatchColumn = headers.some((h, idx) => idx !== shooterIndex && idx !== finalIndex && isMatchColumn(h));
  if (!hasAnyMatchColumn) {
    return null;
  }

  const parsedRows = rows
    .map((row) => {
      const cells = row.c || [];
      const shooter = readCellDisplay(cells[nameIndex]);
      if (!shooter) {
        return null;
      }

      const values = headers.map((_, idx) => {
        const cell = cells[idx];
        const rawValue = readCellRaw(cell);
        const displayValue = readCellDisplay(cell);
        const numericValue = parseNumber(rawValue ?? displayValue);
        return { displayValue, numericValue };
      });

      return {
        shooter,
        values,
        finalScore: finalIndex >= 0 ? values[finalIndex].numericValue ?? 0 : 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.finalScore - a.finalScore || a.shooter.localeCompare(b.shooter, locale));

  if (parsedRows.length === 0) {
    return null;
  }

  const visibleColumns = headers.map((header, idx) => {
    if (idx === nameIndex) {
      return true;
    }

    if (idx === finalIndex) {
      return true;
    }

    return parsedRows.some((entry) => entry.values[idx]?.numericValue != null && entry.values[idx].numericValue > 0);
  });

  const hasUltimatePoints =
    ultimateIndex >= 0 &&
    parsedRows.some((entry) => (entry.values[ultimateIndex]?.numericValue ?? 0) > 0);

  const year = parseYearFromSheetName(sheetName);

  return {
    sheetName,
    year,
    headers,
    nameIndex,
    finalIndex,
    visibleColumns,
    rows: parsedRows,
    isProvisional: ultimateIndex >= 0 && !hasUltimatePoints
  };
}

async function fetchResultsSheet(spreadsheetId, sheetName) {
  const endpoint =
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?` +
    `sheet=${encodeURIComponent(sheetName)}&tqx=out:json`;

  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${sheetName}`);
  }

  const rawText = await response.text();
  const jsonText = rawText
    .replace(/^\/\*O_o\*\/\s*google\.visualization\.Query\.setResponse\(/, "")
    .replace(/\);\s*$/, "");

  const payload = JSON.parse(jsonText);

  if (payload?.status && payload.status !== "ok") {
    const detail = payload?.errors?.[0]?.detailed_message || payload?.errors?.[0]?.reason || "Resposta inválida do Google Sheets.";
    throw new Error(detail);
  }

  return payload;
}

async function discoverAnnualResults(spreadsheetId) {
  const nowYear = new Date().getFullYear();
  const yearsToProbe = Array.from({ length: 35 }, (_, i) => nowYear + 1 - i);

  const found = await Promise.all(
    yearsToProbe.map(async (year) => {
      const sheetName = `${RESULTS_PREFIX}${year}`;
      try {
        const payload = await fetchResultsSheet(spreadsheetId, sheetName);
        return parseResultsTable(payload, sheetName);
      } catch (_error) {
        return null;
      }
    })
  );

  return found.filter(Boolean).sort((a, b) => (b.year || 0) - (a.year || 0));
}

function formatPointsCell(valueObj, columnHasPoints) {
  const display = valueObj?.displayValue || "";
  const numeric = valueObj?.numericValue;

  if (numeric != null) {
    return `<td>${escapeHtml(display || String(numeric))}</td>`;
  }

  if (columnHasPoints) {
    return '<td class="is-absent">-</td>';
  }

  return "<td></td>";
}

function renderResultsTable(host, results) {
  const visibleIndexes = results.headers
    .map((_, idx) => idx)
    .filter((idx) => results.visibleColumns[idx]);

  const headCells = ["<th>Pos.</th>", "<th>Atirador</th>"];
  visibleIndexes.forEach((idx) => {
    if (idx === results.nameIndex) {
      return;
    }
    headCells.push(`<th>${escapeHtml(results.headers[idx])}</th>`);
  });

  const bodyRows = results.rows
    .map((entry, rowIndex) => {
      const rowCells = [`<td>${rowIndex + 1}</td>`, `<td>${escapeHtml(entry.shooter)}</td>`];

      visibleIndexes.forEach((idx) => {
        if (idx === results.nameIndex) {
          return;
        }

        const columnHasPoints = results.rows.some((r) => (r.values[idx]?.numericValue ?? 0) > 0);
        rowCells.push(formatPointsCell(entry.values[idx], columnHasPoints));
      });

      return `<tr>${rowCells.join("")}</tr>`;
    })
    .join("");

  host.innerHTML = `
    <thead>
      <tr>${headCells.join("")}</tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
  `;
}

export async function initAnnualResultsUi() {
  const picker = document.getElementById("results-year-select");
  const status = document.getElementById("results-status");
  const table = document.getElementById("results-table");
  const empty = document.getElementById("results-empty");

  if (!picker || !status || !table || !empty) {
    return;
  }

  const spreadsheetId = config.countdownSheet?.spreadsheetId;
  if (!spreadsheetId) {
    empty.hidden = false;
    status.textContent = "Falta configurar o ID da folha de cálculo.";
    return;
  }

  const resultsByYear = await discoverAnnualResults(spreadsheetId);
  if (resultsByYear.length === 0) {
    empty.hidden = false;
    status.textContent = "Sem resultados anuais publicados.";
    return;
  }

  resultsByYear.forEach((entry, index) => {
    const option = document.createElement("option");
    option.value = String(entry.year || entry.sheetName);
    option.textContent = String(entry.year || entry.sheetName);
    if (index === 0) {
      option.selected = true;
    }
    picker.appendChild(option);
  });

  const renderYear = (yearValue) => {
    const selected = resultsByYear.find((entry) => String(entry.year || entry.sheetName) === String(yearValue)) || resultsByYear[0];

    renderResultsTable(table, selected);
    table.hidden = false;
    empty.hidden = true;
    status.textContent = selected.isProvisional
      ? "Classificação provisória (época em progresso)."
      : "Classificação final da época.";
    refreshGoogleTranslate({ delay: 500 });
  };

  picker.addEventListener("change", () => {
    renderYear(picker.value);
  });

  renderYear(picker.value);
}
