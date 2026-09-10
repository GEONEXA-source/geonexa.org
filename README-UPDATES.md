# GeoNEXA AI — updated deployment package

## What changed
- Map Explorer searches UPI plus province/district/sector/cell text, then falls back to Rwanda place search.
- Map Explorer -> Analyze with AI opens the dedicated AI Assistant screen.
- AI Assistant is no longer an overlay on Dashboard.
- Dashboard remains a separate dashboard screen.
- AI Assistant stores the latest analysis and provides **Generate Report**.
- Free users receive a **40% report preview**; active subscribers receive **100%** and can download a PDF.
- Added `ai-assistant.html/js` and `ai-report.html/js`.
- Fixed duplicate signup scripts.
- Fixed the subscription frontend endpoint to `initiate-payment`.
- Corrected Edge Function environment-variable lookups so secrets are read from Deno secrets rather than hard-coded values.

## Supabase requirements
1. Deploy `supabase-ai-assisatant-function.ts` as `ai-assistant`.
2. Deploy `supabase-initiate-payment-function.ts` as `initiate-payment`.
3. Deploy `supabase-payment-webhook-function.ts` as `payment-webhook`.
4. Set the required secrets: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FLW_SECRET_KEY`, `FLW_WEBHOOK_HASH`.
5. For UPI/cadastral search, expose `cadastral.parcels` with the needed columns OR run `sql-map-search.sql` after confirming the geometry column is `geom`.
6. Keep payment and subscription enforcement server-side/RLS; frontend 40%/100% gating is for the user interface and should not be treated as security by itself.

## GitHub Pages
The app remains static and uses relative page links, so it can be published at `/geonexa.org/`. After deployment, bump the service-worker cache version in `sw.js` to force clients to receive the new files.
