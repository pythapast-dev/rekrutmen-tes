import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { register } from "./actions";
import ClearError from "./clear-error";

export const instant = false;

const ERRORS: Record<string, string> = {
  data: "Mohon isi nama lengkap, email, dan nomor WhatsApp (format 08xx atau +62xx) dengan benar.",
  consent: "Kamu perlu menyetujui penggunaan data untuk melanjutkan.",
  sudah:
    "Email ini sudah pernah mendaftar. Setiap email hanya bisa mengikuti tes satu kali. Jika terputus saat mengerjakan, silakan hubungi HRD.",
  gagal: "Terjadi kendala di sistem. Silakan coba lagi.",
};

const label = "mb-1.5 block text-sm font-medium";
const field =
  "h-12 w-full rounded-lg border border-line bg-white px-3.5 text-base outline-none transition placeholder:text-muted/60 focus:border-brand focus:ring-2 focus:ring-brand/20";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const { data: test } = await supabase
    .from("tests")
    .select("id, name, position")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (!test) notFound();

  const { data: sections } = await supabase
    .from("sections")
    .select("title, duration_minutes")
    .eq("test_id", test.id)
    .order("position");

  return (
    <main className="mx-auto grid max-w-5xl items-start gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:gap-x-16 lg:py-16">
      {/* Info tes */}
      <section className="lg:col-start-1 lg:row-start-1">
        <p className="text-sm font-medium tracking-wide text-brand">
          Seleksi karyawan
        </p>
        <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">
          {test.position}
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
          Tes online terdiri dari tiga bagian. Waktu dihitung per bagian, jadi
          pastikan kamu sudah siap sebelum memulai.
        </p>

        <ol className="mt-8 divide-y divide-line border-y border-line">
          {sections?.map((s, i) => (
            <li key={s.title} className="flex items-center gap-4 py-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft font-serif text-lg tabular-nums text-brand">
                {i + 1}
              </span>
              <span className="flex-1 leading-snug">
                {s.title.replace(/^Bagian \d+:\s*/, "")}
              </span>
              <span className="whitespace-nowrap text-sm tabular-nums text-muted">
                {s.duration_minutes} menit
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* Form */}
      <section className="rounded-2xl border border-line bg-card p-6 shadow-[0_8px_30px_-12px_rgba(15,92,74,0.18)] sm:p-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-8">
        <h2 className="font-serif text-2xl">Data diri</h2>
        <p className="mt-1 text-sm text-muted">
          Isi dengan data yang benar. Kami akan menghubungimu lewat kontak ini.
        </p>

        {error && ERRORS[error] && (
          <>
            <ClearError />
            <p
              role="alert"
              className="mt-5 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
            >
              {ERRORS[error]}
            </p>
          </>
        )}

        <form action={register} className="mt-6 space-y-5">
          <input type="hidden" name="slug" value={slug} />

          <div>
            <label htmlFor="full_name" className={label}>
              Nama lengkap
            </label>
            <input
              id="full_name"
              name="full_name"
              required
              autoComplete="name"
              enterKeyHint="next"
              className={field}
            />
          </div>

          <div>
            <label htmlFor="email" className={label}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              enterKeyHint="next"
              className={field}
            />
          </div>

          <div>
            <label htmlFor="phone" className={label}>
              Nomor WhatsApp
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              inputMode="tel"
              placeholder="08xxxxxxxxxx"
              className={field}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
            <input
              type="checkbox"
              name="consent"
              className="mt-0.5 size-5 shrink-0 accent-brand"
            />
            <span>
              Saya menyetujui data dan hasil tes saya digunakan untuk keperluan
              seleksi rekrutmen.
            </span>
          </label>

        <button
          type="submit"
          className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 font-semibold text-white shadow-md shadow-brand/25 ring-1 ring-inset ring-white/10 transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-lg hover:shadow-brand/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:translate-y-0 active:scale-[0.98]"
        >
          Daftar dan lanjutkan
          <svg
            className="size-4 transition-transform group-hover:translate-x-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        </form>
      </section>

      {/* Aturan */}
      <section className="rounded-xl border border-brand/15 bg-brand-soft p-5 text-sm leading-relaxed lg:col-start-1 lg:row-start-2">
        <p className="font-semibold">Sebelum mulai</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-ink/80">
          <li>Gunakan laptop atau PC, karena Bagian 2 memakai Excel.</li>
          <li>Pastikan koneksi internet stabil dan baterai cukup.</li>
          <li>
            Pada Bagian 1 dan 3, berpindah tab atau jendela lain akan membuat tes
            langsung terkirim dan dihentikan.
          </li>
          <li>Setiap email hanya bisa mengikuti tes satu kali.</li>
        </ul>
      </section>
    </main>
  );
}