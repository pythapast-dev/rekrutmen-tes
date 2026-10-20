import { loadContext } from "@/lib/engine";
import { supabase } from "@/lib/supabase";

const FILES: Record<string, string> = {
  soal: "Soal_Studi_Kasus.docx",
  lembar: "Lembar_Jawaban.xlsx",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; file: string }> }
) {
  const { slug, file } = await params;
  if (!Object.hasOwn(FILES, file)) return new Response("Not found", { status: 404 });
  const name = FILES[file];

  const ctx = await loadContext(slug);
  if (!ctx || ctx.attempt.status !== "in_progress")
    return new Response("Unauthorized", { status: 401 });

  // Hanya bisa diunduh saat Bagian 2 sedang berjalan
  const active = ctx.progress.find((p) => !p.submitted_at);
  const section = active && ctx.sections.find((s) => s.id === active.section_id);
  if (!section || section.type !== "excel")
    return new Response("Forbidden", { status: 403 });

  const { data, error } = await supabase.storage
    .from("templates")
    .createSignedUrl(name, 60, { download: name });
  if (error || !data) return new Response("File belum tersedia", { status: 404 });

  return Response.redirect(data.signedUrl, 302);
}