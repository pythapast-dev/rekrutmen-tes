"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reportViolation, saveAnswer, submitSection } from "./actions";

type Option = { key: string; text: string };
type Question = {
  id: string;
  position: number;
  body: string;
  options: Option[];
};
type Pick = { p?: string; k?: string };

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function parsePick(s: string): Pick {
  try {
    const o = JSON.parse(s);
    return { p: o.p, k: o.k };
  } catch {
    return {};
  }
}

export default function DiscTest({
  slug,
  title,
  instructions,
  questions,
  saved,
  deadline,
  serverNow,
}: {
  slug: string;
  title: string;
  instructions: string | null;
  questions: Question[];
  saved: Record<string, string>;
  deadline: string;
  serverNow: string;
}) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<string, Pick>>(() =>
    Object.fromEntries(Object.entries(saved).map(([id, s]) => [id, parsePick(s)]))
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [left, setLeft] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const sendingRef = useRef(false);
  const picksRef = useRef(picks);
  const ignoreRef = useRef(false);
  const violationRef = useRef(false);

  const toPayload = (src: Record<string, Pick>) =>
    Object.fromEntries(
      Object.entries(src).map(([id, v]) => [id, JSON.stringify(v)])
    );

  const send = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await chain.current.catch(() => {});
      const res = await submitSection(slug, toPayload(picksRef.current));
      if (res.ok) {
        toast.success("Sesi DISC berhasil dikirim", { description: "Jawaban kamu sudah tersimpan." });
        router.refresh();
        return;
      }
    } catch {
      // jatuh ke penanganan gagal di bawah
    }
    setSending(false);
    setStatus("error");
    toast.error("Belum berhasil mengirim", { description: "Periksa koneksi internet lalu coba lagi." });
    setTimeout(() => {
      sendingRef.current = false;
    }, 3000);
  }, [slug, router]);

  // ---- Anti-curang: sama seperti Bagian 1 ----
  const handleViolation = useCallback(
    async (type: string) => {
      if (ignoreRef.current || sendingRef.current || violationRef.current) return;
      violationRef.current = true;
      try {
        const res = await reportViolation(
          slug,
          type,
          toPayload(picksRef.current)
        );
        if (res.ended) {
          sendingRef.current = true;
          router.refresh();
          return;
        }
        if (res.ok && res.max > 0) {
          setWarning(
            `Peringatan ${res.count} dari ${res.max}: kamu meninggalkan halaman tes. Jika terulang, tes dihentikan.`
          );
        }
      } catch {
        // gagal lapor (mis. offline): abaikan
      }
      setTimeout(() => {
        violationRef.current = false;
      }, 1500);
    },
    [slug, router]
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) handleViolation("tab_hidden");
    };
    const onBlur = () => handleViolation("window_blur");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [handleViolation]);

  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("contextmenu", block);
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("contextmenu", block);
    };
  }, []);

  // ---- Timer: dihitung dari jam server ----
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

  function choose(qid: string, key: string, kind: "p" | "k") {
    const other = kind === "p" ? "k" : "p";
    const cur: Pick = { ...(picksRef.current[qid] ?? {}) };
    if (cur[kind] === key) {
      delete cur[kind]; // klik ulang = batal
    } else {
      cur[kind] = key;
      if (cur[other] === key) delete cur[other]; // satu pernyataan tidak boleh P sekaligus K
    }

    picksRef.current = { ...picksRef.current, [qid]: cur };
    setPicks(picksRef.current);

    setStatus("saving");
    chain.current = chain.current.then(async () => {
      try {
        const r = await saveAnswer(slug, qid, JSON.stringify(cur));
        setStatus(r.ok ? "saved" : "error");
      } catch {
        setStatus("error");
      }
    });
  }

  function onSubmit() {
    const unanswered = questions.length - complete;
    const msg =
      unanswered > 0
        ? `Masih ada ${unanswered} nomor yang belum lengkap (P dan K). Kirim sekarang?`
        : "Kirim jawaban sekarang? Setelah dikirim tidak bisa diubah.";

    ignoreRef.current = true; // klik notifikasi konfirmasi tidak dihitung pelanggaran
    toast(msg, {
      duration: 10000,
      action: { label: "Kirim jawaban", onClick: () => { ignoreRef.current = false; void send(); } },
      cancel: { label: "Batal", onClick: () => { ignoreRef.current = false; } },
      onAutoClose: () => { ignoreRef.current = false; },
      onDismiss: () => { ignoreRef.current = false; },
    });
  }

  const complete = questions.filter((q) => {
    const v = picks[q.id];
    return v?.p && v?.k;
  }).length;
  const urgent = left !== null && left <= 60_000;
  const statusText =
    status === "saving"
      ? "Menyimpan..."
      : status === "saved"
        ? "Jawaban tersimpan otomatis."
        : status === "error"
          ? "Gagal menyimpan. Periksa koneksi. Jawabanmu tetap dikirim saat kamu menekan Kirim."
          : "Jawabanmu tersimpan otomatis setiap kali dipilih.";

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="text-xs tabular-nums text-muted">
              {complete} dari {questions.length} nomor lengkap
            </p>
          </div>
          <div
            className={`font-serif text-2xl tabular-nums ${urgent ? "text-danger" : ""}`}
          >
            {left === null ? "--:--" : fmt(left)}
          </div>
        </div>
        {warning && (
          <div
            role="alert"
            className="border-t border-danger/30 bg-danger-soft px-5 py-2 text-sm text-danger sm:px-8"
          >
            {warning}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-2xl px-5 py-6 sm:px-8">
        {instructions && (
          <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm leading-relaxed">
            {instructions}
          </p>
        )}
        <p className="mt-4 text-sm text-muted">
          <span className="font-semibold text-ink">P</span> = paling
          menggambarkan dirimu.{" "}
          <span className="font-semibold text-ink">K</span> = paling tidak
          menggambarkan dirimu.
        </p>

        <ol className="mt-6 space-y-6">
          {questions.map((q, i) => {
            const cur = picks[q.id] ?? {};
            return (
              <li
                key={q.id}
                className="rounded-xl border border-line bg-card p-4 sm:p-5"
              >
                <p className="mb-3 font-serif text-lg tabular-nums text-brand">
                  {i + 1}
                </p>
                <div className="divide-y divide-line">
                  {q.options.map((o) => (
                    <div
                      key={o.key}
                      className="flex select-none items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <p className="flex-1 text-[15px] leading-snug">{o.text}</p>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          aria-pressed={cur.p === o.key}
                          aria-label={`Paling menggambarkan: ${o.text}`}
                          onClick={() => choose(q.id, o.key, "p")}
                          className={`size-10 rounded-full border text-sm font-bold transition ${
                            cur.p === o.key
                              ? "border-brand bg-brand text-white"
                              : "border-line bg-white text-muted hover:border-brand"
                          }`}
                        >
                          P
                        </button>
                        <button
                          type="button"
                          aria-pressed={cur.k === o.key}
                          aria-label={`Paling tidak menggambarkan: ${o.text}`}
                          onClick={() => choose(q.id, o.key, "k")}
                          className={`size-10 rounded-full border text-sm font-bold transition ${
                            cur.k === o.key
                              ? "border-ink bg-ink text-white"
                              : "border-line bg-white text-muted hover:border-ink"
                          }`}
                        >
                          K
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-10 border-t border-line pt-6">
          <p className="text-sm text-muted" role="status">
            {statusText}
          </p>
          <button
            type="button"
            disabled={sending}
            onClick={onSubmit}
            className="mt-4 h-12 w-full rounded-lg bg-brand font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {sending ? "Mengirim..." : "Kirim jawaban"}
          </button>
        </div>
      </main>
    </div>
  );
}