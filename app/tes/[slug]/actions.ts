"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

export async function register(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").replace(/[\s-]/g, "");
  const consent = formData.get("consent") === "on";

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneOk = /^(\+62|62|0)8\d{7,12}$/.test(phone);

  if (fullName.length < 3 || !emailOk || !phoneOk) redirect(`/tes/${slug}?error=data`);
  if (!consent) redirect(`/tes/${slug}?error=consent`);

  const { data: test } = await supabase
    .from("tests")
    .select("id")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (!test) redirect(`/tes/${slug}?error=gagal`);

  const { data: candidate, error: candErr } = await supabase
    .from("candidates")
    .insert({ test_id: test.id, full_name: fullName, email, phone })
    .select("id")
    .single();

  if (candErr?.code === "23505") redirect(`/tes/${slug}?error=sudah`);
  if (candErr || !candidate) redirect(`/tes/${slug}?error=gagal`);

  const { data: attempt, error: attErr } = await supabase
    .from("attempts")
    .insert({ candidate_id: candidate.id })
    .select("access_token")
    .single();
  if (attErr || !attempt) redirect(`/tes/${slug}?error=gagal`);

  (await cookies()).set("attempt_token", attempt.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  redirect(`/tes/${slug}/mulai`);
}