import ExcelJS from "exceljs";
import { parseRupiah } from "./number";

export type CellFinding = {
  cell: string;
  label: string;
  expected: string | number | null;
  actual: string | number | null;
  status: "benar" | "parsial" | "salah" | "kosong" | "tidak_dapat_divalidasi";
  points: number;
  maxPoints: number;
  explanation: string;
};

export type SheetResult = {
  sheet: string;
  found: number;
  total: number;
  score: number;
  weight: number;
  missing: { label: string; value: number }[];
  details: CellFinding[];
};

export type FileCheck = {
  score: number;
  sheets: SheetResult[];
  typed: { checked: number; missing: number[] };
  formulas: { count: number; withoutResult: number; exactMatches: number };
  notes: string[];
  method: "fixed-template-cell-by-cell";
};

const SPECS = [
  { key: "JU", aliases: ["ju", "jurnalumum"], weight: 30 },
  { key: "AJP", aliases: ["ajp", "ayatjurnalpenyesuaian", "jurnalpenyesuaian"], weight: 15 },
  { key: "LK", aliases: ["lk", "laporankeuangan"], weight: 35 },
  { key: "PPh Pasal 21", aliases: ["pphpasal21", "pph21", "pph"], weight: 20 },
];

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
const normFormula = (s: string) => s.replace(/^=/, "").replace(/\$/g, "").replace(/\s+/g, "").toUpperCase();
const absTolerance = 0;
const relativeTolerance = 0.000001; // 0.0001%; selisih Rp1 tidak otomatis dianggap benar

function findSheet(wb: ExcelJS.Workbook, aliases: string[]) {
  return wb.worksheets.find((ws) => aliases.includes(norm(ws.name)));
}

function formulaOf(value: ExcelJS.CellValue): string | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { formula?: unknown; sharedFormula?: unknown };
  if (typeof v.formula === "string") return v.formula;
  if (typeof v.sharedFormula === "string") return v.sharedFormula;
  return null;
}

function resultOf(value: ExcelJS.CellValue): unknown {
  if (!value || typeof value !== "object") return value;
  if ("result" in value) return (value as { result?: unknown }).result;
  if ("text" in value) return (value as { text?: unknown }).text;
  if ("richText" in value) {
    return (value as { richText?: { text: string }[] }).richText?.map((x) => x.text).join("") ?? "";
  }
  return null;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\s*(rp\.?\s*)?[-(]?\d[\d.,]*(?:\)?\s*)?$/i.test(trimmed)) {
      const parsed = parseRupiah(trimmed);
      return parsed !== null && Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

function display(value: unknown): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = numeric(value);
  if (n !== null) return n;
  if (typeof value === "string") return value.trim();
  return String(value);
}

function labelFor(ws: ExcelJS.Worksheet, row: number, col: number) {
  const parts: string[] = [];
  for (let c = 1; c <= Math.min(col - 1, ws.columnCount); c++) {
    const v = resultOf(ws.getCell(row, c).value);
    if (typeof v === "string" && v.trim()) parts.push(v.trim());
  }
  const label = parts.join(" — ");
  return label || `${ws.name} ${ws.getCell(row, col).address}`;
}

function formulaResult(value: ExcelJS.CellValue): number | null {
  const raw = resultOf(value);
  return numeric(raw);
}

