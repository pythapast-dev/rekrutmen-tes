import { supabase } from "@/lib/supabase";
import { parseRupiah } from "@/lib/number";
import { checkExcelFile } from "@/lib/excel-check";

export async function reviewExcelFile(attemptId: string, sectionId: string) {
  try {
    const now = new Date().toISOString();
    const { data: uploads, error: uploadError } = await supabase
      .from("uploads")
      .select("id, file_path, original_name")
      .eq("attempt_id", attemptId)
      .eq("section_id", sectionId)
      .order("uploaded_at", { ascending: false })
      .limit(1);

    if (uploadError) throw uploadError;
    const upload = uploads?.[0];
    if (!upload) {
      await supabase.from("results").upsert(
        { attempt_id: attemptId, review_score: 0, updated_at: now },
        { onConflict: "attempt_id" }
      );
      return;
    }

    // The three files live in separate private buckets: candidate upload, official key, and blank template.
    const [candidateDownload, keyDownload, templateDownload] = await Promise.all([
      supabase.storage.from("submissions").download(upload.file_path),
      supabase.storage.from("keys").download("Kunci_Jawaban.xlsx"),
      supabase.storage.from("templates").download("Lembar_Jawaban.xlsx"),
    ]);

    if (candidateDownload.error || !candidateDownload.data) throw candidateDownload.error ?? new Error("File kandidat tidak ditemukan di bucket submissions.");
    if (keyDownload.error || !keyDownload.data) throw keyDownload.error ?? new Error("Kunci Kunci_Jawaban.xlsx tidak ditemukan di bucket keys.");
    if (templateDownload.error || !templateDownload.data) throw templateDownload.error ?? new Error("Template Lembar_Jawaban.xlsx tidak ditemukan di bucket templates.");

    // Retain typed numeric answers as audit metadata, but the workbook itself is graded cell-by-cell.
    const { data: questions, error: questionsError } = await supabase
      .from("questions")
      .select("id")
      .eq("section_id", sectionId);
    if (questionsError) throw questionsError;

    const questionIds = (questions ?? []).map((q) => q.id);
    let typed: number[] = [];
    if (questionIds.length) {
      const { data: answers, error: answersError } = await supabase
        .from("answers")
        .select("answer")
        .eq("attempt_id", attemptId)
        .in("question_id", questionIds);
      if (answersError) throw answersError;
      typed = (answers ?? [])
        .map((answer) => parseRupiah(String(answer.answer ?? "")))
        .filter((value): value is number => value !== null);
    }

    const result = await checkExcelFile(
      Buffer.from(await candidateDownload.data.arrayBuffer()),
      Buffer.from(await keyDownload.data.arrayBuffer()),
      Buffer.from(await templateDownload.data.arrayBuffer()),
      typed
    );

    const reviewNotes = JSON.stringify({
      ...result,
      original_name: upload.original_name,
      scoring_version: "fixed-template-cell-by-cell-v1",
      reviewed_at: now,
    });

    const { error: updateUploadError } = await supabase
      .from("uploads")
      .update({
        reviewer: "sistem",
        review_score: result.score,
        review_notes: reviewNotes,
        reviewed_at: now,
      })
      .eq("id", upload.id);
    if (updateUploadError) throw updateUploadError;

    const { error: updateResultError } = await supabase.from("results").upsert(
      { attempt_id: attemptId, review_score: result.score, updated_at: now },
      { onConflict: "attempt_id" }
    );
    if (updateResultError) throw updateResultError;
  } catch (error) {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui";
    console.error("reviewExcelFile gagal:", error);

    // Tandai pemeriksaan gagal agar skor lama tidak disangka hasil terbaru.
    await supabase
      .from("uploads")
      .update({
        reviewer: "sistem_error",
        review_notes: JSON.stringify({ status: "error", message, reviewed_at: now }),
        reviewed_at: now,
      })
      .eq("attempt_id", attemptId)
      .eq("section_id", sectionId);
  }
}
