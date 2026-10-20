// ====== ATURAN SKOR ======
// Bobot nilai akhir: PG 40% dan penilaian essay/file Excel 60%.
// DISC hanya menjadi deskripsi karakteristik dan tidak masuk nilai akhir.
export const WEIGHTS = { pg: 40, excel: 60 };
export const THRESHOLDS = { sangat: 75, pertimbangkan: 60 };
export const MIN_EXCEL_PCT = 50;
export const INCLUDE_DISC_IN_TOTAL = false;

export type Verdict =
  | "sangat"
  | "pertimbangkan"
  | "tidak"
  | "melanggar"
  | "berjalan";

export const VERDICT_LABEL: Record<Verdict, string> = {
  sangat: "Sangat direkomendasikan",
  pertimbangkan: "Dipertimbangkan",
  tidak: "Tidak lolos",
  melanggar: "Melanggar aturan",
  berjalan: "Belum lengkap",
};

export type ResultRow =
  | {
      pg_score: number | null;
      pg_max: number | null;
      excel_score: number | null;
      excel_max: number | null;
      review_score: number | null;
      status?: string | null;
      note?: string | null;
    }
  | undefined;

export function scoreCandidate(
  attemptStatus: string | undefined,
  r: ResultRow
) {
  const pgPct =
    r?.pg_score != null &&
    r?.pg_max != null &&
    Number(r.pg_max) > 0 &&
    Number.isFinite(Number(r.pg_score))
      ? Math.max(0, Math.min(100, (Number(r.pg_score) / Number(r.pg_max)) * 100))
      : null;

  // Skor tes Excel berasal dari hasil pemeriksaan file yang diunggah.
  // Nilai Excel angka lama tidak digunakan dalam skor akhir.
  const filePct =
    r?.review_score != null && Number.isFinite(Number(r.review_score))
      ? Math.max(0, Math.min(100, Number(r.review_score)))
      : null;

  const complete = pgPct !== null && filePct !== null;
  const total = complete
    ? (WEIGHTS.pg * pgPct + WEIGHTS.excel * filePct) / 100
    : null;

  const reasons: string[] = [];
  let verdict: Verdict;

  if (attemptStatus === "violated" || r?.status === "melanggar") {
    verdict = "melanggar";
    if (r?.note) reasons.push(r.note);
  } else if (attemptStatus !== "finished" || !complete) {
    verdict = "berjalan";
    if (pgPct === null) reasons.push("Nilai PG belum tersedia");
    if (filePct === null) reasons.push("Penilaian file Excel belum tersedia");
  } else if (filePct < MIN_EXCEL_PCT) {
    verdict = "tidak";
    reasons.push(`Nilai file Excel di bawah ${MIN_EXCEL_PCT}%`);
  } else if (total !== null && total >= THRESHOLDS.sangat) {
    verdict = "sangat";
  } else if (total !== null && total >= THRESHOLDS.pertimbangkan) {
    verdict = "pertimbangkan";
  } else {
    verdict = "tidak";
  }

  return {
    pgPct,
    angkaPct: null,
    filePct,
    excelPct: filePct,
    total,
    verdict,
    reasons,
  };
}
