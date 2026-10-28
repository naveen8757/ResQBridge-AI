# ResQBridge AI — Prototype A

Offline-first disaster reporting, explainable rule-based risk assessment, resource coordination, community alert review, notifications, mapping, and recovery tracking.

> Safety note: risk scoring is a prototype rule system, not a validated forecasting model or official emergency warning. Open-Meteo values are weather-model output, not direct local sensor readings. Community alert drafts require human source verification and approval.

## 1. Requirements

- Node.js 22 LTS recommended (Vite 8 expects a recent Node release)
- npm
- A Supabase project
- VS Code (recommended)

## 2. Install locally on Windows

1. Extract this project folder.
2. Open the folder that contains `package.json` in VS Code.
3. In a terminal, run:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env.local` and enter your own Supabase URL and publishable key. Never paste a service-role key into this file.
5. Run the database migration described below.
6. Start the site:

   ```bash
   npm run dev
   ```

7. Build for production:

   ```bash
   npm run build
   ```

8. Run pure service tests:

   ```bash
   npm test
   ```

## 3. Supabase database setup

The application uses these tables: `profiles`, `disaster_reports`, `response_resources`, `resource_assignments`, `risk_assessments`, `recovery_tasks`, `community_alerts`, `community_alert_reviewers`, `user_notifications`, `user_notification_preferences`, `environmental_observations`, and `audit_logs`.

### Fresh Supabase project

Use Supabase CLI after logging in and linking the intended project, then apply the migration:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

You can also inspect and run `supabase/migrations/20261026000100_resqbridge_core.sql` in the SQL Editor. **Back up the database and review the migration before applying it to an existing project.** This migration uses additive statements for common existing tables, but existing column types, old constraints, or pre-existing duplicate values can still require manual reconciliation.

### Promote your first administrator

1. Register an account through the website and confirm the account if Supabase requires it.
2. In Supabase SQL Editor, run the following query after replacing the example email with your own account email:

```sql
update public.profiles p
set role = 'administrator', updated_at = now()
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('YOUR_ACCOUNT_EMAIL');
```

3. If you will use the email-alert Edge Function, register the same administrator as an alert reviewer:

```sql
insert into public.community_alert_reviewers(user_id)
select id from auth.users where lower(email) = lower('YOUR_ACCOUNT_EMAIL')
on conflict (user_id) do nothing;
```

Only grant administrator access to accounts you trust. RLS is enabled by the migration; staff-only changes require a coordinator/administrator role. The service-role key must only be configured as a server secret, never in a `VITE_` variable.

## 4. Main modules

- Dashboard: counts from Supabase, with connection and pending queue information.
- Disaster Reports: online submissions and local pending report queue with retry on reconnection.
- Disaster Map: geolocated reports on a Leaflet map; reports without coordinates remain in the list/DB but cannot be pinned.
- Environmental Monitoring: fetches current and six hourly weather-forecast indicators from Open-Meteo; simulation is separately labelled. Weather is cached in local storage and can be saved to `environmental_observations` when Supabase permissions are configured. Forecasts do not show floodwater movement or a cyclone track.
- Agricultural Impact: records community-reported crop and farmland impacts and affected-area estimates for review. These are not satellite-derived or independently verified damage estimates.
- Risk Prediction: transparent rule-based score; fresh weather is used only when location text matches. Each assessment records its components and reasons.
- Resource Coordination and Assignments: records inventory; allocation requires the `assign_resource` SQL function which locks the inventory row and validates quantity on the server.
- Community Alerts: high-severity reports create unverified drafts. A reviewer must mark the source verified and separately approve the draft. No automatic official warning is issued.
- Notifications: reads each signed-in user's notifications.
- Recovery Tracking: recovery tasks and status updates.
- Coordination Assistant: deterministic suggestions from current reports, resources, assignments, risk assessments and recovery tasks. It never dispatches resources or changes records automatically.
- PWA support: after the first online load in a supported browser, the application shell can be cached. External APIs and database operations still require connectivity; queued reports synchronize when online.

## 5. Email Edge Functions

Two folders are included under `supabase/functions/`. Email delivery needs a Resend account and carefully configured secrets, including `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESQBRIDGE_TEST_EMAIL`, and `RESQBRIDGE_SERVICE_ROLE_KEY`. Configure them in Supabase Edge Function secrets only. Deploy and test email functions separately; the frontend build does not prove email delivery works. Do not send a real public alert without authorized verification and approval.

## 6. Vercel deployment

1. Push the clean project to a private or appropriate Git repository.
2. Import the repository in Vercel.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel Project Settings → Environment Variables for Preview/Production as needed.
6. Deploy, then set the deployed site URL in Supabase Auth → URL Configuration. Add the exact redirect URLs used by the project.
7. Test login, database reads/writes, role access, map tiles, weather fetch, risk assessment saving, alert review, notifications, recovery updates, and offline-report retry on the deployed website.

The included `vercel.json` rewrites frontend paths to `index.html`. Deployment is not performed by this source archive; you must authorize/connect your own Vercel and Supabase accounts.

## 7. Verification status and limitations

- Included automated tests cover the pure risk-scoring and coordination-suggestion functions (`npm test`); the packaging environment ran 8 tests and all 8 passed.
- `node_modules` is intentionally excluded from the ZIP. Run `npm install` on Windows before running Vite or the linter.
- A fresh production build could not be verified in the packaging environment: the uploaded `node_modules` originated from Windows and the dependency reinstall timed out here. Run `npm run build` on your Windows computer after `npm install`; do not treat the build as verified until that succeeds.
- Database-dependent workflows require the migration and your own Supabase configuration.
- Weather scoring thresholds are illustrative and not validated for a real location or disaster.
- Live cyclone paths, flood movement tracking, satellite-based farmland damage estimates, and a trained/validated predictive AI model are not included as verified data services. Do not present simulations or manual field reports as satellite-confirmed estimates.
