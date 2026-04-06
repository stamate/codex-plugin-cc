import test from "node:test";
import assert from "node:assert/strict";

import { renderCodeAlignmentResult, renderPaperReviewResult, renderPanelReviewResult, renderReviewResult, renderStoredJobResult } from "../plugins/codex/scripts/lib/render.mjs";

test("renderReviewResult degrades gracefully when JSON is missing required review fields", () => {
  const output = renderReviewResult(
    {
      parsed: {
        verdict: "approve",
        summary: "Looks fine."
      },
      rawOutput: JSON.stringify({
        verdict: "approve",
        summary: "Looks fine."
      }),
      parseError: null
    },
    {
      reviewLabel: "Adversarial Review",
      targetLabel: "working tree diff"
    }
  );

  assert.match(output, /Codex returned JSON with an unexpected review shape\./);
  assert.match(output, /Missing array `findings`\./);
  assert.match(output, /Raw final message:/);
});

test("renderPaperReviewResult degrades gracefully when JSON is missing required fields", () => {
  const output = renderPaperReviewResult(
    {
      parsed: {
        recommendation: "minor-revision",
        summary: "Decent paper."
      },
      rawOutput: JSON.stringify({
        recommendation: "minor-revision",
        summary: "Decent paper."
      }),
      parseError: null
    },
    {
      reviewLabel: "Paper Review",
      targetLabel: "My Paper"
    }
  );

  assert.match(output, /Codex returned JSON with an unexpected review shape\./);
  assert.match(output, /Missing array `strengths`\./);
  assert.match(output, /Raw final message:/);
});

