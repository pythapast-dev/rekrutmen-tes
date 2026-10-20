import { getDiscProfile } from "@/lib/disc-profiles";
export type DiscMap = Record<string, { p: string; k: string }>;
export type Letter = "D" | "I" | "S" | "C";
const LETTERS: Letter[] = ["D", "I", "S", "C"];

// Tabel konversi disalin dari Sheet3 workbook DISC asli.
const GRAPH1: Record<number, (number | null)[]> = {
  0: [-6, -7, -5.7, -6],
  1: [-5.3, -4.6, -4.3, -4.7],
  2: [-4, -2.5, -3.5, -3.5],
  3: [-2.5, -1.3, -1.5, -1.5],
  4: [-1.7, 1, -0.7, 0.5],
  5: [-1.3, 3, 0.5, 2],
  6: [0, 3.5, 1, 3],
  7: [0.5, 5.3, 2.5, 5.3],
  8: [1, 5.7, 3, 5.7],
  9: [2, 6, 4, 6],
  10: [3, 6.5, 4.6, 6.3],
  11: [3.5, 7, 5, 6.5],
  12: [4, 7, 5.7, 6.7],
  13: [4.7, 7, 6, 7],
  14: [5.3, 7, 6.5, 7.3],
  15: [6.5, 7, 6.5, 7.3],
  16: [7, 7.5, 7, 7.3],
  17: [7, 7.5, 7, 7.5],
  18: [7, 7.5, 7, 8],
  19: [7.5, 7.5, 7.5, 8],
  20: [7.5, 8, 7.5, 8]
};
const GRAPH2: Record<number, (number | null)[]> = {
  0: [7.5, 7, 7.5, 7.5],
  1: [6.5, 6, 7, 7],
  2: [4.3, 4, 6, 5.6],
  3: [2.5, 2.5, 4, 4],
  4: [1.5, 0.5, 2.5, 2.5],
  5: [0.5, 0, 1.5, 1.5],
  6: [0, -2, 0.5, 0.5],
  7: [-1.3, -3.5, -1.3, 0],
  8: [-1.5, -4.3, -2, -1.3],
  9: [-2.5, -5.3, -3, -2.5],
  10: [-3, -6, -4.3, -3.5],
  11: [-3.5, -6.5, -5.3, -5.3],
  12: [-4.3, -7, -6, -5.7],
  13: [-5.3, -7.2, -6.5, -6],
  14: [-5.7, -7.2, -6.7, -6.5],
  15: [-6, -7.2, -6.7, -7],
  16: [-6.5, -7.3, -7, -7.3],
  17: [6.7, -7.3, -7.2, -7.5],
  18: [7, -7.3, -7.3, -7.7],
  19: [-7.3, -7.5, -7.5, -7.9],
  20: [-7.5, -8, -8, -8]
};
const GRAPH3: Record<number, (number | null)[]> = {
  "-22": [-8, -8, -8, -7.5],
  "-21": [-7.5, -8, -8, -7.3],
  "-20": [-7, -8, -8, -7.3],
  "-19": [-6.8, -8, -8, -7],
  "-18": [-6.75, -7, -7.5, -6.7],
  "-17": [-6.7, -6.7, -7.3, -6.7],
  "-16": [-6.5, -6.7, -7.3, -6.7],
  "-15": [-6.3, -6.7, -7, -6.5],
  "-14": [-6.1, -6.7, -6.5, -6.3],
  "-13": [-5.9, -6.7, -6.5, -6],
  "-12": [-5.7, -6.7, -6.5, -5.85],
  "-11": [-5.3, -6.7, -6.5, -5.85],
  "-10": [-4.3, -6.5, -6, -5.7],
  "-9": [-3.5, -6, -4.7, -4.7],
  "-8": [-3.25, -5.7, -4.3, -4.3],
  "-7": [-3, -4.7, -3.5, -3.5],
  "-6": [-2.75, -4.3, -3, -3],
  "-5": [-2.5, -3.5, -2, -2.5],
  "-4": [-1.5, -3, -1.5, -0.5],
  "-3": [-1, -2, -1, 0],
  "-2": [-0.5, -1.5, -0.5, 0.3],
  "-1": [-0.25, 0, 0, 0.5],
  0: [0, 0.5, 1, 1.5],
  1: [0.5, 1, 1.5, 3],
  2: [0.7, 1.5, 2, 4],
  3: [1, 3, 3, 4.3],
  4: [1.3, 4, 3.5, 5.5],
  5: [1.5, 4.3, 4, 5.7],
  6: [2, 5, null, 6],
  7: [2.5, 5.5, 4.7, 6.3],
  8: [3.5, 6.5, 5, 6.5],
  9: [4, 6.7, 5.5, 6.7],
  10: [4.7, 7, 6, 7],
  11: [4.85, 7.3, 6.2, 7.3],
  12: [5, 7.3, 6.3, 7.3],
  13: [5.5, 7.3, 6.5, 7.3],
  14: [6, 7.3, 6.7, 7.3],
  15: [6.3, 7.3, 7, 7.3],
  16: [6.5, 7.3, 7.3, 7.3],
  17: [6.7, 7.3, 7.3, 7.5],
  18: [7, 7.5, 7.3, 8],
  19: [7.3, 8, 7.3, 8],
  20: [7.3, 8, 7.5, 8],
  21: [7.5, 8, 8, 8],
  22: [8, 8, 8, 8]
};
function convert(table: Record<number, (number | null)[]>, raw: Record<Letter, number>): Record<Letter, number> {
  const cols: Record<Letter, number> = { D: 0, I: 1, S: 2, C: 3 };
  const out = {} as Record<Letter, number>;
  for (const letter of LETTERS) {
    const row = table[raw[letter]];
    // Excel VLOOKUP pada sel kosong menghasilkan 0 untuk konteks formula workbook ini.
    out[letter] = Number(row?.[cols[letter]] ?? 0);
  }
  return out;
}

