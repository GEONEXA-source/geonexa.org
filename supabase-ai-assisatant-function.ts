// supabase/functions/ai-assistant/index.ts
//
// Deploy with: supabase functions deploy ai-assistant
// Set secrets first:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   (SUPABASE_URL and SUPABASE_ANON_KEY are already available automatically)
//
// This keeps your Anthropic API key on the server. Never put it directly
// in dashboard.js/map-explorer.js — GitHub Pages serves that JS publicly,
// and anyone could read and reuse your key from it.
//
// Also run sql-nearby-parcels-function.sql once in the Supabase SQL Editor
// so this function can ground its answers in real nearby-parcel data.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("sb_secret_IbdZla-gydhr3C6tIdg8ow_A7CKSG9F");
const SUPABASE_URL = Deno.env.get("https://ogwckglzluhjwmucrodb.supabase.co");
const SUPABASE_ANON_KEY = Deno.env.get("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nd2NrZ2x6bHVoandtdWNyb2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDgyNjQsImV4cCI6MjEwMjAyNDI2NH0.kbRoGMj9qjbFKkIzoO3iaz4baRCJX1w04lexpV7-DIc");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // tighten to your GitHub Pages origin once live
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message, context, location } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'message' string" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Forward the caller's own access token so any RLS-protected queries
    // run as that user, not as an anonymous/service role.
    const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
      global: { headers: { Authorization: authHeader } },
    });

    // If the user selected a location (map click, search, or handoff from
    // map-explorer.html), look up real nearby parcels and fold that into
    // the prompt so the assistant analyzes actual data, not guesses.
    let locationContext = "";
    if (location && typeof location.lat === "number" && typeof location.lng === "number") {
      locationContext = `\n\nThe user selected this location: ${location.label ?? ""} (lat ${location.lat}, lng ${location.lng}).`;

      const { data: nearby, error: nearbyError } = await supabase.rpc("get_nearby_parcels", {
        search_lat: location.lat,
        search_lng: location.lng,
        radius_m: 2000,
      });

      if (nearbyError) {
        console.error("get_nearby_parcels error:", nearbyError);
        locationContext += " No parcel data is available for this location yet — the platform's spatial tables are still being populated. Give general guidance about what factors would normally be checked for this kind of location instead of inventing numbers.";
      } else if (!nearby || nearby.length === 0) {
        locationContext += " No parcels are recorded within 2km of this location yet. Give general guidance about what factors would normally be checked (road access, flood risk, slope, zoning, nearby infrastructure) instead of inventing numbers.";
      } else {
        const summary = nearby.slice(0, 5).map((p: any) =>
          `- ${p.upi ?? p.parcel_id ?? "Parcel"} in ${p.sector ?? p.district ?? "unknown sector"}, ${Math.round(p.distance_m)}m away`
        ).join("\n");
        locationContext += ` Nearby recorded parcels:\n${summary}\n\nBase your analysis on this real data. Do not invent suitability scores or risk levels that aren't supported by it.`;
      }
    }

    const systemPrompt = `You are the GeoNEXA AI Assistant, a property and land intelligence
assistant for a Rwanda-focused geospatial platform. You help users understand
land suitability, spatial risk, boundary disputes, and valuation concepts for
Rwandan parcels (organized by province, district, sector, cell, village).
Be concise and practical. Current user type: ${context?.user_type ?? "unknown"}.${locationContext}`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic API error:", errText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await anthropicRes.json();
    const reply = data.content?.find((b: { type: string }) => b.type === "text")?.text
      ?? "No response received.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-assistant function error:", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
