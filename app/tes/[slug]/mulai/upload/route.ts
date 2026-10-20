import { loadContext } from "@/lib/engine";
import { supabase } from "@/lib/supabase";

const MAX_BYTES = 4 * 1024 * 1024;
const GRACE_MS = 5000;

function fail(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const ctx = await loadContext(slug);
  if (!ctx || ctx.attempt.status !== "in_progress")
    return fail("Sesi tes tidak ditemukan.", 401);

  const active = ctx.progress.find((p) => !p.submitted_at);
  const section = active && ctx.sections.find((s) => s.id === active.section_id);
  if (!active || !section || section.type !== "excel")
    return fail("Unggah file hanya bisa dilakukan saat Bagian 2 berjalan.");
  if (Date.now() > new Date(active.deadline).getTime() + GRACE_MS)
    return fail("Waktu sudah habis.");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("File tidak ditemukan.");
  if (!file.name.toLowerCase().endsWith(".xlsx"))
    return fail("File harus berformat .xlsx.");
  if (file.size === 0 || file.size > MAX_BYTES)
    return fail("Ukuran file maksimal 4 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  // .xlsx adalah file zip: harus diawali "PK"
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    return fail("Isi file bukan Excel (.xlsx) yang valid.");

  const { data: old } = await supabase
    .from("uploads")
    .select("id, file_path")
    .eq("attempt_id", ctx.attempt.id)
    .eq("section_id", section.id);

  // Nama di storage dibuat dari ID, bukan dari nama file kandidat
  const path = `${ctx.attempt.id}/${section.id}/${Date.now()}.xlsx`;
  const { error: upErr } = await supabase.storage
    .from("submissions")
    .upload(path, bytes, {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });
  if (upErr) return fail("Gagal menyimpan file. Coba lagi.", 500);

  const { data: row, error: insErr } = await supabase
    .from("uploads")
    .insert({
      attempt_id: ctx.attempt.id,
      section_id: section.id,
      file_path: path,
      original_name: file.name.slice(0, 120),
      size_bytes: file.size,
    })
    .select("original_name, size_bytes, uploaded_at")
    .single();
  if (insErr || !row) {
    await supabase.storage.from("submissions").remove([path]);
    return fail("Gagal mencatat file. Coba lagi.", 500);
  }

  // Hanya file terbaru yang disimpan
  if (old && old.length > 0) {
    await supabase.storage
      .from("submissions")
      .remove(old.map((o) => o.file_path));
    await supabase
      .from("uploads")
      .delete()
      .in(
        "id",
        old.map((o) => o.id)
      );
  }

  return Response.json({
    ok: true,
    file: { name: row.original_name, size: row.size_bytes, at: row.uploaded_at },
  });
}