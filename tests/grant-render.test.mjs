import test from "node:test";
import assert from "node:assert/strict";

import { renderGrantReviewResult, renderGrantPanelReviewResult } from "../plugins/codex/scripts/lib/render.mjs";

test("renderGrantReviewResult renders criterion scores and grant-specific sections", () => {
  const output = renderGrantReviewResult(
    {
      parsed: {
        recommendation: "fund-with-revisions",
        impact_score: 3,
        summary: "Strong proposal with some approach gaps.",
        criterion_scores: {
          significance: { score: 2, rationale: "High significance" },
          innovation: { score: 3, rationale: "Moderately innovative" },
          approach: { score: 4, rationale: "Some methodology concerns" },
          investigator: { score: 2, rationale: "Strong team" },
          environment: { score: 1, rationale: "Excellent facilities" }
        },
        strengths: ["Novel approach", "Strong team"],
        weaknesses: ["Underpowered aim 2"],
        findings: [],
        budget_assessment: "Budget is reasonable but personnel costs need justification.",
        timeline_assessment: "Timeline is ambitious but feasible.",
        risk_assessment: "Moderate risk in aim 3.",
        recommendations_for_revision: ["Add power analysis for aim 2"]
      },
      rawOutput: "{}",
      parseError: null
    },
    { reviewLabel: "Grant Review", targetLabel: "Test Proposal" }
  );

  assert.match(output, /# Codex Grant Review/);
  assert.match(output, /Proposal: Test Proposal/);
  assert.match(output, /Recommendation: fund-with-revisions/);
  assert.match(output, /Impact Score: 3/);
  assert.match(output, /## Criterion Scores/);
  assert.match(output, /Significance.*2/);
  assert.match(output, /## Budget Assessment/);
  assert.match(output, /## Timeline Assessment/);
  assert.match(output, /## Risk Assessment/);
  assert.match(output, /## Recommendations for Revision/);
});

test("renderGrantReviewResult degrades gracefully when JSON is missing required fields", () => {
  const output = renderGrantReviewResult(
    {
      parsed: { recommendation: "fund", summary: "Good" },
      rawOutput: '{"recommendation":"fund","summary":"Good"}',
      parseError: null
    },
    { reviewLabel: "Grant Review", targetLabel: "Test" }
  );
  assert.match(output, /unexpected review shape/i);
  assert.match(output, /Missing/);
});

test("renderGrantPanelReviewResult renders score table and meta-review", () => {
  const output = renderGrantPanelReviewResult({
    individualReviews: [
      {
        persona: { id: "scientific", label: "The Scientific Reviewer" },
        parsed: {
          persona: "The Scientific Reviewer",
          recommendation: "fund-with-revisions",
          impact_score: 3,
          summary: "Good science.",
          criterion_scores: {
            significance: { score: 2, rationale: "High" },
            innovation: { score: 2, rationale: "Novel" },
            approach: { score: 4, rationale: "Gaps" },
            investigator: { score: 2, rationale: "Strong" },
            environment: { score: 1, rationale: "Excellent" }
          },
          strengths: ["Novel"], weaknesses: ["Approach gaps"],
          findings: [], budget_assessment: "OK", timeline_assessment: "OK", risk_assessment: "Low",
          recommendations_for_revision: ["Fix approach"],
          scores: { significance: 2, innovation: 2, approach: 4, investigator: 2, environment: 1, overall: 3, confidence: 4 }
        }
      }
    ],
    validReviews: [],
    metaReview: {
      recommendation: "fund-with-revisions",
      impact_score: 3,
      summary: "Panel recommends funding with revisions.",
      consensus_points: ["Strong team"],
      disagreements: [],
      aggregated_scores: { significance: 2, innovation: 2.5, approach: 3.5, investigator: 2, environment: 1.5, overall: 3 },
      budget_consensus: "Budget is reasonable.",
      risk_consensus: "Low overall risk.",
      priority_actions: ["Strengthen approach for aim 2"],
      overall_assessment: "Fund with revisions."
    },
    weightedScores: { significance: 2, innovation: 2.5, approach: 3.5, investigator: 2, environment: 1.5, overall: 3 }
  }, {
    reviewLabel: "Grant Review Panel",
    targetLabel: "Test Proposal",
    agencyLabel: "NIH"
  });

  assert.match(output, /# Codex Grant Review Panel/);
  assert.match(output, /Proposal: Test Proposal/);
  assert.match(output, /Agency: NIH/);
  assert.match(output, /## Score Summary/);
  assert.match(output, /Scientific Reviewer/);
  assert.match(output, /## Budget Consensus/);
  assert.match(output, /## Risk Consensus/);
  assert.match(output, /## Panel Chair Summary/);
});