function classifyGraph(g: Record<Letter, number>): string {
  const rules: Array<[string, (g: Record<Letter, number>) => boolean]> = [
    ['C', (g) => g.D <= 0 && g.I <= 0 && g.S <= 0 && g.C > 0],
    ['D', (g) => g.D > 0 && g.I <= 0 && g.S <= 0 && g.C <= 0],
    ['C-D', (g) => g.D > 0 && g.I <= 0 && g.S <= 0 && g.C > 0 && g.C >= g.D],
    ['I-D', (g) => g.D > 0 && g.I > 0 && g.S <= 0 && g.C <= 0 && g.I >= g.D],
    ['I-D-C', (g) => g.D > 0 && g.I > 0 && g.S <= 0 && g.C > 0 && g.I >= g.D && g.D >= g.C],
    ['I-D-S', (g) => g.D > 0 && g.I > 0 && g.S > 0 && g.C <= 0 && g.I >= g.D && g.D >= g.S],
    ['I-S-D', (g) => g.D > 0 && g.I > 0 && g.S > 0 && g.C <= 0 && g.I >= g.S && g.S >= g.D],
    ['S-D-C ', (g) => g.D > 0 && g.I <= 0 && g.S > 0 && g.C > 0 && g.S >= g.D && g.D >= g.C],
    ['D-I', (g) => g.D > 0 && g.I > 0 && g.S <= 0 && g.C <= 0 && g.D >= g.I],
    ['D-I-S', (g) => g.D > 0 && g.I > 0 && g.S > 0 && g.C <= 0 && g.D >= g.I && g.I >= g.S],
    ['D-S ', (g) => g.D > 0 && g.I <= 0 && g.S > 0 && g.C <= 0 && g.D >= g.S],
    ['C-I-S', (g) => g.D <= 0 && g.I > 0 && g.S > 0 && g.C > 0 && g.C >= g.I && g.I >= g.S],
    ['C-S-I', (g) => g.D <= 0 && g.I > 0 && g.S > 0 && g.C > 0 && g.C >= g.S && g.S >= g.I],
    ['I-S-C / I-C-S', (g) => g.D <= 0 && g.I > 0 && g.S > 0 && g.C > 0 && g.I >= g.S && g.I >= g.C],
    ['S', (g) => g.D <= 0 && g.I <= 0 && g.S > 0 && g.C <= 0],
    ['C-S', (g) => g.D <= 0 && g.I <= 0 && g.S > 0 && g.C > 0 && g.C >= g.S],
    ['S-C', (g) => g.D <= 0 && g.I <= 0 && g.S > 0 && g.C > 0 && g.S >= g.C],
    ['D-C', (g) => g.I <= 0 && g.S <= 0 && g.D > 0 && g.C > 0 && g.D >= g.C],
    ['D-I-C', (g) => g.D > 0 && g.I > 0 && g.C > 0 && g.S <= 0 && g.D >= g.I && g.I >= g.C],
    ['D-S-I', (g) => g.D > 0 && g.S > 0 && g.I > 0 && g.C <= 0 && g.D >= g.S && g.S >= g.I],
    ['D-S-C', (g) => g.D > 0 && g.S > 0 && g.C > 0 && g.I <= 0 && g.D >= g.S && g.S >= g.C],
    ['D-C-I', (g) => g.D > 0 && g.I > 0 && g.C > 0 && g.S <= 0 && g.D >= g.C && g.C >= g.I],
    ['D-C-S', (g) => g.D > 0 && g.S > 0 && g.C > 0 && g.I <= 0 && g.D >= g.C && g.C >= g.S],
    ['I', (g) => g.D <= 0 && g.S <= 0 && g.C <= 0 && g.I > 0],
    ['I-S', (g) => g.I > 0 && g.S > 0 && g.D <= 0 && g.C <= 0 && g.I >= g.S],
    ['I-C', (g) => g.I > 0 && g.C > 0 && g.D <= 0 && g.S <= 0 && g.I >= g.C],
    ['I-C-D', (g) => g.D > 0 && g.I > 0 && g.C > 0 && g.S <= 0 && g.I >= g.C && g.C >= g.D],
    ['I-C-S', (g) => g.D <= 0 && g.I > 0 && g.S > 0 && g.C > 0 && g.I >= g.C && g.C >= g.S],
    ['S-D', (g) => g.D > 0 && g.I <= 0 && g.S > 0 && g.C <= 0 && g.S >= g.D],
    ['S-I', (g) => g.I > 0 && g.S > 0 && g.D <= 0 && g.C <= 0 && g.S >= g.I],
    ['S-D-I', (g) => g.D > 0 && g.I > 0 && g.S > 0 && g.C <= 0 && g.S >= g.D && g.D >= g.I],
    ['S-I-D', (g) => g.D > 0 && g.I > 0 && g.S > 0 && g.C <= 0 && g.S >= g.I && g.I >= g.D],
    ['S-I-C', (g) => g.I > 0 && g.S > 0 && g.C > 0 && g.D <= 0 && g.S >= g.I && g.I >= g.C],
    ['S-C-D', (g) => g.D > 0 && g.I <= 0 && g.S > 0 && g.C > 0 && g.S >= g.C && g.C >= g.D],
    ['S-C-I', (g) => g.I > 0 && g.S > 0 && g.C > 0 && g.D <= 0 && g.S >= g.C && g.C >= g.I],
    ['C-I', (g) => g.I > 0 && g.C > 0 && g.D <= 0 && g.S <= 0 && g.C >= g.I],
    ['C-D-I', (g) => g.D > 0 && g.I > 0 && g.C > 0 && g.S <= 0 && g.C >= g.D && g.D >= g.I],
    ['C-D-S', (g) => g.D > 0 && g.S > 0 && g.C > 0 && g.I <= 0 && g.C >= g.D && g.D >= g.S],
    ['C-I-D', (g) => g.D > 0 && g.I > 0 && g.C > 0 && g.S <= 0 && g.C >= g.I && g.I >= g.D],
    ['C-S-D', (g) => g.D > 0 && g.S > 0 && g.C > 0 && g.I <= 0 && g.C >= g.S && g.S >= g.D],
  ];
  return rules.find(([, matches]) => matches(g))?.[0] ?? "Profil campuran";
}

