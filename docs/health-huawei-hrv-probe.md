# Huawei Health Kit HRV Probe

Status: **local-only, read-only probe; no Production integration**.

## Purpose

Determine whether Huawei Health Kit exposes the Band's nightly HRV/RMSSD even though the current Huawei Health -> Apple Health -> Health Auto Export path does not expose HRV.

The probe asks only a narrow question:

> Does Huawei Health Kit return `com.huawei.heart_rate_variability` samples with `heartRateVariabilityRMSSD` for the authorized user?

No data is written to Huawei, Google Sheets or Vida 2.0.

## Why this route

Current observed exports contain Huawei heart rate and resting heart rate, but HRV is absent even when selected in Health Auto Export. Huawei's current Health Service Kit documentation exposes:

- datatype: `com.huawei.heart_rate_variability`;
- field: `heartRateVariabilityRMSSD`;
- unit: ms;
- cloud query availability: hours;
- source class: selected watches.

Huawei's current docs are inconsistent about the scope family: the HRV datatype page points to `heartrate.read`, while the current scope catalog describes HRV under `hearthealth.read`. The probe therefore requests both **read-only** scopes plus one-week historical access. No write scope is requested.

## Security boundary

- routes are rejected in Production;
- routes are rejected on Vercel;
- routes accept only localhost / 127.0.0.1;
- Vida authentication is still required;
- client secret and refresh token stay server-side in `.env.local`;
- tokens are never committed;
- the callback shows the refresh token once so the user can place it in `.env.local`;
- the probe response returns only availability/count/range, not raw payloads.

## Human setup in Huawei Developers

1. Sign in to HUAWEI Developers.
2. Create or select the Web app used only for this probe.
3. Enable/apply for Health Service Kit.
4. Request the minimum read permissions relevant to the probe:
   - Heart rate read;
   - Heart health read (HRV);
   - historical data: previous week.
5. Configure the redirect URI exactly as:
   `http://localhost:3000/api/health/huawei/oauth/callback`
6. Copy the app Client ID and Client Secret into `.env.local`:
   - `HUAWEI_HEALTH_CLIENT_ID`
   - `HUAWEI_HEALTH_CLIENT_SECRET`
7. Do **not** paste secrets into chat, GitHub, screenshots or docs.

Huawei may require its own app/scope review before Health Service Kit returns user data. User authorization alone cannot exceed the scopes approved for the app.

## Local flow

Add to `.env.local`:

```env
HUAWEI_HEALTH_CLIENT_ID=...
HUAWEI_HEALTH_CLIENT_SECRET=...
HUAWEI_HEALTH_REDIRECT_URI=http://localhost:3000/api/health/huawei/oauth/callback
```

Then:

1. `npm run dev`
2. Sign in to Vida 2.0 locally.
3. Open `http://localhost:3000/api/health/huawei/oauth/start`
4. Authorize the requested read scopes with the same Huawei ID used by Huawei Health.
5. Copy the returned refresh token into:
   `HUAWEI_HEALTH_REFRESH_TOKEN=...`
6. Restart `npm run dev`.
7. Open:
   `http://localhost:3000/api/health/huawei/hrv-probe?days=7`

## PASS / FAIL

**PASS** when the endpoint returns:

- `ok: true`;
- `available: true`;
- `sampleCount > 0`.

**SUPPORTED BUT EMPTY** when authorization/query works but `available: false`.

**BLOCKED** when Huawei rejects the app/scope, requires approval not yet granted, or returns permission errors.

A successful query does not yet authorize Production ingestion. It only proves the metric is technically available from Huawei Health Kit.

## Next step after PASS

If HRV is available:

1. keep the existing HAE path for all currently working metrics;
2. add Huawei Health Kit only as an HRV source;
3. persist per-metric provenance and source timestamps;
4. reconcile late Huawei data idempotently;
5. calibrate Recovery/Cardio/Deviation logic against nightly RMSSD;
6. run the private-copy ingestion acceptance gate before Production.

If HRV is unavailable, keep HRV absent/unknown in Health Intelligence and do not infer it from heart rate or stress scores.
