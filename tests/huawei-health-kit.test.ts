import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildHuaweiConsentUrl,
  extractHuaweiHrvSamples,
  HUAWEI_HRV_READ_SCOPES,
  isAllowedHuaweiHealthRedirect,
  isHuaweiHealthLocalProbeAllowed,
  resolveHuaweiHealthRuntimeConfig,
  summarizeHuaweiHrvSamples,
} from '@/lib/health/huawei-health-kit-core';

test('Huawei probe is local-only and never Vercel/Production', () => {
  assert.equal(isHuaweiHealthLocalProbeAllowed({ nodeEnv: 'development', host: 'localhost:3000' }), true);
  assert.equal(isHuaweiHealthLocalProbeAllowed({ nodeEnv: 'development', host: '127.0.0.1:3000' }), true);
  assert.equal(isHuaweiHealthLocalProbeAllowed({ nodeEnv: 'production', host: 'localhost:3000' }), false);
  assert.equal(isHuaweiHealthLocalProbeAllowed({ nodeEnv: 'development', vercel: '1', host: 'localhost:3000' }), false);
  assert.equal(isHuaweiHealthLocalProbeAllowed({ nodeEnv: 'development', host: 'vida-2-0.vercel.app' }), false);
});

test('Huawei consent URL requests only read scopes needed for HRV + one-week history', () => {
  const url = new URL(
    buildHuaweiConsentUrl({
      clientId: '123',
      redirectUri: 'http://localhost:3000/api/health/huawei/oauth/callback',
      state: 'state123',
    }),
  );
  const scopes = (url.searchParams.get('scope') ?? '').split(' ');
  assert.deepEqual(scopes, [...HUAWEI_HRV_READ_SCOPES]);
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('response_type'), 'code');
});

test('runtime config requires refresh token and never invents secrets', () => {
  assert.equal(resolveHuaweiHealthRuntimeConfig({}).ok, false);
  const result = resolveHuaweiHealthRuntimeConfig({
    HUAWEI_HEALTH_CLIENT_ID: 'id',
    HUAWEI_HEALTH_CLIENT_SECRET: 'secret',
    HUAWEI_HEALTH_REFRESH_TOKEN: 'refresh',
  });
  assert.equal(result.ok, true);
});

test('HRV parser extracts RMSSD only from the Huawei HRV datatype', () => {
  const payload = {
    group: [
      {
        sampleSet: [
          {
            samplePoints: [
              {
                dataTypeName: 'com.huawei.heart_rate_variability',
                startTime: 100,
                endTime: 101,
                value: [{ fieldName: 'heartRateVariabilityRMSSD', integerValue: 63 }],
              },
              {
                dataTypeName: 'com.huawei.instantaneous.heart_rate',
                value: [{ fieldName: 'bpm', integerValue: 60 }],
              },
            ],
          },
        ],
      },
    ],
  };

  const samples = extractHuaweiHrvSamples(payload);
  assert.deepEqual(samples, [{ rmssdMs: 63, startTime: 100, endTime: 101 }]);
  assert.deepEqual(summarizeHuaweiHrvSamples(samples), {
    available: true,
    sampleCount: 1,
    minRmssdMs: 63,
    maxRmssdMs: 63,
  });
});

test('site-cross redirect is allowlisted to Huawei Health domains only', () => {
  assert.equal(
    isAllowedHuaweiHealthRedirect('https://health-api.cloud.huawei.eu/healthkit/v2/sampleSet:polymerize'),
    true,
  );
  assert.equal(isAllowedHuaweiHealthRedirect('https://evil.example/healthkit/v2/sampleSet:polymerize'), false);
});