function compareCell(
  sheet: string,
  address: string,
  expectedCell: ExcelJS.Cell,
  actualCell: ExcelJS.Cell,
  label: string,
  formulas: { count: number; withoutResult: number; exactMatches: number }
): CellFinding {
  const expectedFormula = formulaOf(expectedCell.value);
  const actualFormula = formulaOf(actualCell.value);
  const expectedRaw = resultOf(expectedCell.value);
  const actualRaw = resultOf(actualCell.value);
  const expectedNum = numeric(expectedRaw);
  const actualNum = numeric(actualRaw);
  const expectedDisplay = expectedFormula ? `=${expectedFormula}` : display(expectedRaw);
  const actualDisplay = actualFormula ? `=${actualFormula}` : display(actualRaw);

  if (actualCell.value === null || actualCell.value === undefined || actualCell.value === "") {
    return { cell: address, label, expected: expectedDisplay, actual: null, status: "kosong", points: 0, maxPoints: 1, explanation: "Sel jawaban wajib kosong." };
  }

  if (expectedFormula) {
    formulas.count++;
    if (actualFormula && normFormula(actualFormula) === normFormula(expectedFormula)) {
      const expectedValue = formulaResult(expectedCell.value);
      const actualValue = formulaResult(actualCell.value);
      if (actualValue === null) {
        formulas.withoutResult++;
        return { cell: address, label, expected: expectedDisplay, actual: actualDisplay, status: "tidak_dapat_divalidasi", points: 0, maxPoints: 1, explanation: "Rumus sama dengan kunci, tetapi hasil tersimpan tidak tersedia; file perlu dihitung ulang di Excel sebelum nilai penuh diberikan." };
      }
      if (expectedValue !== null) {
        const diff = Math.abs(expectedValue - actualValue);
        const tol = Math.max(absTolerance, Math.abs(expectedValue) * relativeTolerance);
        if (diff > tol) {
          return { cell: address, label, expected: expectedValue, actual: actualValue, status: "salah", points: 0, maxPoints: 1, explanation: "Rumus sama, tetapi hasil tersimpan berbeda dari kunci." };
        }
      }
      formulas.exactMatches++;
      return { cell: address, label, expected: expectedDisplay, actual: actualDisplay, status: "benar", points: 1, maxPoints: 1, explanation: "Rumus dan hasil tersimpan sesuai kunci." };
    }
    const expectedValue = formulaResult(expectedCell.value);
    const actualValue = actualFormula ? formulaResult(actualCell.value) : actualNum;
    if (actualFormula && actualValue === null) formulas.withoutResult++;
    if (expectedValue !== null && actualValue !== null) {
      const diff = Math.abs(expectedValue - actualValue);
      const tol = Math.max(absTolerance, Math.abs(expectedValue) * relativeTolerance);
      if (diff <= tol) {
        return { cell: address, label, expected: expectedValue, actual: actualValue, status: "parsial", points: actualFormula ? 0.8 : 0.7, maxPoints: 1, explanation: actualFormula ? "Hasil sesuai, tetapi rumus berbeda dari kunci." : "Hasil sesuai, tetapi jawaban berupa angka tanpa rumus sehingga proses tidak terbukti." };
      }
      const rel = Math.abs(expectedValue) > 0 ? diff / Math.abs(expectedValue) : diff;
      if (rel <= 0.01) {
        return { cell: address, label, expected: expectedValue, actual: actualValue, status: "parsial", points: 0.5, maxPoints: 1, explanation: "Hasil mendekati kunci; rumus atau hitungan perlu diperiksa." };
      }
      return { cell: address, label, expected: expectedValue, actual: actualValue, status: "salah", points: 0, maxPoints: 1, explanation: "Rumus/hasil berbeda dari kunci." };
    }
    return { cell: address, label, expected: expectedDisplay, actual: actualDisplay, status: "tidak_dapat_divalidasi", points: 0, maxPoints: 1, explanation: "Formula tidak identik dan hasil hitung tidak tersedia untuk dibandingkan." };
  }

  if (expectedNum !== null) {
    if (actualNum === null) {
      return { cell: address, label, expected: expectedNum, actual: actualDisplay, status: "salah", points: 0, maxPoints: 1, explanation: "Jawaban bukan angka yang dapat dibaca." };
    }
    const diff = Math.abs(expectedNum - actualNum);
    const tol = Math.max(absTolerance, Math.abs(expectedNum) * relativeTolerance);
    if (diff <= tol) {
      return { cell: address, label, expected: expectedNum, actual: actualNum, status: "benar", points: 1, maxPoints: 1, explanation: "Nilai sesuai toleransi." };
    }
    const rel = Math.abs(expectedNum) > 0 ? diff / Math.abs(expectedNum) : diff;
    if (rel <= 0.001) {
      return { cell: address, label, expected: expectedNum, actual: actualNum, status: "parsial", points: 0.8, maxPoints: 1, explanation: "Selisih kecil; nilai parsial diberikan sesuai toleransi awal." };
    }
    if (rel <= 0.01) {
      return { cell: address, label, expected: expectedNum, actual: actualNum, status: "parsial", points: 0.5, maxPoints: 1, explanation: "Selisih sampai 1%; nilai parsial." };
    }
    return { cell: address, label, expected: expectedNum, actual: actualNum, status: "salah", points: 0, maxPoints: 1, explanation: "Nilai berbeda dari kunci di luar toleransi." };
  }

  const expectedText = String(expectedRaw ?? "").trim();
  const actualText = String(actualRaw ?? "").trim();
  if (norm(expectedText) === norm(actualText)) {
    return { cell: address, label, expected: expectedText, actual: actualText, status: "benar", points: 1, maxPoints: 1, explanation: "Teks/label sesuai kunci." };
  }
  return { cell: address, label, expected: expectedText, actual: actualText, status: "salah", points: 0, maxPoints: 1, explanation: "Teks/label atau klasifikasi berbeda dari kunci." };
}

