export type Letter = "D" | "I" | "S" | "C";
export type Net = Record<Letter, number>;
export const LETTERS: Letter[] = ["D", "I", "S", "C"];

// ====== USULAN KRITERIA: ubah sesuai keputusan koko/Hamul ======
// Bobot "seberapa diinginkan" tiap gaya untuk posisi Akuntan Pajak.
export const IDEAL: Record<Letter, number> = { C: 0.4, S: 0.3, D: 0.2, I: 0.1 };
// ================================================================

const NET_MAX = 24; // jumlah nomor soal DISC

const INFO: Record<Letter, { nama: string; gaya: string; kuat: string; waspada: string }> = {
  D: {
    nama: "Tegas",
    gaya: "berorientasi hasil, berani mengambil keputusan, mandiri",
    kuat: "mandiri dan cepat bergerak",
    waspada: "bisa kurang sabar pada detail dan prosedur",
  },
  I: {
    nama: "Ekspresif",
    gaya: "komunikatif, antusias, mudah bergaul",
    kuat: "luwes berinteraksi dengan banyak pihak",
    waspada: "bisa kurang rinci pada pekerjaan administratif",
  },
  S: {
    nama: "Stabil",
    gaya: "tenang, konsisten, nyaman dengan ritme kerja yang teratur",
    kuat: "dapat diandalkan dan bekerja secara teratur",
    waspada: "bisa lambat beradaptasi pada perubahan mendadak",
  },
  C: {
    nama: "Teliti",
    gaya: "cermat, analitis, patuh pada aturan dan standar",
    kuat: "akurat pada angka dan prosedur",
    waspada: "bisa terlalu berhati-hati sehingga lambat memutuskan",
  },
};

// Kecocokan profil dengan kriteria, 0-100 (50 = netral).
export function discFit(net: Net): number {
  const avg = LETTERS.reduce((a, l) => a + IDEAL[l], 0) / LETTERS.length;
  const coef = LETTERS.map((l) => IDEAL[l] - avg);
  const s = LETTERS.reduce((a, l, i) => a + coef[i] * net[l], 0);
  const maxPossible = NET_MAX * (Math.max(...coef) - Math.min(...coef));
  if (maxPossible === 0) return 50;
  return Math.max(0, Math.min(100, 50 + (50 * s) / maxPossible));
}

// Gambaran gaya kerja dari aturan (tanpa AI).
export function describeProfile(net: Net) {
  const ranked = [...LETTERS].sort((a, b) => net[b] - net[a]);
  const top = net[ranked[0]];
  const bottom = net[ranked[ranked.length - 1]];
  if (top === bottom) {
    return {
      ringkas: "Profil seimbang, tidak ada gaya kerja yang menonjol.",
      kuat: [] as string[],
      waspada: [] as string[],
    };
  }
  const p = ranked[0];
  const s = net[ranked[1]] > 0 ? ranked[1] : null;
  const ringkas =
    `Dominan ${INFO[p].nama} (${INFO[p].gaya})` +
    (s ? `, didukung ${INFO[s].nama} (${INFO[s].gaya}).` : ".");
  const kuat = [INFO[p].kuat, ...(s ? [INFO[s].kuat] : [])];
  const waspada = [INFO[p].waspada];
  return { ringkas, kuat, waspada };
}