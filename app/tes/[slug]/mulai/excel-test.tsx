"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reportViolation, submitSection } from "./actions";

type UploadedFile = { name: string; size: number; at: string } | null;

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function fmtSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Heading({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <span className="font-serif text-3xl leading-none text-brand">{n}</span>
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{sub}</p>
      </div>
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-brand"
    >
      <path d={d} />
    </svg>
  );
}

const DOWNLOAD = "M12 4v11M7 11l5 5 5-5M5 20h14";
const FILE = "M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6";

export default function ExcelTest({
  slug,
  title,
  file: initialFile,
  deadline,
  serverNow,
}: {
  slug: string;
  title: string;
  questions?: { id: string; position: number; body: string }[];
  saved?: Record<string, string>;
  file: UploadedFile;
  deadline: string;
  serverNow: string;
}) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<UploadedFile>(initialFile);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const sendingRef = useRef(false);
  const eventRef = useRef(false);

  const send = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const res = await submitSection(slug, {});
      if (res.ok) {
        toast.success("Sesi Excel berhasil dikirim", { description: "File dan jawaban kamu sudah dikirim." });
        router.refresh();
        return;
      }
    } catch {
      // jatuh ke penanganan gagal di bawah
    }
    setSending(false);
    toast.error("Belum berhasil mengirim", { description: "Periksa koneksi internet lalu coba lagi." });
    setTimeout(() => {
      sendingRef.current = false;
    }, 3000);
  }, [slug, router]);

  // Perpindahan jendela di bagian ini hanya dicatat
  const logEvent = useCallback(
    async (type: string) => {
      if (sendingRef.current || eventRef.current) return;
      eventRef.current = true;
      try {
        const res = await reportViolation(slug, type, {});
        if (res.ended) router.refresh();
      } catch {
        // abaikan
      }
      setTimeout(() => {
        eventRef.current = false;
      }, 1500);
    },
    [slug, router]
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) logEvent("tab_hidden");
    };
    const onBlur = () => logEvent("window_blur");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [logEvent]);

  // Timer: dihitung dari jam server
  useEffect(() => {
    const offset = new Date(serverNow).getTime() - Date.now();
    const end = new Date(deadline).getTime();
    const tick = () => {
      const remain = end - (Date.now() + offset);
      setLeft(remain);
      if (remain <= 0) send();
    };
    const t0 = setTimeout(tick, 0);
    const id = setInterval(tick, 250);
    return () => {
      clearTimeout(t0);
      clearInterval(id);
    };
  }, [deadline, serverNow, send]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploadError(null);
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setUploadError("File harus berformat .xlsx.");
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      setUploadError("Ukuran file maksimal 4 MB.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", f);
      const res = await fetch(`/tes/${slug}/mulai/upload`, {
        method: "POST",
        body,
      });
      const json = await res.json();
      if (res.ok && json.ok) setFile(json.file);
      else setUploadError(json.error ?? "Gagal mengunggah. Coba lagi.");
    } catch {
      setUploadError("Gagal mengunggah. Periksa koneksi lalu coba lagi.");
    }
    setUploading(false);
  }

  function onSubmit() {
    if (!file) {
      toast.error("File Excel belum diunggah", { description: "Unggah file .xlsx terlebih dahulu sebelum mengirim." });
      return;
    }
    toast("Kirim file Excel sekarang?", {
      description: "Setelah dikirim, file tidak bisa diubah.",
      duration: 10000,
      action: { label: "Kirim file", onClick: () => { void send(); } },
      cancel: { label: "Batal", onClick: () => {} },
    });
  }

  const urgent = left !== null && left <= 60_000;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted">Tes Seleksi Akuntan Pajak</p>
          </div>
          <div className="text-right">
            <div
              className={`font-serif text-3xl leading-none tabular-nums ${urgent ? "text-danger" : ""}`}
            >
              {left === null ? "--:--" : fmt(left)}
            </div>
            <div className="mt-0.5 text-xs text-muted">sisa waktu</div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl items-start gap-8 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm leading-relaxed">
            Di bagian ini kamu boleh membuka Excel dan jendela lain.
            Perpindahan jendela hanya dicatat dan tidak menghentikan tes.
          </p>

          <section className="rounded-xl border border-line bg-card p-5 sm:p-6">
            <Heading
              n={1}
              title="Unduh materi"
              sub="Kerjakan di Excel pada laptopmu. Waktu tetap berjalan."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <a
                href={`/tes/${slug}/mulai/unduh/soal`}
                className="flex items-center gap-3 rounded-lg border border-line bg-white p-3.5 text-sm font-semibold hover:border-brand"
              >
                <Icon d={DOWNLOAD} />
                <span>
                  Soal studi kasus
                  <small className="mt-0.5 block text-xs font-normal text-muted">
                    Dokumen Word, 2 soal
                  </small>
                </span>
              </a>
              <a
                href={`/tes/${slug}/mulai/unduh/lembar`}
                className="flex items-center gap-3 rounded-lg border border-line bg-white p-3.5 text-sm font-semibold hover:border-brand"
              >
                <Icon d={DOWNLOAD} />
                <span>
                  Lembar jawaban Excel
                  <small className="mt-0.5 block text-xs font-normal text-muted">
                    Sheet JU, AJP, LK, PPh Pasal 21
                  </small>
                </span>
              </a>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-card p-5 sm:p-6">
            <Heading
              n={2}
              title="Kerjakan di template Excel"
              sub="Isi sheet yang relevan pada lembar jawaban. Sistem akan menilai file yang kamu unggah."
            />
            <p className="text-sm leading-relaxed text-muted">
              Pastikan nama akun, posisi debit/kredit, nominal, dan hasil perhitungan terisi. Urutan baris boleh berbeda selama isi jawabannya jelas. Simpan file dalam format .xlsx sebelum diunggah.
            </p>
          </section>

          <section className="rounded-xl border border-line bg-card p-5 sm:p-6">
            <Heading
              n={3}
              title="Unggah file Excel"
              sub="Gunakan format Nama_Lengkap.xlsx (contoh: Desi_Salsa.xlsx). Maksimal 4 MB. Jangan mengubah nama sheet."
            />
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-3.5">
              <Icon d={FILE} />
              <div className="min-w-40 flex-1">
                {file ? (
                  <>
                    <p className="break-all text-sm font-semibold">{file.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {fmtSize(file.size)}, terunggah pukul{" "}
                      <span suppressHydrationWarning>
                        {new Date(file.at).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted">
                    Belum ada file yang diunggah.
                  </p>
                )}
              </div>
              <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-line bg-card px-3.5 text-[13px] font-semibold hover:border-brand">
                {uploading ? "Mengunggah..." : file ? "Ganti file" : "Pilih file"}
                <input
                  type="file"
                  accept=".xlsx"
                  className="sr-only"
                  disabled={uploading}
                  onChange={onFile}
                />
              </label>
            </div>
            {uploadError && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {uploadError}
              </p>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-24">
          <div className="rounded-xl border border-line bg-card p-5">
            <p className="mb-3 text-lg font-bold">Ringkasan</p>
            <div className="flex items-center justify-between border-t border-line py-2.5 text-sm">
              <span>File Excel</span>
              <span className="font-semibold">{file ? "Terunggah" : "Belum"}</span>
            </div>
            <button
              type="button"
              disabled={sending}
              onClick={onSubmit}
              className="h-12 w-full rounded-lg bg-brand font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {sending ? "Mengirim..." : "Kirim jawaban"}
            </button>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Setelah dikirim, file tidak bisa diubah.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}