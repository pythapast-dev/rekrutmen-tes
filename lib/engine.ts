import { parseRupiah } from "@/lib/number";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { reviewExcelFile } from "@/lib/excel-review";
import { scoreDisc, type DiscMap } from "@/lib/disc";

export type Section = {
  id: string;
  type: "pg" | "excel" | "disc";
  title: string;
  instructions: string | null;
  duration_minutes: number;
  position: number;
  strict_mode: boolean;
  max_violations: number;
};

export type Progress = {
  id: string;
  section_id: string;
  started_at: string;
  deadline: string;
  submitted_at: string | null;
};

export async function loadContext(slug: string) {
  const token = (await cookies()).get("attempt_token")?.value;
  if (!token) return null;

  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, candidate_id, status")
    .eq("access_token", token)
    .maybeSingle();
  if (!attempt) return null;

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, full_name, test_id")
    .eq("id", attempt.candidate_id)
    .single();

  const { data: test } = await supabase
    .from("tests")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!candidate || !test || candidate.test_id !== test.id) return null;

  const [{ data: sections }, { data: progress }] = await Promise.all([
    supabase
      .from("sections")
      .select(
        "id, type, title, instructions, duration_minutes, position, strict_mode, max_violations"
      )
      .eq("test_id", test.id)
      .order("position"),
    supabase
      .from("attempt_sections")
      .select("id, section_id, started_at, deadline, submitted_at")
      .eq("attempt_id", attempt.id),
  ]);

  return {
    attempt: attempt as { id: string; candidate_id: string; status: string },
    candidate: candidate as { id: string; full_name: string; test_id: string },
    sections: (sections ?? []) as Section[],
    progress: (progress ?? []) as Progress[],
  };
}

export async function finalizeSection(
  attemptId: string,
  section: Pick<Section, "id" | "type">,
  reason: "manual" | "timeout" | "violation"
) {
  // Tandai selesai hanya jika belum pernah ditutup (aman dari klik ganda)
  const { data: updated } = await supabase
    .from("attempt_sections")
    .update({ submitted_at: new Date().toISOString(), submit_reason: reason })
    .eq("attempt_id", attemptId)
    .eq("section_id", section.id)
    .is("submitted_at", null)
    .select("id");

  if (!updated || updated.length === 0) return false;

  if (section.type === "pg") await gradePg(attemptId, section.id);
  if (section.type === "disc") await gradeDisc(attemptId, section.id);
  if (section.type === "excel") await reviewExcelFile(attemptId, section.id);
  return true;
}

async function gradePg(attemptId: string, sectionId: string) {
  const { data: qs } = await supabase
    .from("questions")
    .select("id, correct_option, weight")
    .eq("section_id", sectionId);

  const ids = (qs ?? []).map((q) => q.id);
  const { data: ans } = await supabase
    .from("answers")
    .select("question_id, answer")
    .eq("attempt_id", attemptId)
    .in("question_id", ids);

  const given = new Map((ans ?? []).map((a) => [a.question_id, a.answer]));
  const now = new Date().toISOString();
  const rows: {
    attempt_id: string;
    question_id: string;
    score: number;
    graded_at: string;
  }[] = [];

  let score = 0;
  let max = 0;
  for (const q of qs ?? []) {
    const w = Number(q.weight ?? 1);
    max += w;
    if (!given.has(q.id)) continue;
    const ok = given.get(q.id) === q.correct_option;
    if (ok) score += w;
    rows.push({
      attempt_id: attemptId,
      question_id: q.id,
      score: ok ? w : 0,
      graded_at: now,
    });
  }

  if (rows.length > 0) {
    await supabase
      .from("answers")
      .upsert(rows, { onConflict: "attempt_id,question_id" });
  }
  await supabase
    .from("results")
    .upsert(
      { attempt_id: attemptId, pg_score: score, pg_max: max, updated_at: now },
      { onConflict: "attempt_id" }
    );
}

export async function finishAttempt(
  attemptId: string,
  status: "finished" | "violated"
) {
  await supabase
    .from("attempts")
    .update({ status, finished_at: new Date().toISOString() })
    .eq("id", attemptId)
    .eq("status", "in_progress");
}
export async function gradeDisc(attemptId: string, sectionId: string) {
  const { data: qs } = await supabase
    .from("questions")
    .select("id, disc_map")
    .eq("section_id", sectionId);

  // Belum ada kunci: jangan menulis apa pun
  if (!(qs ?? []).some((q) => q.disc_map)) return;

  const { data: ans } = await supabase
    .from("answers")
    .select("question_id, answer")
    .eq("attempt_id", attemptId)
    .in(
      "question_id",
      (qs ?? []).map((q) => q.id)
    );
  if (!ans || ans.length === 0) return;

  const given = new Map(ans.map((a) => [a.question_id, a.answer as string | null]));
  const r = scoreDisc(
    (qs ?? []).map((q) => ({
      map: (q.disc_map ?? null) as DiscMap | null,
      answer: given.get(q.id),
    }))
  );

  await supabase.from("results").upsert(
    {
      attempt_id: attemptId,
      disc_d: r.net.D,
      disc_i: r.net.I,
      disc_s: r.net.S,
      disc_c: r.net.C,
      disc_type: r.type,
      disc_profile_name: r.profile?.name ?? null,
      disc_profile_description: r.profile?.description ?? null,
      disc_profile_traits: r.profile?.traits ?? null,
      disc_profile_career: r.profile?.career ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "attempt_id" }
  );
}