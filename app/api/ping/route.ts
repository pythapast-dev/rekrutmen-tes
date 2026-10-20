import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("sections")
    .select("title, type, duration_minutes")
    .order("position");

  return Response.json({ data, error });
}