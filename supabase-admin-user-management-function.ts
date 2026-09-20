// Deploy as: admin-user-management
// Required Supabase secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing authorization token" }, 401);

    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: authData, error: authError } = await anon.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: adminProfile, error: profileError } = await adminClient
      .from("profiles").select("role").eq("id", authData.user.id).single();
    if (profileError || adminProfile?.role !== "admin") return json({ error: "Admin access required" }, 403);

    if (req.method === "GET") {
      const { data: profiles, error: pError } = await adminClient.from("profiles").select("*").order("created_at", { ascending: false });
      if (pError) return json({ error: pError.message }, 500);
      const { data: payments } = await adminClient.from("payments").select("*").order("created_at", { ascending: false }).limit(5000);
      const { data: authUsers, error: uError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (uError) return json({ error: uError.message }, 500);
      const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
      const payById = new Map<string, any[]>();
      for (const pay of (payments || [])) { const arr = payById.get(pay.user_id) || []; arr.push(pay); payById.set(pay.user_id, arr); }
      const users = (authUsers.users || []).map((u: any) => ({ id: u.id, email: u.email || "", created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, ...(byId.get(u.id) || {}), payments: payById.get(u.id) || [] }));
      return json({ users });
    }

    if (req.method === "POST") {
      const body = await req.json();
      if (body.action !== "delete" || !body.user_id) return json({ error: "Use action=delete and provide user_id" }, 400);
      if (body.user_id === authData.user.id) return json({ error: "You cannot delete your own admin account from this panel." }, 400);
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(body.user_id);
      if (deleteError) return json({ error: deleteError.message }, 500);
      await adminClient.from("profiles").delete().eq("id", body.user_id);
      return json({ success: true });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected server error" }, 500);
  }
});
