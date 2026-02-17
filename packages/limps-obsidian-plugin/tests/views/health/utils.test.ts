import test from "node:test";
import assert from "node:assert/strict";
import { formatDuration } from "../../../src/views/health/utils.js";

test("formatDuration returns seconds for < 60s", () => {
  assert.equal(formatDuration(5000), "5s");
  assert.equal(formatDuration(0), "0s");
  assert.equal(formatDuration(59_999), "59s");
});

test("formatDuration returns minutes and seconds for < 60m", () => {
  assert.equal(formatDuration(60_000), "1m 0s");
  assert.equal(formatDuration(90_000), "1m 30s");
  assert.equal(formatDuration(3_540_000), "59m 0s");
});

test("formatDuration returns hours and minutes for >= 60m", () => {
  assert.equal(formatDuration(3_600_000), "1h 0m");
  assert.equal(formatDuration(7_380_000), "2h 3m");
});
