import test from "node:test";
import assert from "node:assert/strict";

import {
  PERSONAS,
  buildPersonaPrompt,
  extractJsonFromThoughtResponse,
  computeWeightedScores
} from "../plugins/codex/scripts/lib/panel-review.mjs";

test("PERSONAS defines three epistemic personas", () => {
  assert.equal(PERSONAS.length, 3);
  const names = PERSONAS.map((p) => p.id);
  assert.deepEqual(names, ["empiricist", "theorist", "practitioner"]);
  for (const persona of PERSONAS) {
    assert.ok(persona.id);
    assert.ok(persona.label);
    assert.ok(persona.templateName);
  }
});

test("buildPersonaPrompt interpolates persona template with paper content", () => {
  const prompt = buildPersonaPrompt({
    templateRootDir: "plugins/codex",
    persona: PERSONAS[0],
    paperContent: "This is a test paper.",
    paperTitle: "Test Paper",
    focusText: "Focus on methods",
    venueCalibration: ""
  });
  assert.ok(prompt.includes("This is a test paper."));
  assert.ok(prompt.includes("Test Paper"));
  assert.ok(prompt.includes("Focus on methods"));
  assert.ok(prompt.includes("Empiricist"));
});

test("extractJsonFromThoughtResponse extracts JSON from THOUGHT + JSON format", () => {
  const response = 'THOUGHT:\nThis paper has good methodology but weak statistics.\n\nREVIEW JSON:\n```json\n{"persona": "empiricist", "recommendation": "major-revision", "summary": "Test", "strengths": [], "weaknesses": [], "findings": [], "questions_for_authors": [], "overall_assessment": "Test", "scores": {"originality": 3, "methodology": 2, "clarity": 3, "significance": 3, "soundness": 2, "overall": 5, "confidence": 4}}\n```';
  const result = extractJsonFromThoughtResponse(response);
  assert.equal(result.recommendation, "major-revision");
  assert.equal(result.scores.overall, 5);
});

test("extractJsonFromThoughtResponse handles plain JSON without THOUGHT wrapper", () => {
  const json = '{"recommendation": "accept", "summary": "Good", "strengths": [], "weaknesses": [], "findings": [], "questions_for_authors": [], "overall_assessment": "Test", "scores": {"originality": 3, "methodology": 3, "clarity": 3, "significance": 3, "soundness": 3, "overall": 7, "confidence": 4}}';
  const result = extractJsonFromThoughtResponse(json);
  assert.equal(result.recommendation, "accept");
});

test("computeWeightedScores computes confidence-weighted averages", () => {
  const reviews = [
    { scores: { originality: 4, methodology: 2, clarity: 3, significance: 4, soundness: 2, overall: 6, confidence: 5 } },
    { scores: { originality: 2, methodology: 3, clarity: 3, significance: 2, soundness: 3, overall: 4, confidence: 3 } },
    { scores: { originality: 3, methodology: 3, clarity: 2, significance: 3, soundness: 3, overall: 5, confidence: 4 } }
  ];
  const weighted = computeWeightedScores(reviews);
  // originality: (4*5 + 2*3 + 3*4) / (5+3+4) = (20+6+12)/12 = 38/12 = 3.17
  assert.ok(weighted.originality > 3 && weighted.originality < 3.5);
  for (const key of ["originality", "methodology", "clarity", "significance", "soundness", "overall"]) {
    assert.equal(typeof weighted[key], "number");
  }
});
