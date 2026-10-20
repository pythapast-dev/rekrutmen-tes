"use server";

import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { loadContext, finalizeSection, finishAttempt } from "@/lib/engine";

const GRACE_MS = 5000; // toleransi keterlambatan jaringan

function validAnswer(type: string, v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (type === "pg") return /^[A-D]$/.test(v);
  if (type === "excel") return v.length <= 40;
  if (type === "disc") {
    // Bentuk: {"p":"A","k":"C"} (boleh sebagian), P dan K tidak boleh sama
    if (v.length > 40) return false;
    try {
      const o = JSON.parse(v);
      const ok = (x: unknown) =>
        x === undefined || (typeof x === "string" && /^[A-D]$/.test(x));
      return (
        typeof o === "object" &&
        o !== null &&
        ok(o.p) &&
        ok(o.k) &&
        !(o.p && o.p === o.k)
      );
    } catch {
      return false;
    }
  }
  return false;
}

async function persistAnswers(
  attemptId: string,
  section: { id: string; type: string },
  answers: Record<string, string>
) {
  const { data: qs } = await supabase
    .from("questions")
    .select("id")
    .eq("section_id", section.id);
  const valid = new Set((qs ?? []).map((q) => q.id));
  const now = new Date().toISOString();

  const rows = Object.entries(answers)
    .filter(([qid, v]) => valid.has(qid) && validAnswer(section.type, v))
    .map(([qid, v]) => ({
      attempt_id: attemptId,
      question_id: qid,
      answer: v,
      updated_at: now,
    }));

  if (rows.length > 0) {
    await supabase
      .from("answers")
      .upsert(rows, { onConflict: "attempt_id,question_id" });
  }
}

export async function startSection(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const sectionId = String(formData.get("section_id") ?? "");

  const ctx = await loadContext(slug);
  if (!ctx || ctx.attempt.status !== "in_progress") redirect(`/tes/${slug}`);

  if (ctx.progress.some((p) => !p.submitted_at)) redirect(`/tes/${slug}/mulai`);

  const started = new Set(ctx.progress.map((p) => p.section_id));
  const next = ctx.sections.find((s) => !started.has(s.id));
  if (!next || next.id !== sectionId) redirect(`/tes/${slug}/mulai`);

  const now = new Date();
  const deadline = new Date(now.getTime() + next.duration_minutes * 60_000);

  await supabase.from("attempt_sections").insert({
    attempt_id: ctx.attempt.id,
    section_id: next.id,
    started_at: now.toISOString(),
    deadline: deadline.toISOString(),
  });

  redirect(`/tes/${slug}/mulai`);
}

export async function saveAnswer(
  slug: string,
  questionId: string,
  answer: string
) {
  const ctx = await loadContext(slug);
  if (!ctx || ctx.attempt.status !== "in_progress") return { ok: false };

  const active = ctx.progress.find((p) => !p.submitted_at);
  if (!active) return { ok: false };
  if (new Date(active.deadline).getTime() + GRACE_MS < Date.now())
    return { ok: false };

  const section = ctx.sections.find((s) => s.id === active.section_id);
  if (!section || !validAnswer(section.type, answer)) return { ok: false };

  const { data: q } = await supabase
    .from("questions")
    .select("id")
    .eq("id", questionId)
    .eq("section_id", active.section_id)
    .maybeSingle();
  if (!q) return { ok: false };

  const { error } = await supabase.from("answers").upsert(
    {
      attempt_id: ctx.attempt.id,
      question_id: questionId,
      answer,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "attempt_id,question_id" }
  );
  return { ok: !error };
}

export async function submitSection(
  slug: string,
  answers: Record<string, string>
) {
  const ctx = await loadContext(slug);
  if (!ctx || ctx.attempt.status !== "in_progress") return { ok: false };

  const active = ctx.progress.find((p) => !p.submitted_at);
  if (!active) return { ok: true };

  const section = ctx.sections.find((s) => s.id === active.section_id);
  if (!section) return { ok: false };

  const deadlineMs = new Date(active.deadline).getTime();
  const late = Date.now() > deadlineMs;

  if (Date.now() <= deadlineMs + GRACE_MS) {
    await persistAnswers(ctx.attempt.id, section, answers);
  }

  await finalizeSection(ctx.attempt.id, section, late ? "timeout" : "manual");
  return { ok: true };
}

export async function reportViolation(
  slug: string,
  type: string,
  answers: Record<string, string>
) {
  const none = { ok: false, ended: false, count: 0, max: 0 };

  const ctx = await loadContext(slug);
  if (!ctx || ctx.attempt.status !== "in_progress") return none;

  const active = ctx.progress.find((p) => !p.submitted_at);
  if (!active) return none;
  const section = ctx.sections.find((s) => s.id === active.section_id);
  if (!section) return none;

  const eventType =
    type === "tab_hidden" || type === "window_blur" ? type : "other";

  // Selalu dicatat, baik bagian ketat maupun tidak
  await supabase.from("integrity_events").insert({
    attempt_id: ctx.attempt.id,
    section_id: section.id,
    event_type: eventType,
  });

  const { count: total } = await supabase
    .from("integrity_events")
    .select("id", { count: "exact", head: true })
    .eq("attempt_id", ctx.attempt.id);
  await supabase
    .from("attempts")
    .update({ violation_count: total ?? 0 })
    .eq("id", ctx.attempt.id);

  // Bagian tidak ketat (mis. Excel): hanya dicatat
  if (!section.strict_mode) return { ok: true, ended: false, count: 0, max: 0 };

  const { count: inSection } = await supabase
    .from("integrity_events")
    .select("id", { count: "exact", head: true })
    .eq("attempt_id", ctx.attempt.id)
    .eq("section_id", section.id);
  const count = inSection ?? 0;
  const max = section.max_violations;

  if (count < max) return { ok: true, ended: false, count, max };

  // Batas terlampaui: simpan jawaban terakhir, tutup bagian, hentikan tes
  if (Date.now() <= new Date(active.deadline).getTime() + GRACE_MS) {
    await persistAnswers(ctx.attempt.id, section, answers);
  }
  await finalizeSection(ctx.attempt.id, section, "violation");
  await finishAttempt(ctx.attempt.id, "violated");
  await supabase.from("results").upsert(
    {
      attempt_id: ctx.attempt.id,
      status: "melanggar",
      note: `Meninggalkan halaman tes pada ${section.title}`,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "attempt_id" }
  );

  return { ok: true, ended: true, count, max };
}