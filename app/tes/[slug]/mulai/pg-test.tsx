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

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function PgTest({
  slug,
  title,
  questions,
  saved,
  deadline,
  serverNow,
}: {
  slug: string;
  title: string;
  questions: Question[];
  saved: Record<string, string>;
  deadline: string;
  serverNow: string;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(saved);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [left, setLeft] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const sendingRef = useRef(false);
  const answersRef = useRef(answers);
  const ignoreRef = useRef(false); // jeda deteksi (mis. saat kotak konfirmasi)
  const violationRef = useRef(false); // cegah laporan ganda dari satu kejadian

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const send = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await chain.current.catch(() => {});
      const res = await submitSection(slug, answersRef.current);
      if (res.ok) {
        toast.success("Sesi berhasil dikirim", { description: "Jawaban pilihan ganda kamu sudah tersimpan." });
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

  // ---- Anti-curang: deteksi meninggalkan halaman ----
  const handleViolation = useCallback(
    async (type: string) => {
      if (ignoreRef.current || sendingRef.current || violationRef.current)
        return;
      violationRef.current = true;
      try {
        const res = await reportViolation(slug, type, answersRef.current);
        if (res.ended) {
          sendingRef.current = true; // hentikan interaksi lain
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

  // Blokir salin, potong, dan klik kanan
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

  function choose(qid: string, key: string) {
    setAnswers((a) => ({ ...a, [qid]: key }));
    setStatus("saving");
    chain.current = chain.current.then(async () => {
      try {
        const r = await saveAnswer(slug, qid, key);
        setStatus(r.ok ? "saved" : "error");
      } catch {
        setStatus("error");
      }
    });
  }

  function onSubmit() {
    const unanswered = questions.length - Object.keys(answers).length;
    const msg =
      unanswered > 0
        ? `Masih ada ${unanswered} soal yang belum dijawab. Kirim sekarang?`
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

  const answered = Object.keys(answers).length;
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
              {answered} dari {questions.length} terjawab
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
        <ol className="space-y-8">
          {questions.map((q, i) => (
            <li key={q.id}>
              <p className="select-none whitespace-pre-line leading-relaxed">
                <span className="mr-2 font-serif tabular-nums text-brand">
                  {i + 1}.
                </span>
                {q.body}
              </p>
              <div className="mt-3 space-y-2">
                {q.options.map((o) => (
                  <label
                    key={o.key}
                    className="flex cursor-pointer select-none items-start gap-3 rounded-lg border border-line bg-card p-3.5 text-[15px] leading-snug transition has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={o.key}
                      checked={answers[q.id] === o.key}
                      onChange={() => choose(q.id, o.key)}
                      className="mt-0.5 size-4 shrink-0 accent-brand"
                    />
                    <span>
                      <span className="font-semibold">{o.key}.</span> {o.text}
                    </span>
                  </label>
                ))}
              </div>
            </li>
          ))}
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