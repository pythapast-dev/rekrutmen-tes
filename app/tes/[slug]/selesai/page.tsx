import { loadContext } from "@/lib/engine";

export const instant = false;

export default async function Selesai({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await loadContext(slug);
  const violated = ctx?.attempt.status === "violated";

  return (
    <main className="mx-auto max-w-xl px-5 py-12 sm:px-8 sm:py-20">
      <p className="text-sm font-medium tracking-wide text-brand">
        {violated ? "Tes dihentikan" : "Tes selesai"}
      </p>
      <h1 className="mt-3 font-serif text-4xl leading-tight">
        {violated ? "Tes dihentikan otomatis" : "Terima kasih"}
      </h1>
      <p className="mt-4 leading-relaxed text-muted">
        {violated
          ? "Sistem mendeteksi kamu meninggalkan halaman tes. Sesuai aturan, tes dihentikan dan jawabanmu sampai saat itu sudah tersimpan. Tim kami akan meninjau hasilnya."
          : "Jawabanmu sudah kami terima. Jika profilmu sesuai, tim kami akan menghubungi lewat WhatsApp atau email."}
      </p>
    </main>
  );
}