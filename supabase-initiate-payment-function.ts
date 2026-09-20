// supabase/functions/initiate-payment/index.ts
//
// Deploy with: supabase functions deploy initiate-payment
// Set secrets first:
//   supabase secrets set FLW_SECRET_KEY=FLWSECK-...
//
// Get your Flutterwave secret key from: https://dashboard.flutterwave.com/settings/apis
// Use a TEST key (starts with FLWSECK_TEST-) while developing — it doesn't move real money.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FLW_SECRET_KEY = Deno.env.get("FLW_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const SUBSCRIPTION_AMOUNT_RWF = 2000; // adjust your pricing here

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Client with the user's own token, just to identify who's paying
    const userClient = createClient(SUPABASE_URL ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { phone_number, network } = await req.json();
    if (!phone_number || !network) {
      return new Response(JSON.stringify({ error: "phone_number and network ('MTN' or 'AIRTEL') are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txRef = `GEONEXA-${user.id.slice(0, 8)}-${Date.now()}`;

    // Service-role client to write the payments row regardless of RLS
    const adminClient = createClient(SUPABASE_URL ?? "", SUPABASE_SERVICE_ROLE_KEY ?? "");
    await adminClient.from("payments").insert({
      user_id: user.id,
      tx_ref: txRef,
      amount: SUBSCRIPTION_AMOUNT_RWF,
      currency: "RWF",
      network,
      phone_number,
      status: "pending",
    });

    const flwRes = await fetch("https://api.flutterwave.com/v3/charges?type=mobile_money_rwanda", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FLW_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone_number,
        amount: SUBSCRIPTION_AMOUNT_RWF,
        currency: "RWF",
        email: user.email,
        tx_ref: txRef,
        network, // 'MTN' or 'AIRTEL'
        fullname: user.email,
      }),
    });

    const flwData = await flwRes.json();

    if (flwData.status !== "success") {
      await adminClient.from("payments").update({ status: "failed" }).eq("tx_ref", txRef);
      console.error("Flutterwave charge init failed:", flwData);
      return new Response(JSON.stringify({ error: "Payment could not be started", details: flwData.message }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For Rwanda MoMo, the customer confirms via a USSD prompt on their phone.
    // flwData.meta.authorization may contain a redirect URL for some flows too.
    return new Response(JSON.stringify({
      tx_ref: txRef,
      message: "Charge initiated — approve the prompt sent to your phone.",
      redirect: flwData.meta?.authorization?.redirect ?? null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("initiate-payment error:", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