test("renderPaperReviewResult renders structured paper review", () => {
  const output = renderPaperReviewResult(
    {
      parsed: {
        recommendation: "minor-revision",
        summary: "A solid contribution with some methodological gaps.",
        strengths: ["Novel approach to the problem", "Clear writing"],
        weaknesses: ["Small sample size", "Missing ablation study"],
        findings: [
          {
            category: "methodology",
            severity: "major",
            title: "Insufficient sample size",
            body: "The study uses only 30 participants, which limits statistical power.",
            section: "Methods (Section 3)",
            confidence: 0.85,
            recommendation: "Increase sample to at least 100 participants or provide power analysis."
          },
          {
            category: "statistics",
            severity: "minor",
            title: "Missing confidence intervals",
            body: "Table 2 reports only p-values without effect sizes or confidence intervals.",
            section: "Results (Section 4)",
            confidence: 0.9,
            recommendation: "Add 95% confidence intervals to all reported statistics."
          }
        ],
        questions_for_authors: ["How were participants recruited?", "Was the analysis pre-registered?"],
        overall_assessment: "The paper presents an interesting idea but needs stronger empirical support."
      },
      rawOutput: "{}",
      parseError: null
    },
    {
      reviewLabel: "Paper Review",
      targetLabel: "My Paper"
    }
  );

  assert.match(output, /^# Codex Paper Review/);
  assert.match(output, /Paper: My Paper/);
  assert.match(output, /Recommendation: minor-revision/);
  assert.match(output, /## Strengths/);
  assert.match(output, /Novel approach/);
  assert.match(output, /## Weaknesses/);
  assert.match(output, /Small sample size/);
  assert.match(output, /## Findings/);
  assert.match(output, /\[major\] \[methodology\] Insufficient sample size/);
  assert.match(output, /\[minor\] \[statistics\] Missing confidence intervals/);
  assert.match(output, /Section: Methods \(Section 3\)/);
  assert.match(output, /## Questions for Authors/);
  assert.match(output, /How were participants recruited\?/);
  assert.match(output, /## Overall Assessment/);
  assert.match(output, /interesting idea but needs stronger empirical support/);
  // Major findings should appear before minor
  const majorIdx = output.indexOf("[major]");
  const minorIdx = output.indexOf("[minor]");
  assert.ok(majorIdx < minorIdx, "Major findings should sort before minor findings");
});

test("renderCodeAlignmentResult renders alignment findings and verdict", () => {
  const output = renderCodeAlignmentResult({
    parsed: {
      alignment_verdict: "minor-discrepancies",
      summary: "Code mostly matches the paper with two small differences.",
      alignment_findings: [
        {
          category: "hyperparameter-mismatch",
          severity: "minor",
          title: "Learning rate differs",
          paper_claim: "Paper reports lr=0.001",
          code_evidence: "Config file sets lr=0.0005",
          recommendation: "Update paper or config to match."
        }
      ],
      reproducibility_assessment: "Results are largely reproducible with minor config adjustments."
    },
    rawOutput: "{}"
  });

  assert.match(output, /## Code-Methods Alignment/);
  assert.match(output, /Verdict: minor-discrepancies/);
  assert.match(output, /Code mostly matches/);
  assert.match(output, /hyperparameter-mismatch/);
  assert.match(output, /Paper claims: Paper reports lr=0.001/);
  assert.match(output, /Code shows: Config file sets lr=0.0005/);
  assert.match(output, /### Reproducibility Assessment/);
});

test("renderCodeAlignmentResult handles null parsed result", () => {
  const output = renderCodeAlignmentResult({ parsed: null, rawOutput: "some raw text" });
  assert.match(output, /Code-Methods Alignment/);
  assert.match(output, /Could not parse/);
  assert.match(output, /some raw text/);
});

test("renderCodeAlignmentResult handles completely missing result", () => {
  const output = renderCodeAlignmentResult(null);
  assert.match(output, /Code-Methods Alignment/);
  assert.match(output, /did not return results/);
});

test("renderPanelReviewResult renders score table, individual reviews, and meta-review", () => {
  const output = renderPanelReviewResult({
    individualReviews: [
      {
        persona: { id: "empiricist", label: "The Empiricist" },
        parsed: {
          persona: "The Empiricist",
          recommendation: "major-revision",
          summary: "Methodology needs work.",
          strengths: ["Clear writing"],
          weaknesses: ["Underpowered study"],
          findings: [],
          questions_for_authors: [],
          overall_assessment: "Needs more data.",
          scores: { originality: 3, methodology: 2, clarity: 3, significance: 3, soundness: 2, overall: 4, confidence: 5 }
        }
      },
      {
        persona: { id: "theorist", label: "The Theorist" },
        parsed: {
          persona: "The Theorist",
          recommendation: "minor-revision",
          summary: "Novel contribution.",
          strengths: ["Interesting idea"],
          weaknesses: ["Weak framing"],
          findings: [],
          questions_for_authors: [],
          overall_assessment: "Promising work.",
          scores: { originality: 4, methodology: 3, clarity: 3, significance: 4, soundness: 3, overall: 6, confidence: 3 }
        }
      }
    ],
    validReviews: [],
    metaReview: {
      recommendation: "major-revision",
      summary: "Paper has potential but needs revision.",
      consensus_points: ["Clear writing style"],
      disagreements: ["Reviewers disagree on novelty"],
      aggregated_scores: { originality: 3.4, methodology: 2.4, clarity: 3.0, significance: 3.4, soundness: 2.4, overall: 4.8 },
      priority_actions: ["Increase sample size", "Strengthen theoretical framing"],
      overall_assessment: "Revise and resubmit."
    },
    weightedScores: { originality: 3.4, methodology: 2.4, clarity: 3.0, significance: 3.4, soundness: 2.4, overall: 4.8 }
  }, {
    reviewLabel: "Paper Review Panel",
    targetLabel: "Test Paper",
    venueLabel: null
  });

  assert.match(output, /# Codex Paper Review Panel/);
  assert.match(output, /Paper: Test Paper/);
  assert.match(output, /Recommendation: major-revision/);
  assert.match(output, /## Score Summary/);
  assert.match(output, /Empiricist/);
  assert.match(output, /Theorist/);
  assert.match(output, /## Consensus/);
  assert.match(output, /Clear writing style/);
  assert.match(output, /## Disagreements/);
  assert.match(output, /## Priority Actions/);
  assert.match(output, /Increase sample size/);
  assert.match(output, /## Individual Reviews/);
  assert.match(output, /## Area Chair Meta-Review/);
});

test("renderStoredJobResult prefers rendered output for structured review jobs", () => {
  const output = renderStoredJobResult(
    {
      id: "review-123",
      status: "completed",
      title: "Codex Adversarial Review",
      jobClass: "review",
      threadId: "thr_123"
    },
    {
      threadId: "thr_123",
      rendered: "# Codex Adversarial Review\n\nTarget: working tree diff\nVerdict: needs-attention\n",
      result: {
        result: {
          verdict: "needs-attention",
          summary: "One issue.",
          findings: [],
          next_steps: []
        },
        rawOutput:
          '{"verdict":"needs-attention","summary":"One issue.","findings":[],"next_steps":[]}'
      }
    }
  );

  assert.match(output, /^# Codex Adversarial Review/);
  assert.doesNotMatch(output, /^\{/);
  assert.match(output, /Codex session ID: thr_123/);
  assert.match(output, /Resume in Codex: codex resume thr_123/);
});
