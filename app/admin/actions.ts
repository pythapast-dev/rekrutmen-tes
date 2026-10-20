"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { gradeDisc } from "@/lib/engine";

export async function recomputeDisc() {
  if (!(await isAdmin())) return;

  const { data: secs } = await supabase
    .from("sections")
    .select("id")
    .eq("type", "disc");
  const { data: atts } = await supabase.from("attempts").select("id").limit(2000);

  for (const s of secs ?? []) {
    for (const a of atts ?? []) {
      await gradeDisc(a.id, s.id);
    }
  }
  revalidatePath("/admin");
}