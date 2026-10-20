import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { loadContext, finalizeSection, finishAttempt } from "@/lib/engine";
import { startSection } from "./actions";
import PgTest from "./pg-test";
import ExcelTest from "./excel-test";
import DiscTest from "./disc-test";

export const instant = false;

export default async function Mulai({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await loadContext(slug);
  if (!ctx) redirect(`/tes/${slug}`);

  const { attempt, candidate, sections, progress } = ctx;
  if (attempt.status !== "in_progress") redirect(`/tes/${slug}/selesai`);

  // 1. Tutup bagian yang waktunya sudah habis
  let closed = false;
  for (const p of progress) {
    if (!p.submitted_at && new Date(p.deadline).getTime() <= Date.now()) {
      const sec = sections.find((s) => s.id === p.section_id);
      if (sec) {
        await finalizeSection(attempt.id, sec, "timeout");
        closed = true;
      }
    }
  }
  if (closed) redirect(`/tes/${slug}/mulai`);

  // 2. Ada bagian yang sedang berjalan
  const active = progress.find((p) => !p.submitted_at);
  if (active) {
    const section = sections.find((s) => s.id === active.section_id);

    if (section?.type === "pg") {
      // Kunci jawaban (correct_option) sengaja TIDAK diambil
      const { data: qs } = await supabase
        .from("questions")
        .select("id, position, body, options")
        .eq("section_id", section.id)
        .order("position");
      const questions = qs ?? [];

      const { data: saved } = await supabase
        .from("answers")
        .select("question_id, answer")
        .eq("attempt_id", attempt.id)
        .in(
          "question_id",
          questions.map((q) => q.id)
        );

      const savedMap: Record<string, string> = {};
      for (const a of saved ?? []) if (a.answer) savedMap[a.question_id] = a.answer;

      return (
        <PgTest
          slug={slug}
          title={section.title}
          questions={questions}
          saved={savedMap}
          deadline={active.deadline}
          serverNow={new Date().toISOString()}
        />
      );
    }

    if (section?.type === "excel") {
      // Kunci (answer_key) sengaja tidak diambil
      const { data: qs } = await supabase
        .from("questions")
        .select("id, position, body")
        .eq("section_id", section.id)
        .order("position");
      const questions = qs ?? [];

      const { data: saved } = await supabase
        .from("answers")
        .select("question_id, answer")
        .eq("attempt_id", attempt.id)
        .in(
          "question_id",
          questions.map((q) => q.id)
        );
      const savedMap: Record<string, string> = {};
      for (const a of saved ?? []) savedMap[a.question_id] = a.answer ?? "";

      const { data: up } = await supabase
        .from("uploads")
        .select("original_name, size_bytes, uploaded_at")
        .eq("attempt_id", attempt.id)
        .eq("section_id", section.id)
        .order("uploaded_at", { ascending: false })
        .limit(1);
      const f = up?.[0];

      return (
        <ExcelTest
          slug={slug}
          title={section.title}
          questions={questions}
          saved={savedMap}
          file={
            f
              ? { name: f.original_name, size: f.size_bytes, at: f.uploaded_at }
              : null
          }
          deadline={active.deadline}
          serverNow={new Date().toISOString()}
        />
      );
    }

    if (section?.type === "disc") {
      // Kunci (disc_map) sengaja tidak diambil
      const { data: qs } = await supabase
        .from("questions")
        .select("id, position, body, options")
        .eq("section_id", section.id)
        .order("position");
      const questions = qs ?? [];

      const { data: saved } = await supabase
        .from("answers")
        .select("question_id, answer")
        .eq("attempt_id", attempt.id)
        .in(
          "question_id",
          questions.map((q) => q.id)
        );
      const savedMap: Record<string, string> = {};
      for (const a of saved ?? []) if (a.answer) savedMap[a.question_id] = a.answer;

      return (
        <DiscTest
          slug={slug}
          title={section.title}
          instructions={section.instructions}
          questions={questions}
          saved={savedMap}
          deadline={active.deadline}
          serverNow={new Date().toISOString()}
        />
      );
    }

    return (
      <main className="mx-auto max-w-xl px-5 py-12 sm:px-8">
        <p className="text-muted">Bagian ini sedang kita bangun.</p>
      </main>
    );
  }

  // 3. Belum ada yang berjalan: tampilkan bagian berikutnya
  const started = new Set(progress.map((p) => p.section_id));
  const next = sections.find((s) => !started.has(s.id));
  if (!next) {
    await finishAttempt(attempt.id, "finished");
    redirect(`/tes/${slug}/selesai`);
  }

  const { count } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("section_id", next.id);

  const ready = ["pg", "excel", "disc"].includes(next.type);

  return (
    <main className="mx-auto max-w-xl px-5 py-12 sm:px-8 sm:py-20">
      <p className="text-sm font-medium tracking-wide text-brand">
        {progress.length === 0
          ? `Halo, ${candidate.full_name}`
          : "Bagian sebelumnya selesai"}
      </p>
      <h1 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl">
        {next.title}
      </h1>
      {next.instructions && (
        <p className="mt-4 leading-relaxed text-muted">{next.instructions}</p>
      )}

      <dl className="mt-8 grid grid-cols-2 divide-x divide-line border-y border-line text-center">
        <div className="py-4">
          <dt className="text-xs text-muted">Waktu</dt>
          <dd className="mt-1 font-serif text-2xl tabular-nums">
            {next.duration_minutes} menit
          </dd>
        </div>

        <div className="py-4">
          <dt className="text-xs text-muted">
            {next.type === "excel" ? "Format pengerjaan" : "Jumlah soal"}
          </dt>

          <dd className="mt-1 font-serif text-2xl tabular-nums">
            {next.type === "excel" ? "Excel (.xlsx)" : count ?? 0}
          </dd>
        </div>
      </dl>

      <p className="mt-6 text-sm leading-relaxed text-muted">
        Waktu mulai berjalan begitu kamu menekan tombol dan tidak bisa dijeda.
      </p>

      {ready ? (
        <form action={startSection} className="mt-6">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="section_id" value={next.id} />
          <button
            type="submit"
            className="h-12 w-full rounded-lg bg-brand font-semibold text-white transition hover:bg-brand-dark"
          >
            Mulai {next.title.split(":")[0]}
          </button>
        </form>
      ) : (
        <p className="mt-6 rounded-lg border border-line bg-card p-4 text-sm">
          Bagian ini sedang kita bangun, jadi belum bisa dimulai.
        </p>
      )}
    </main>
  );
}