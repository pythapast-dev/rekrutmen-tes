import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { supabase } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { logout } from "./login/actions";
import { scoreCandidate, VERDICT_LABEL, type Verdict } from "@/lib/scoring";
import { describeProfile, type Net } from "@/lib/disc-profile";

export const instant = false;
const DAY = 86400000;
function mondayOf(dateStr?: string) {
  let base = Date.now() + 7 * 3600000;
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr))
    base = Date.parse(`${dateStr}T12:00:00Z`);
  const d = new Date(base);
  const diff = (d.getUTCDay() + 6) % 7;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff),
  )
    .toISOString()
    .slice(0, 10);
}
function shift(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);
}
function fmt(date: string) {
  return new Date(`${date}T12:00:00+07:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}
function waLink(phone: string | null) {
  if (!phone) return null;
  let p = phone.replace(/\D/g, "");
  if (p.startsWith("0")) p = `62${p.slice(1)}`;
  return `https://wa.me/${p}`;
}
const badge: Record<Verdict, string> = {
  sangat: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  pertimbangkan: "bg-amber-50 text-amber-800 ring-amber-200",
  tidak: "bg-rose-50 text-rose-800 ring-rose-200",
  melanggar: "bg-rose-50 text-rose-800 ring-rose-200",
  berjalan: "bg-slate-100 text-slate-600 ring-slate-200",
};

type Props = { searchParams: Promise<{ minggu?: string; halaman?: string }> };
export default async function AdminPage({ searchParams }: Props) {
  await connection();
  if (!(await isAdmin())) redirect("/admin/login");
  const { minggu, halaman: halamanParam } = await searchParams;
  const monday = mondayOf(minggu);
  const pageSize = 10;
  const requestedPage = Math.max(1, Number.parseInt(halamanParam ?? "1", 10) || 1);
  const start = new Date(`${monday}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 7 * DAY);
  const { data: candidatesData } = await supabase
    .from("candidates")
    .select("id,full_name,email,phone,created_at,test_id")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());
  const candidates = candidatesData ?? [];
  const ids = candidates.map((c) => c.id);
  const { data: attemptsData } = ids.length
    ? await supabase
        .from("attempts")
        .select("id,candidate_id,status,violation_count")
        .in("candidate_id", ids)
    : { data: [] as any[] };
  const attempts = attemptsData ?? [];
  const attIds = attempts.map((a) => a.id);
  const { data: resultsData } = attIds.length
    ? await supabase.from("results").select("*").in("attempt_id", attIds)
    : { data: [] as any[] };
  const results = resultsData ?? [];
  const attMap = new Map(attempts.map((a) => [a.candidate_id, a]));
  const resultMap = new Map(results.map((r) => [r.attempt_id, r]));
  const rows = candidates.map((c) => {
    const a = attMap.get(c.id);
    const r = a ? resultMap.get(a.id) : undefined;
    const s = scoreCandidate(a?.status, r);
    const net: Net | null = r?.disc_type
      ? {
          D: Number(r.disc_d),
          I: Number(r.disc_i),
          S: Number(r.disc_s),
          C: Number(r.disc_c),
        }
      : null;
    const profile = net ? describeProfile(net) : null;
    return { c, a, r, s, profile };
  });
  const completed = rows.filter(
    (x) => x.a?.status === "finished" || x.a?.status === "violated",
  );
  completed.sort(
    (x, y) =>
      (x.s.verdict === "melanggar" ? 1 : 0) -
        (y.s.verdict === "melanggar" ? 1 : 0) ||
      (y.s.total ?? -1) - (x.s.total ?? -1),
  );
  const totalPages = Math.max(1, Math.ceil(completed.length / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const visibleCompleted = completed.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pending = rows.length - completed.length;
  const recommended = completed.filter((x) => x.s.verdict === "sangat").length;
  const violated = completed.filter((x) => x.s.verdict === "melanggar").length;
  let rank = 0;
  return (
    <main className="min-h-screen bg-slate-50/70 px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.22em] text-teal-700">
              PT PAST · Recruitment
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Dashboard Kandidat
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Pantau hasil seleksi dan bandingkan kandidat per minggu.
            </p>
          </div>
          <form action={logout}>
            <button className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">
              Keluar
            </button>
          </form>
        </header>
        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Kandidat terdaftar",
              value: candidates.length,
              note: "Pada periode terpilih",
              tone: "text-slate-900",
            },
            {
              label: "Tes selesai",
              value: completed.length,
              note: `${pending} masih berjalan / belum selesai`,
              tone: "text-slate-900",
            },
            {
              label: "Sangat direkomendasikan",
              value: recommended,
              note: "Berdasarkan hasil tes",
              tone: "text-emerald-700",
            },
            {
              label: "Pelanggaran tercatat",
              value: violated,
              note: "Ditinjau terpisah dari ranking",
              tone: "text-rose-700",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
            >
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <p
                className={`mt-2 text-3xl font-semibold tracking-tight ${card.tone}`}
              >
                {card.value}
              </p>
              <p className="mt-1 text-xs text-slate-400">{card.note}</p>
            </div>
          ))}
        </section>
        <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Periode laporan
            </p>
            <p className="mt-1 font-semibold text-slate-800">
              {fmt(monday)} – {fmt(shift(monday, 6))}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin?minggu=${shift(monday, -7)}&halaman=1`}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              ← Sebelumnya
            </Link>
            <Link
              href={`/admin?minggu=${shift(monday, 7)}&halaman=1`}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Berikutnya →
            </Link>
          </div>
        </section>
        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">
                Peringkat kandidat
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Nilai akhir = PG 40% + Essay/Excel 60%. DISC hanya deskripsi
                karakteristik.
              </p>
            </div>
            <p className="text-xs text-slate-400">{completed.length} hasil</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Rank</th>
                  <th className="px-4 py-3 font-semibold">Kandidat</th>
                  <th className="px-4 py-3 font-semibold">
                    PG <span className="normal-case">(40%)</span>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    Essay/Excel <span className="normal-case">(60%)</span>
                  </th>
                  <th className="px-4 py-3 font-semibold">Score keseluruhan</th>
                  <th className="px-4 py-3 font-semibold">Profil DISC</th>
                  <th className="px-4 py-3 font-semibold">Rekomendasi</th>
                  <th className="px-4 py-3 text-right font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {completed.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-14 text-center">
                      <p className="font-semibold text-slate-700">
                        Belum ada hasil seleksi
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        Pilih minggu lain atau tunggu kandidat menyelesaikan
                        tes.
                      </p>
                    </td>
                  </tr>
                ) : (
                  visibleCompleted.map(({ c, a, r, s, profile }) => {
                    const ranked =
                      s.verdict !== "melanggar" && s.total !== null;
                    if (ranked) rank += 1;
                    return (
                      <tr
                        key={c.id}
                        className="align-middle transition hover:bg-slate-50/80"
                      >
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${ranked && rank === 1 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}
                          >
                            {ranked ? rank : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-900">
                            {c.full_name}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {c.email}
                          </p>
                          {c.phone && (
                            <a
                              className="mt-1 inline-block text-xs text-teal-700 hover:underline"
                              href={waLink(c.phone) ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {c.phone}
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-800">
                            {r?.pg_score ?? "—"}
                            <span className="font-normal text-slate-400">
                              /{r?.pg_max ?? "—"}
                            </span>
                          </p>
                          {s.pgPct !== null && (
                            <p className="mt-1 text-xs text-slate-400">
                              {Math.round(s.pgPct)}%
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-800">
                            {s.filePct === null
                              ? "—"
                              : `${Math.round(s.filePct)}%`}
                          </p>
                          {s.filePct !== null && (
                            <div className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-teal-600"
                                style={{
                                  width: `${Math.max(0, Math.min(100, s.filePct))}%`,
                                }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-xl font-semibold tracking-tight text-slate-900">
                            {s.total === null ? "—" : Math.round(s.total)}
                          </p>
                          <p className="text-[11px] text-slate-400">dari 100</p>
                        </td>
                        <td className="max-w-[240px] px-4 py-4">
                          <p className="line-clamp-3 text-xs leading-5 text-slate-600">
                            {profile?.ringkas ?? "Profil DISC belum tersedia"}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex max-w-[160px] rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${badge[s.verdict]}`}
                          >
                            {VERDICT_LABEL[s.verdict]}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Link
                            href={`/admin/kandidat/${c.id}?minggu=${monday}`}
                            className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-800"
                          >
                            Lihat detail <span aria-hidden="true">→</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              {completed.length === 0 ? "Belum ada kandidat selesai" : `Menampilkan ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, completed.length)} dari ${completed.length} hasil`}
            </p>
            <div className="flex items-center gap-2">
              <Link
                aria-disabled={currentPage <= 1}
                href={`/admin?minggu=${monday}&halaman=${Math.max(1, currentPage - 1)}`}
                className={`rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium ${currentPage <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}
              >
                ← Sebelumnya
              </Link>
              <span className="px-2 text-sm tabular-nums text-slate-500">Halaman {currentPage} / {totalPages}</span>
              <Link
                aria-disabled={currentPage >= totalPages}
                href={`/admin?minggu=${monday}&halaman=${Math.min(totalPages, currentPage + 1)}`}
                className={`rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium ${currentPage >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}
              >
                Berikutnya →
              </Link>
            </div>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-xs leading-5 text-slate-500">
            Kandidat dengan pelanggaran tetap terlihat untuk pemeriksaan, tetapi
            tidak memperoleh nomor peringkat. Analisis detail tersedia melalui
            tombol di kolom paling kanan.
          </div>
        </section>
      </div>
    </main>
  );
}
