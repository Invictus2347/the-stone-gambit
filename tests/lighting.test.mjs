import test from 'node:test';
import assert from 'node:assert/strict';
import { lightingProfile } from '../src/lighting.js';

test('phone lighting lifts exposure and shadow fill without changing desktop lighting', () => {
  const desktop = lightingProfile(1440, 900);
  const phone = lightingProfile(390, 844, true);
  assert.deepEqual(desktop, {
    exposure: 1.02,
    environment: 0.3,
    hemisphere: 0.45,
    key: 2.8,
    fill: 0.75,
    fog: 0.021,
  });
  for (const key of ['exposure', 'environment', 'hemisphere', 'key', 'fill'])
    assert.ok(phone[key] > desktop[key]);
  assert.ok(phone.fog < desktop.fog, 'portrait camera distance must not bury the board in fog');
  assert.equal(phone.exposure, 1.65);
});

test('phone brightness persists in landscape and at the camera breakpoint', () => {
  assert.deepEqual(lightingProfile(390, 844, true), lightingProfile(844, 390, true));
  assert.deepEqual(lightingProfile(649, 900, true), lightingProfile(650, 900, true));
  assert.equal(lightingProfile(844, 390, false).exposure, 1.02);
});
