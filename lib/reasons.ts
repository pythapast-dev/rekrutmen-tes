export type ExcelDetailEvidence = {
  label?: string;
  cell?: string;
  status?: string;
  points?: number;
  maxPoints?: number;
  explanation?: string;
};

export type ReasonInput = {
  pgScore: number | null;
  pgMax: number | null;
  filePct: number | null;
  excelDetails?: ExcelDetailEvidence[];
  violations: number;
};

const pct = (a: number | null, b: number | null) =>
  a !== null && b !== null && b > 0 ? (a / b) * 100 : null;

export function buildReasons(i: ReasonInput) {
  const strengths: string[] = [];
  const areasToImprove: string[] = [];
  const analysis: string[] = [];
  const followUps: string[] = [];
  const pg = pct(i.pgScore, i.pgMax);
  const details = i.excelDetails ?? [];
  const validDetails = details.filter((d) =>
    ["benar", "parsial", "salah", "kosong"].includes(String(d.status))
  );
  const correct = validDetails.filter((d) => d.status === "benar").length;
  const partial = validDetails.filter((d) => d.status === "parsial").length;
  const wrong = validDetails.filter((d) => d.status === "salah" || d.status === "kosong").length;

  if (pg !== null) {
    const scoreText = `${i.pgScore}/${i.pgMax} (${Math.round(pg)}%)`;
    if (pg >= 80) {
      strengths.push(`Hasil PG kuat: ${scoreText}. Sebagian besar soal dijawab benar.`);
      analysis.push("Hasil PG menjadi indikasi positif atas penguasaan materi yang diuji, tetapi rincian topik tetap perlu dilihat sebelum menyimpulkan kompetensi tertentu.");
    } else if (pg >= 60) {
      strengths.push(`Hasil PG berada pada tingkat menengah: ${scoreText}.`);
      areasToImprove.push("Periksa kembali soal PG yang salah untuk mengetahui materi yang belum konsisten dikuasai.");
    } else {
      areasToImprove.push(`Hasil PG rendah: ${scoreText}. Sebagian besar soal belum dijawab benar.`);
      followUps.push("Dalami soal PG yang salah melalui pertanyaan teknis; jangan menyimpulkan penyebabnya hanya dari skor total.");
    }
  } else {
    areasToImprove.push("Nilai PG belum tersedia, sehingga penguasaan materi dari tes ini belum dapat dinilai.");
  }

  if (i.filePct !== null) {
    const f = Math.round(i.filePct);
    if (f >= 85) {
      strengths.push(`Hasil pemeriksaan file sangat baik (${f}%). Jawaban yang diperiksa sebagian besar sesuai dengan rubrik/kunci.`);
    } else if (f >= 60) {
      areasToImprove.push(`Hasil pemeriksaan file ${f}%; masih ada komponen yang perlu ditinjau.`);
    } else {
      areasToImprove.push(`Hasil pemeriksaan file ${f}%; banyak komponen belum memenuhi rubrik penilaian.`);
    }

    if (validDetails.length) {
      analysis.push(`Rincian file: ${correct} komponen benar${partial ? `, ${partial} parsial` : ""}${wrong ? `, ${wrong} salah/kosong` : ""}.`);
      const problemLabels = validDetails
        .filter((d) => d.status === "salah" || d.status === "kosong" || d.status === "parsial")
        .map((d) => `${d.label || d.cell || "Komponen"}${d.status === "parsial" ? " (parsial)" : d.status === "kosong" ? " (kosong)" : " (perlu koreksi)"}`)
        .filter((v, idx, arr) => arr.indexOf(v) === idx)
        .slice(0, 4);
      if (problemLabels.length) {
        areasToImprove.push(`Komponen yang perlu diperiksa: ${problemLabels.join(", ")}.`);
        followUps.push("Minta kandidat menjelaskan ulang langkah pengerjaan pada komponen yang salah/parsial untuk membedakan kesalahan konsep, proses, dan ketelitian.");
      }
      const explanations = validDetails
        .filter((d) => d.explanation && (d.status === "salah" || d.status === "parsial" || d.status === "kosong"))
        .map((d) => `${d.label || d.cell || "Komponen"}: ${d.explanation}`)
        .slice(0, 3);
      analysis.push(...explanations);
    } else {
      analysis.push("Rincian per komponen file belum tersedia; analisis spesifik tentang kemampuan perhitungan belum bisa dipastikan hanya dari persentase.");
    }
  } else {
    areasToImprove.push("Nilai pemeriksaan file belum tersedia; skor akhir belum dapat dianggap lengkap.");
  }

  if (pg !== null && i.filePct !== null) {
    if (pg >= 80 && i.filePct >= 80) {
      analysis.push("Hasil PG dan file sama-sama kuat. Ini merupakan bukti yang konsisten pada dua bentuk tes, tetapi tetap bukan jaminan kinerja kerja tanpa verifikasi lanjutan.");
    } else if (pg < 60 && i.filePct >= 85) {
      analysis.push("Terlihat perbedaan antara hasil PG yang rendah dan hasil file yang tinggi. Kandidat mungkin lebih kuat pada tugas praktik dibanding tes pilihan ganda, tetapi penyebab perbedaan ini belum dapat dipastikan dari skor saja.");
      followUps.push("Bandingkan penjelasan lisan kandidat dengan langkah kerja pada file yang diunggah.");
    } else if (pg >= 80 && i.filePct < 60) {
      analysis.push("Hasil PG lebih kuat daripada hasil praktik/file. Pemahaman konsep pada soal pilihan ganda belum tercermin secara setara pada hasil file.");
      followUps.push("Minta kandidat mengerjakan ulang satu komponen file dan menjelaskan prosesnya.");
    }
  }

  if (i.violations > 0) {
    areasToImprove.push(`Catatan kepatuhan: kandidat meninggalkan halaman tes ${i.violations} kali. Catatan ini bukan ukuran kemampuan teknis dan perlu diklarifikasi sebelum ditafsirkan.`);
  }

  const recruiterSummary = areasToImprove.length === 0
    ? "Bukti yang tersedia menunjukkan hasil yang baik pada komponen yang diperiksa. Verifikasi tetap diperlukan melalui wawancara teknis dan pemeriksaan dokumen pendukung."
    : "Gunakan hasil ini sebagai dasar pendalaman, bukan satu-satunya dasar keputusan. Prioritaskan area yang disebutkan di atas dan verifikasi melalui wawancara atau tes lanjutan.";

  return { strengths, areasToImprove, analysis, followUps, recruiterSummary };
}