/** Scoring P/K mengikuti pemetaan pilihan dan tabel konversi pada workbook sumber. */
export function scoreDisc(items: { map: DiscMap | null; answer: string | null | undefined }[]) {
  const P: Record<Letter, number> = { D: 0, I: 0, S: 0, C: 0 };
  const K: Record<Letter, number> = { D: 0, I: 0, S: 0, C: 0 };
  let complete = 0;
  let mappedAnswers = 0;
  for (const { map, answer } of items) {
    if (!map || !answer) continue;
    let pick: { p?: string; k?: string };
    try { pick = JSON.parse(answer); } catch { continue; }
    if (pick.p && pick.k) complete++;
    const lp = pick.p ? map[pick.p]?.p : undefined;
    const lk = pick.k ? map[pick.k]?.k : undefined;
    if (lp && (lp in P || lp === "*")) { mappedAnswers++; if (lp in P) P[lp as Letter]++; }
    if (lk && (lk in K || lk === "*")) { mappedAnswers++; if (lk in K) K[lk as Letter]++; }
  }
  const net: Record<Letter, number> = { D: P.D-K.D, I: P.I-K.I, S: P.S-K.S, C: P.C-K.C };
  const graph1 = convert(GRAPH1, P);
  const graph2 = convert(GRAPH2, K);
  const graph3 = convert(GRAPH3, net);
  const type = complete < items.length || mappedAnswers < items.length * 2
    ? "Belum lengkap"
    : classifyGraph(graph3).trim();
  const profile = getDiscProfile(type);
  return { P, K, net, graph1, graph2, graph3, complete, mappedAnswers, type, profile };
}