/**
 * Compare the candidate workbook against both the official key and the exact blank template.
 * Only cells blank in the official template but populated in the answer key are graded as inputs.
 * Cells containing formulas already provided by the template are not graded as candidate inputs.
 */
export async function checkExcelFile(
  candidate: Uint8Array,
  key: Uint8Array,
  template: Uint8Array,
  typed: number[] = []
): Promise<FileCheck> {
  const cWb = new ExcelJS.Workbook();
  const kWb = new ExcelJS.Workbook();
  const tWb = new ExcelJS.Workbook();
  await Promise.all([
    cWb.xlsx.load(candidate as unknown as ExcelJS.Buffer),
    kWb.xlsx.load(key as unknown as ExcelJS.Buffer),
    tWb.xlsx.load(template as unknown as ExcelJS.Buffer),
  ]);

  const notes: string[] = [];
  const sheets: SheetResult[] = [];
  const formulaStats = { count: 0, withoutResult: 0, exactMatches: 0 };

  for (const spec of SPECS) {
    const keySheet = findSheet(kWb, spec.aliases);
    const templateSheet = findSheet(tWb, spec.aliases);
    const candidateSheet = findSheet(cWb, spec.aliases);
    const details: CellFinding[] = [];

    if (!keySheet || !templateSheet || !candidateSheet) {
      notes.push(`Sheet ${spec.key} tidak ditemukan pada ${!keySheet ? "kunci" : !templateSheet ? "template resmi" : "file kandidat"}; sheet ini mendapat skor 0.`);
      sheets.push({ sheet: spec.key, found: 0, total: 1, score: 0, weight: spec.weight, missing: [], details: [{ cell: "-", label: "Struktur sheet", expected: spec.key, actual: null, status: "salah", points: 0, maxPoints: 1, explanation: "Sheet wajib tidak ditemukan." }] });
      continue;
    }

    const maxRow = Math.max(keySheet.rowCount, templateSheet.rowCount, candidateSheet.rowCount);
    const maxCol = Math.max(keySheet.columnCount, templateSheet.columnCount, candidateSheet.columnCount);
    const unexpectedEntries: string[] = [];
    for (let row = 1; row <= maxRow; row++) {
      for (let col = 1; col <= maxCol; col++) {
        const keyCell = keySheet.getCell(row, col);
        const templateCell = templateSheet.getCell(row, col);
        const candidateCell = candidateSheet.getCell(row, col);
        const keyValue = keyCell.value;
        const templateValue = templateCell.value;
        const candidateValue = candidateCell.value;
        const isBlank = (v: ExcelJS.CellValue) => v === null || v === undefined || v === "";
        // If the candidate filled a cell that is blank in BOTH the official key and template,
        // it may be a misplaced answer. Do not silently ignore it: flag the sheet for manual review.
        if (isBlank(keyValue) && isBlank(templateValue) && !isBlank(candidateValue)) {
          unexpectedEntries.push(candidateCell.address);
          continue;
        }
        // Graded input = present in answer key, but blank in the exact candidate template.
        if (isBlank(keyValue)) continue;
        const keyFormula = formulaOf(keyValue);
        const templateFormula = formulaOf(templateValue);
        const templateHasValue = templateValue !== null && templateValue !== undefined && templateValue !== "";
        // Grade user-fillable cells (blank in template) and formula cells supplied by the template.
        // Pre-filled constants/labels are assumptions/instructions and are not scored.
        if (templateHasValue && !(keyFormula && templateFormula)) continue;
        const label = labelFor(keySheet, row, col);
        details.push(compareCell(spec.key, keyCell.address, keyCell, candidateCell, label, formulaStats));
      }
    }

    if (unexpectedEntries.length > 0) {
      const sample = unexpectedEntries.slice(0, 12).join(", ");
      const more = unexpectedEntries.length > 12 ? ` dan ${unexpectedEntries.length - 12} sel lain` : "";
      notes.push(`Sheet ${spec.key}: ditemukan ${unexpectedEntries.length} sel terisi di luar sel yang dikenali (${sample}${more}). Jawaban mungkin bergeser dari template; skor otomatis sheet ini wajib ditinjau manual sebelum keputusan seleksi.`);
    }

    if (details.length === 0) {
      notes.push(`Tidak ada sel jawaban yang bisa dipetakan untuk ${spec.key}; periksa apakah template dan kunci yang dipakai adalah pasangan versi yang sama.`);
      sheets.push({ sheet: spec.key, found: 0, total: 1, score: 0, weight: spec.weight, missing: [], details: [{ cell: "-", label: "Pemetaan template", expected: "Sel jawaban", actual: null, status: "tidak_dapat_divalidasi", points: 0, maxPoints: 1, explanation: "Template tidak menyediakan sel kosong yang cocok dengan kunci." }] });
      continue;
    }

    const points = details.reduce((sum, d) => sum + d.points, 0);
    const maxPoints = details.reduce((sum, d) => sum + d.maxPoints, 0);
    const score = maxPoints ? (points / maxPoints) * 100 : 0;
    const missing = details.filter((d) => d.status === "kosong" || d.status === "salah").map((d) => ({ label: `${d.cell} — ${d.label}`, value: typeof d.expected === "number" ? d.expected : 0 }));
    const found = details.filter((d) => d.status === "benar" || d.status === "parsial").length;
    sheets.push({ sheet: spec.key, found, total: details.length, score: Math.round(score * 10) / 10, weight: spec.weight, missing, details });
  }

  const weightedScore = sheets.reduce((sum, sheet) => sum + sheet.score * sheet.weight, 0);
  const weightSum = SPECS.reduce((sum, spec) => sum + spec.weight, 0);
  const typedValid = typed.filter((n) => Number.isFinite(n));
  if (formulaStats.withoutResult > 0) notes.push(`${formulaStats.withoutResult} formula kandidat tidak memiliki hasil tersimpan; skor formula diberikan hanya jika ekspresinya identik dengan kunci.`);
  if (sheets.some((s) => s.details.some((d) => d.status === "tidak_dapat_divalidasi"))) notes.push("Ada komponen yang tidak dapat divalidasi secara otomatis; komponen tersebut tidak mendapat poin.");

  return {
    score: Math.round((weightedScore / weightSum) * 10) / 10,
    sheets,
    typed: { checked: typedValid.length, missing: [] },
    formulas: formulaStats,
    notes,
    method: "fixed-template-cell-by-cell",
  };
}
