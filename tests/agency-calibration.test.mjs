import test from "node:test";
import assert from "node:assert/strict";

import { getAgencyCalibration, SUPPORTED_AGENCIES } from "../plugins/codex/scripts/lib/agency-calibration.mjs";

test("getAgencyCalibration returns calibration for all supported agencies", () => {
  for (const agency of SUPPORTED_AGENCIES) {
    const calibration = getAgencyCalibration(agency);
    assert.ok(calibration.name, `${agency} missing name`);
    assert.ok(calibration.region, `${agency} missing region`);
    assert.ok(calibration.acceptanceRate, `${agency} missing acceptanceRate`);
    assert.ok(calibration.scoringSystem, `${agency} missing scoringSystem`);
    assert.ok(calibration.promptSection, `${agency} missing promptSection`);
  }
});

test("getAgencyCalibration returns null for unknown agencies", () => {
  assert.equal(getAgencyCalibration("fake-agency-2099"), null);
});

test("SUPPORTED_AGENCIES includes 7 European and 4 US agencies", () => {
  const eu = ["horizon", "erc", "ukri", "dfg", "anr", "snsf", "nwo"];
  const us = ["nih", "nsf", "doe", "darpa"];
  for (const a of [...eu, ...us]) {
    assert.ok(SUPPORTED_AGENCIES.includes(a), `Missing agency: ${a}`);
  }
  assert.equal(SUPPORTED_AGENCIES.length, 11);
});

test("European agencies are listed before US agencies", () => {
  const horizonIdx = SUPPORTED_AGENCIES.indexOf("horizon");
  const nihIdx = SUPPORTED_AGENCIES.indexOf("nih");
  assert.ok(horizonIdx < nihIdx, "European agencies should come first");
});
