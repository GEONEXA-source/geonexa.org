# GeoNEXA Professional Deployment Checklist

## 1. GitHub Pages
Upload/push the contents of this folder to the `main` branch of the `geonexa.org` repository.
GitHub Pages should publish from `main` / root.

## 2. Supabase SQL
Run these in Supabase SQL Editor:
- `sql-map-search.sql` (after confirming `cadastral.parcels.geom` exists).
- `sql-role-security-and-engineer.sql`.

## 3. Edge Functions
Deploy these functions from their corresponding `.ts` files:
- `ai-assistant` → `supabase-ai-assisatant-function.ts`
- `initiate-payment` → `supabase-initiate-payment-function.ts`
- `payment-webhook` → `supabase-payment-webhook-function.ts`
- `admin-user-management` → `supabase-admin-user-management-function.ts`

For `admin-user-management`, the server must have:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Never put the service-role key in `config.js` or any GitHub Pages file.

## 4. Payments
Configure Flutterwave Mobile Money Rwanda and set:
- `FLW_SECRET_KEY` for `initiate-payment`
- `FLW_WEBHOOK_HASH` for `payment-webhook`
- `SUPABASE_SERVICE_ROLE_KEY` for server-side subscription updates

The webhook changes `profiles.is_subscribed` and `subscription_expires_at` after a successful payment.

## 5. Engineer access
Create an account with role `engineer` (or `surveyor`). Login routes the user to `engineer-panel.html`.
An engineer without an active subscription is sent to the subscription page before the workspace opens.

## 6. Admin access
For security, create the first admin account manually in Supabase by setting its `profiles.role` to `admin`.
Public signup never offers the admin role.
The Admin Control Center lists users and payment information and can permanently delete another auth user through the protected Edge Function.

## 7. PDF reports
The report PDF generator is local (`pdf-generator.js`), so the Download PDF button no longer depends on jsPDF/CDN availability. Only an active subscriber can download the full report. Free users see the 40% preview.

## 8. Cache
The service worker is bumped to `geonexa-cache-v4`. If a device still shows an old UI, hard-refresh once or clear the site's cached data.
