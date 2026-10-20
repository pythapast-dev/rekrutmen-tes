// Membaca angka yang diketik kandidat: "1.500.000", "1,500,000", "11979166,17", "Rp 1.595.000", "-137.000.000"
export function parseRupiah(input: string): number | null {
  let s = input.trim().toLowerCase().replace(/^rp\.?\s*/, "").replace(/\s+/g, "");
  if (s === "") return null;

  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  }
  if (!/^[0-9.,]+$/.test(s)) return null;

  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let clean: string;

  if (dots > 0 && commas > 0) {
    // pemisah yang muncul terakhir = desimal
    const dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const dot = dec === "." ? "," : ".";
    if ((s.match(new RegExp(`\\${dec}`, "g")) ?? []).length > 1) return null;
    clean = s.split(dot).join("").replace(dec, ".");
  } else if (dots > 0) {
    if (dots > 1 || /^\d{1,3}\.\d{3}$/.test(s)) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
      clean = s.split(".").join("");
    } else clean = s;
  } else if (commas > 0) {
    if (commas > 1) {
      if (!/^\d{1,3}(,\d{3})+$/.test(s)) return null;
      clean = s.split(",").join("");
    } else clean = s.replace(",", ".");
  } else clean = s;

  const n = Number(clean);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}