import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTime,
  clampFraction,
  stepVolume,
  seekBy,
  cyclePlaybackRate,
  PLAYBACK_RATES,
} from './media.js';

describe('formatTime', () => {
  it('formats whole and sub-minute values', () => {
    assert.equal(formatTime(0), '0:00');
    assert.equal(formatTime(5), '0:05');
    assert.equal(formatTime(65), '1:05');
    assert.equal(formatTime(600), '10:00');
  });
  it('floors fractional seconds', () => {
    assert.equal(formatTime(9.9), '0:09');
  });
  it('returns placeholder for non-finite or negative', () => {
    assert.equal(formatTime(NaN), '--:--');
    assert.equal(formatTime(Infinity), '--:--');
    assert.equal(formatTime(-1), '--:--');
  });
});

describe('clampFraction', () => {
  it('clamps to 0..1', () => {
    assert.equal(clampFraction(-0.5), 0);
    assert.equal(clampFraction(0.5), 0.5);
    assert.equal(clampFraction(1.5), 1);
  });
  it('treats non-finite as 0', () => {
    assert.equal(clampFraction(NaN), 0);
  });
});

describe('stepVolume', () => {
  it('adds delta and clamps to 0..1', () => {
    assert.equal(stepVolume(0.5, 0.1), 0.6);
    assert.equal(stepVolume(0.95, 0.1), 1);
    assert.equal(stepVolume(0.05, -0.1), 0);
  });
});

describe('seekBy', () => {
  it('adds delta and clamps to 0..duration', () => {
    assert.equal(seekBy(10, 5, 100), 15);
    assert.equal(seekBy(98, 5, 100), 100);
    assert.equal(seekBy(2, -5, 100), 0);
  });
  it('returns current when duration is not finite', () => {
    assert.equal(seekBy(10, 5, NaN), 10);
    assert.equal(seekBy(10, 5, Infinity), 10);
  });
});

describe('cyclePlaybackRate', () => {
  it('advances through the rate list and wraps', () => {
    assert.equal(cyclePlaybackRate(0.5), 1);
    assert.equal(cyclePlaybackRate(1), 1.25);
    assert.equal(cyclePlaybackRate(2), 0.5);
  });
  it('snaps an unknown rate to the first entry', () => {
    assert.equal(cyclePlaybackRate(0.75), PLAYBACK_RATES[0]);
  });
});
