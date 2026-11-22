import assert from 'node:assert/strict';
import { test } from 'node:test';

import { secMsGecV2 } from '@/lib/audio/edge-tts';

// Reference values produced by the official Python package: edge_tts 7.3.1
// drm.generate_sec_ms_gec_v2(timestamp).
const VECTORS: [number, string][] = [
  [1795000000, '6521DCC55F99AAD7-6D04852628E3DF4D0EF33213239BDC3C48750FE37FE5E4591F28C209CE0A3FA2'],
  [1795377749.5, 'E30D87D8ADB3CC70-500D0846D9DC934B3DB9DF9EF0A1E1386226E634EF69A72A3727A3BE64C7E27A'],
  [1800000123, '99E54519B490BE5C-E162DB0977FBDCB9B86DD8148BF1BCDC3C0303176CE39852A42B415935C20654'],
  [1700000000, '2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2'],
  [1600000000, '1F5E89103EC98A08-E69D008C1241797258F0EE06F56044C11FAEC4B60F95C6AB0DB3C5E79BE2F010'],
];

test('Microsoft voice token matches the official edge-tts implementation', () => {
  for (const [ts, expected] of VECTORS) assert.equal(secMsGecV2(ts), expected, `timestamp ${ts}`);
});

test('the token is stable within a 5-minute window and changes after it', () => {
  // (1794999900 + 11644473600) is a multiple of 300, i.e. the start of a window.
  const start = 1794999900;
  assert.equal(secMsGecV2(start), secMsGecV2(start + 299));
  assert.notEqual(secMsGecV2(start), secMsGecV2(start + 300));
});
