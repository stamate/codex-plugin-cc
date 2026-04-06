import test from "node:test";
import assert from "node:assert/strict";

import { getVenueCalibration, SUPPORTED_VENUES } from "../plugins/codex/scripts/lib/venue-calibration.mjs";

test("getVenueCalibration returns calibration for known venues", () => {
  for (const venue of SUPPORTED_VENUES) {
    const calibration = getVenueCalibration(venue);
    assert.ok(calibration.name, `${venue} missing name`);
    assert.ok(calibration.acceptanceBar, `${venue} missing acceptanceBar`);
    assert.ok(calibration.reviewCriteria, `${venue} missing reviewCriteria`);
    assert.ok(calibration.promptSection, `${venue} missing promptSection`);
  }
});

test("getVenueCalibration returns null for unknown venues", () => {
  assert.equal(getVenueCalibration("fake-venue-2099"), null);
});

test("SUPPORTED_VENUES includes major ML and science venues", () => {
  assert.ok(SUPPORTED_VENUES.includes("neurips"));
  assert.ok(SUPPORTED_VENUES.includes("icml"));
  assert.ok(SUPPORTED_VENUES.includes("iclr"));
  assert.ok(SUPPORTED_VENUES.includes("acl"));
  assert.ok(SUPPORTED_VENUES.includes("nature"));
  assert.ok(SUPPORTED_VENUES.includes("workshop"));
});
