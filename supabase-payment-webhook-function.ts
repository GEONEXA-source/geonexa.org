// supabase/functions/payment-webhook/index.ts
//
// Deploy with: supabase functions deploy payment-webhook --no-verify-jwt
// (--no-verify-jwt because Flutterwave calls this directly, with no Supabase
// user session — it authenticates itself via the verif-hash header instead)
//
// Set secrets:
//   supabase secrets set FLW_WEBHOOK_HASH=your-chosen-secret-string
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... (usually already set)
//
// Then in the Flutterwave dashboard → Settings → Webhooks:
//   - Set the webhook URL to this function's URL
//   - Set the "Secret hash" to the exact same string as FLW_WEBHOOK_HASH

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FLW_WEBHOOK_HASH = Deno.env.get("MyGeoNexa2026Secret");
const SUPABASE_URL = Deno.env.get("https://ogwckglzluhjwmucrodb.supabase.co");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nd2NrZ2x6bHVoandtdWNyb2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDgyNjQsImV4cCI6MjEwMjAyNDI2NH0.kbRoGMj9qjbFKkIzoO3iaz4baRCJX1w04lexpV7-DIc");

const SUBSCRIPTION_DAYS = 30;

Deno.serve(async (req) => {
  try {
    // Verify this request really came from Flutterwave
    const signature = req.headers.get("verif-hash");
    if (!signature || signature !== FLW_WEBHOOK_HASH) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();
    const data = payload.data ?? {};
    const txRef = data.tx_ref;
    const status = data.status; // 'successful', 'failed', etc.

    if (!txRef) {
      return new Response("Missing tx_ref", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_SERVICE_ROLE_KEY ?? "");

    const { data: payment, error: findError } = await supabase
      .from("payments")
      .select("id, user_id")
      .eq("tx_ref", txRef)
      .single();

    if (findError || !payment) {
      console.error("Webhook: payment row not found for", txRef, findError);
      return new Response("Payment record not found", { status: 404 });
    }

    if (status === "successful") {
      await supabase.from("payments").update({
        status: "successful",
        flw_transaction_id: String(data.id ?? ""),
        confirmed_at: new Date().toISOString(),
      }).eq("tx_ref", txRef);

      const expiresAt = new Date(Date.now() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

      await supabase.from("profiles").update({
        is_subscribed: true,
        subscription_expires_at: expiresAt,
      }).eq("id", payment.user_id);
    } else {
      await supabase.from("payments").update({ status: "failed" }).eq("tx_ref", txRef);
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("payment-webhook error:", err);
    return new Response("Server error", { status: 500 });
  }
});
