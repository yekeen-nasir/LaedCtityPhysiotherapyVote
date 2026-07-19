import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// These come from the function's own environment (set via `supabase secrets set`)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_SECRET = Deno.env.get("ADMIN_FUNCTION_SECRET")!;

function normalize(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, "");
}

function derivePassword(matricNumber: string, fullName: string): string {
  return normalize(matricNumber) + normalize(fullName);
}

function toFakeEmail(matricNumber: string): string {
  const clean = matricNumber.trim().toLowerCase().replace(/\s+/g, "");
  return `${clean}@physiovote.local`;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // --- Auth check ---
    // NOTE: this is the "simple shared secret" approach. If this template
    // is ever reused for a bigger/higher-stakes school, swap this block for:
    // verifying req.headers Authorization JWT against Supabase Auth + admins table.
    if (body.secret !== ADMIN_SECRET) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Normalize input: accept single student OR array ---
    const students = body.students
      ? body.students
      : [{ matric_number: body.matric_number, full_name: body.full_name }];

    if (!Array.isArray(students) || students.length === 0) {
      return new Response(
        JSON.stringify({ error: "No students provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const succeeded: { matric_number: string; full_name: string; }[] = [];
    const failed: { matric_number: string; reason: string }[] = [];

    for (const s of students) {
      const matric_number = (s.matric_number || "").trim();
      const full_name = (s.full_name || "").trim();

      if (!matric_number || !full_name) {
        failed.push({ matric_number: matric_number || "(missing)", reason: "Missing matric number or name" });
        continue;
      }

      const email = toFakeEmail(matric_number);
      const password = derivePassword(matric_number, full_name);

      // 1. Create the Auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // skip verification, since it's not a real email
      });

      if (authError) {
        // Most common case: matric number already registered
        failed.push({ matric_number, reason: authError.message });
        continue;
      }

      // 2. Insert matching row into students table
      const { error: dbError } = await supabaseAdmin.from("students").insert({
        id: authData.user.id,
        matric_number,
        full_name,
      });

      if (dbError) {
        // Roll back the auth user if the DB insert fails, so we don't get orphaned logins
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        failed.push({ matric_number, reason: dbError.message });
        continue;
      }

      succeeded.push({ matric_number, full_name });
    }

    return new Response(
      JSON.stringify({ succeeded, failed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});