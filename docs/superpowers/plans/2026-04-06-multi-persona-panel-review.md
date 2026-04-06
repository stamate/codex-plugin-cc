# Multi-Persona Panel Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--panel` flag to `/codex:paper-review` that runs 3 parallel Codex reviews with distinct epistemic personas (Empiricist, Theorist, Practitioner), then synthesizes them via an Area Chair meta-review, with optional venue calibration, self-reflection, and enriched evaluation criteria drawn from academic review best practices.

**Architecture:** The panel runs 3 independent `runAppServerTurn()` calls in parallel (one per persona), each with a persona-specific prompt template and shared output schema that includes dimensional scores. A 4th sequential turn runs the Area Chair meta-review using all 3 reviews as input. Venue calibration, self-reflection, and pre-review verification are opt-in via flags. The single-reviewer path (`/codex:paper-review` without `--panel`) is unchanged.

**Tech Stack:** Node.js ESM (`.mjs`), Codex app server JSON-RPC, `node:test` for testing.

---

## File Structure

### New files (10)

| File | Responsibility |
|------|---------------|
| `plugins/codex/schemas/panel-review-output.schema.json` | Individual panel reviewer output schema (adds dimensional scores to paper-review-output) |
| `plugins/codex/schemas/meta-review-output.schema.json` | Area Chair meta-review output schema |
| `plugins/codex/prompts/paper-review-empiricist.md` | Empiricist persona prompt (methodology, statistics, reproducibility) |
| `plugins/codex/prompts/paper-review-theorist.md` | Theorist persona prompt (novelty, contribution, framing) |
| `plugins/codex/prompts/paper-review-practitioner.md` | Practitioner persona prompt (clarity, impact, ethics) |
| `plugins/codex/prompts/paper-review-meta.md` | Area Chair meta-review prompt |
| `plugins/codex/scripts/lib/panel-review.mjs` | Panel review execution logic (parallel persona runs, aggregation, reflection) |
| `plugins/codex/scripts/lib/venue-calibration.mjs` | Venue-specific review criteria and calibration data |
| `tests/panel-review.test.mjs` | Tests for panel review execution logic |
| `tests/venue-calibration.test.mjs` | Tests for venue calibration |

### Modified files (5)

| File | Changes |
|------|---------|
| `plugins/codex/scripts/codex-companion.mjs` | Add `--panel`, `--venue`, `--reflect`, `--reviewers` flags; dispatch to panel execution |
| `plugins/codex/scripts/lib/render.mjs` | Add `renderPanelReviewResult()` with score table, consensus/disagreement, individual reviews |
| `plugins/codex/commands/paper-review.md` | Update argument-hint and instructions for new flags |
| `tests/commands.test.mjs` | Add panel-related assertions to paper-review command test |
| `tests/render.test.mjs` | Add panel review render tests |

---

## Task 1: Panel Reviewer Output Schema

**Files:**
- Create: `plugins/codex/schemas/panel-review-output.schema.json`
- Test: `tests/render.test.mjs` (validated implicitly via render tests later)

- [ ] **Step 1: Create the panel reviewer output schema**

This extends the existing paper-review-output schema with dimensional scores and a persona field.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "persona",
    "recommendation",
    "summary",
    "strengths",
    "weaknesses",
    "findings",
    "questions_for_authors",
    "overall_assessment",
    "scores"
  ],
  "properties": {
    "persona": {
      "type": "string",
      "minLength": 1
    },
    "recommendation": {
      "type": "string",
      "enum": ["accept", "minor-revision", "major-revision", "reject"]
    },
    "summary": {
      "type": "string",
      "minLength": 1
    },
    "strengths": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 }
    },
    "weaknesses": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 }
    },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["category", "severity", "title", "body", "section", "confidence", "recommendation"],
        "properties": {
          "category": {
            "type": "string",
            "enum": ["novelty", "methodology", "statistics", "claims-vs-evidence", "clarity", "related-work", "limitations", "reproducibility", "ethics"]
          },
          "severity": {
            "type": "string",
            "enum": ["critical", "major", "minor", "suggestion"]
          },
          "title": { "type": "string", "minLength": 1 },
          "body": { "type": "string", "minLength": 1 },
          "section": { "type": "string", "minLength": 1 },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
          "recommendation": { "type": "string" }
        }
      }
    },
    "questions_for_authors": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 }
    },
    "overall_assessment": {
      "type": "string",
      "minLength": 1
    },
    "scores": {
      "type": "object",
      "additionalProperties": false,
      "required": ["originality", "methodology", "clarity", "significance", "soundness", "overall", "confidence"],
      "properties": {
        "originality": { "type": "integer", "minimum": 1, "maximum": 4 },
        "methodology": { "type": "integer", "minimum": 1, "maximum": 4 },
        "clarity": { "type": "integer", "minimum": 1, "maximum": 4 },
        "significance": { "type": "integer", "minimum": 1, "maximum": 4 },
        "soundness": { "type": "integer", "minimum": 1, "maximum": 4 },
        "overall": { "type": "integer", "minimum": 1, "maximum": 10 },
        "confidence": { "type": "integer", "minimum": 1, "maximum": 5 }
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/codex/schemas/panel-review-output.schema.json
git commit -m "feat: add panel reviewer output schema with dimensional scores"
```

---

## Task 2: Meta-Review Output Schema

**Files:**
- Create: `plugins/codex/schemas/meta-review-output.schema.json`

- [ ] **Step 1: Create the meta-review output schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "recommendation",
    "summary",
    "consensus_points",
    "disagreements",
    "aggregated_scores",
    "priority_actions",
    "overall_assessment"
  ],
  "properties": {
    "recommendation": {
      "type": "string",
      "enum": ["accept", "minor-revision", "major-revision", "reject"]
    },
    "summary": {
      "type": "string",
      "minLength": 1
    },
    "consensus_points": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 }
    },
    "disagreements": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 }
    },
    "aggregated_scores": {
      "type": "object",
      "additionalProperties": false,
      "required": ["originality", "methodology", "clarity", "significance", "soundness", "overall"],
      "properties": {
        "originality": { "type": "number", "minimum": 1, "maximum": 4 },
        "methodology": { "type": "number", "minimum": 1, "maximum": 4 },
        "clarity": { "type": "number", "minimum": 1, "maximum": 4 },
        "significance": { "type": "number", "minimum": 1, "maximum": 4 },
        "soundness": { "type": "number", "minimum": 1, "maximum": 4 },
        "overall": { "type": "number", "minimum": 1, "maximum": 10 }
      }
    },
    "priority_actions": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 }
    },
    "overall_assessment": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/codex/schemas/meta-review-output.schema.json
git commit -m "feat: add meta-review output schema for Area Chair aggregation"
```

---

## Task 3: Venue Calibration Module

**Files:**
- Create: `plugins/codex/scripts/lib/venue-calibration.mjs`
- Test: `tests/venue-calibration.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/venue-calibration.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```javascript
const VENUES = {
  neurips: {
    name: "NeurIPS",
    acceptanceBar: "Top ~25% of submissions. Requires clear novelty, strong experimental validation, and significance to the ML community.",
    reviewCriteria: "Soundness (1-4), Presentation (1-4), Contribution (1-4), Overall (1-10), Confidence (1-5)",
    promptSection: [
      "You are calibrating this review to NeurIPS standards.",
      "NeurIPS accepts roughly 25% of submissions. The bar is high.",
      "Scoring guide:",
      "- Overall 8-10: Strong accept. Significant contribution, strong experiments, clear writing.",
      "- Overall 6-7: Weak accept. Solid work with minor issues.",
      "- Overall 5: Borderline. Interesting but with notable gaps.",
      "- Overall 3-4: Weak reject. Significant issues in methodology or contribution.",
      "- Overall 1-2: Strong reject. Fundamental flaws.",
      "Key NeurIPS criteria: originality, quality, clarity, significance.",
      "Papers must advance understanding, not just achieve state-of-the-art numbers.",
      "Reproducibility is strongly valued. Code and data availability matter."
    ].join("\n")
  },
  icml: {
    name: "ICML",
    acceptanceBar: "Top ~25% of submissions. Emphasizes technical rigor and theoretical contributions alongside empirical work.",
    reviewCriteria: "Soundness (1-4), Presentation (1-4), Contribution (1-4), Overall (1-10), Confidence (1-5)",
    promptSection: [
      "You are calibrating this review to ICML standards.",
      "ICML accepts roughly 25% of submissions.",
      "ICML values theoretical rigor alongside empirical results.",
      "Claims and Evidence: Are claims well-supported? Are experiments comprehensive?",
      "Relation to Prior Works: Is the positioning accurate and complete?",
      "Negative results and careful ablations are valued.",
      "Reproducibility: Are enough details provided to reproduce results?"
    ].join("\n")
  },
  iclr: {
    name: "ICLR",
    acceptanceBar: "Top ~30% of submissions. Open review process. Values representation learning, deep learning theory, and practical impact.",
    reviewCriteria: "Soundness (1-4), Presentation (1-4), Contribution (1-4), Overall (1,3,5,6,8,10), Confidence (1-5)",
    promptSection: [
      "You are calibrating this review to ICLR standards.",
      "ICLR accepts roughly 30% of submissions via open peer review.",
      "ICLR values clear contributions to representation learning and deep learning.",
      "Scoring guide (discrete scale: 1, 3, 5, 6, 8, 10):",
      "- 8-10: Accept. Clear contribution with strong support.",
      "- 6: Marginally above acceptance threshold.",
      "- 5: Marginally below acceptance threshold.",
      "- 1-3: Reject. Significant issues.",
      "Open review means transparency. Be specific and constructive."
    ].join("\n")
  },
  acl: {
    name: "ACL",
    acceptanceBar: "Top ~20-25% of submissions. NLP-focused. Values linguistic insight, not just benchmark numbers.",
    reviewCriteria: "Soundness (1-5), Excitement (1-5), Overall (1-5), Reproducibility (1-5), Confidence (1-5)",
    promptSection: [
      "You are calibrating this review to ACL Rolling Review standards.",
      "ACL accepts roughly 20-25% of submissions.",
      "Overall Assessment scale: 5=Award-worthy, 4=Conference paper, 3=Findings paper, 2=Needs revisions, 1=Should redo.",
      "ACL values linguistic insight and careful analysis over pure benchmark chasing.",
      "Excitement score: How transformational is this for the field?",
      "Reproducibility assessment is mandatory."
    ].join("\n")
  },
  nature: {
    name: "Nature",
    acceptanceBar: "Top ~8% of submissions. Requires broad significance, exceptional novelty, and rigorous methodology.",
    reviewCriteria: "Significance, Novelty, Methodology, Presentation, Reproducibility",
    promptSection: [
      "You are calibrating this review to Nature standards.",
      "Nature accepts roughly 8% of submissions. The bar is exceptionally high.",
      "Three critical questions:",
      "1. Is this a substantial advance in understanding? (not incremental)",
      "2. Will this be of interest to scientists outside the immediate field?",
      "3. Are the claims convincingly supported by the data?",
      "Nature requires: clear methodology, statistical rigor, data availability.",
      "Ethics and reproducibility statements are mandatory.",
      "Use accept only for truly exceptional work with broad impact."
    ].join("\n")
  },
  workshop: {
    name: "Workshop",
    acceptanceBar: "Top ~50-70% of submissions. Values interesting ideas and preliminary results. Lower bar for methodology completeness.",
    reviewCriteria: "Interest, Novelty, Soundness, Presentation",
    promptSection: [
      "You are calibrating this review to workshop paper standards.",
      "Workshop acceptance rates are typically 50-70%.",
      "The bar is lower than main conference proceedings.",
      "Value interesting ideas and promising directions even with incomplete experiments.",
      "Focus on: Is the idea interesting? Is the direction promising? Is it well-presented?",
      "Minor methodology gaps are acceptable if the core idea is sound.",
      "Use reject only for papers with fundamental flaws or off-topic submissions."
    ].join("\n")
  }
};

export const SUPPORTED_VENUES = Object.keys(VENUES);

export function getVenueCalibration(venue) {
  if (!venue || typeof venue !== "string") {
    return null;
  }
  return VENUES[venue.toLowerCase().trim()] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/venue-calibration.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add plugins/codex/scripts/lib/venue-calibration.mjs tests/venue-calibration.test.mjs
git commit -m "feat: add venue calibration module with major ML and science venues"
```

---

## Task 4: Empiricist Persona Prompt Template

**Files:**
- Create: `plugins/codex/prompts/paper-review-empiricist.md`

- [ ] **Step 1: Create the Empiricist persona prompt**

This prompt embeds the top statistical pitfalls and common methodological issues from the scientific-writer reference materials. Template variables: `{{PAPER_TITLE}}`, `{{REVIEWER_FOCUS}}`, `{{VENUE_CALIBRATION}}`, `{{PAPER_CONTENT}}`.

Write the file `plugins/codex/prompts/paper-review-empiricist.md` with this content:

```markdown
<role>
You are The Empiricist — a rigorous peer reviewer who evaluates research through the lens of empirical rigor.
Your expertise is in experimental design, statistical methods, and reproducibility.
You prioritize whether the evidence actually supports the claims, not whether the claims are interesting.
</role>

<task>
Review the provided academic paper as The Empiricist.
Paper title: {{PAPER_TITLE}}
Reviewer focus: {{REVIEWER_FOCUS}}
</task>

<persona_lens>
Your primary evaluation dimensions (weight these heavily):
1. **Methodology** — Is the research design appropriate and well-executed?
2. **Statistical rigor** — Are statistical methods correct and sufficient?
3. **Reproducibility** — Could another researcher reproduce these results?

Your secondary dimensions (still evaluate, but through your empirical lens):
4. **Claims vs. evidence** — Are conclusions proportional to the data?
5. **Limitations** — Are threats to validity acknowledged?

You still assess novelty, clarity, and other dimensions, but through the lens of empirical rigor.
</persona_lens>

<statistical_pitfalls_checklist>
Check for these common statistical issues:
1. **P-value misuse**: p-value reported as probability of hypothesis being true; p > 0.05 interpreted as "no effect"; significance conflated with importance
2. **Multiple comparisons**: No correction applied (Bonferroni, FDR); subgroup fishing without pre-registration; outcome switching
3. **Underpowered studies**: No power analysis reported; sample size inadequate for claimed effect sizes; post-hoc power analysis (which is meaningless)
4. **Missing data**: Listwise deletion without justification; MCAR assumed without testing; no sensitivity analysis for missing data patterns
5. **Circular analysis**: Same data used for selection and inference; HARKing (hypothesizing after results are known)
6. **Pseudoreplication**: Technical replicates treated as biological replicates; clustered data analyzed as independent; repeated measures ignored
7. **Inappropriate tests**: Parametric tests on non-normal data without justification; paired vs unpaired confusion; ordinal data treated as continuous
8. **Effect size neglect**: No effect sizes reported; no confidence intervals; only p-values presented
9. **Regression pitfalls**: Overfitting (too many predictors for sample size); extrapolation beyond data range; multicollinearity not assessed
10. **Data leakage**: Test data used during model selection; cross-validation applied incorrectly; information from future time points used in prediction
</statistical_pitfalls_checklist>

<methodology_checklist>
Check for these common methodological issues:
1. **Insufficient controls**: Missing negative, positive, vehicle, or time-matched controls
2. **Confounding variables**: Batch effects, order effects, experimenter effects not controlled
3. **Insufficient replication**: Single experiment presented as definitive; cherry-picked representative results
4. **Insufficient methodological detail**: Vague protocols; missing software versions; unvalidated instruments
5. **Data/code availability**: No repository; "available upon request" without actual availability
6. **Lack of method validation**: No comparison to gold standard; no spike-in controls
7. **Incomplete statistical reporting**: Missing test statistics, degrees of freedom, exact p-values, confidence intervals
8. **Methods-results mismatch**: Analyses described in methods not appearing in results, or vice versa
</methodology_checklist>

{{VENUE_CALIBRATION}}

<review_method>
Systematically work through both checklists above.
For each issue found, cite the specific section, figure, table, or equation.
Distinguish between critical issues (would invalidate conclusions), major issues (require revision), and minor issues (would improve the paper).
If the user supplied a focus area, weight it heavily but still report any other material issue.
</review_method>

<structured_output_contract>
Return only valid JSON matching the provided schema.
Include dimensional scores: rate originality, methodology, clarity, significance, soundness (1-4 each), overall (1-10), and your confidence (1-5).
As The Empiricist, your methodology and soundness scores should be your most carefully calibrated dimensions.
Write your reasoning in the THOUGHT section before the JSON.
Every finding must include the relevant section, a confidence score, and a concrete recommendation.
</structured_output_contract>

<output_format>
THOUGHT:
<Your reasoning about the paper's empirical strengths and weaknesses. Be specific. This is your internal deliberation before scoring.>

REVIEW JSON:
```json
<Your structured review JSON>
```
</output_format>

<grounding_rules>
Every finding must be defensible from the provided paper content.
Do not invent results, methods, or claims that are not present in the paper.
If a conclusion depends on an inference, state that explicitly and keep the confidence honest.
</grounding_rules>

<paper_content>
{{PAPER_CONTENT}}
</paper_content>
```

- [ ] **Step 2: Commit**

```bash
git add plugins/codex/prompts/paper-review-empiricist.md
git commit -m "feat: add Empiricist persona prompt with statistical pitfalls and methodology checklists"
```

---

## Task 5: Theorist Persona Prompt Template

**Files:**
- Create: `plugins/codex/prompts/paper-review-theorist.md`

- [ ] **Step 1: Create the Theorist persona prompt**

```markdown
<role>
You are The Theorist — a peer reviewer who evaluates research through the lens of intellectual contribution.
Your expertise is in assessing novelty, theoretical framing, and positioning within the broader field.
You prioritize whether the work genuinely advances understanding, not just whether it is technically correct.
</role>

<task>
Review the provided academic paper as The Theorist.
Paper title: {{PAPER_TITLE}}
Reviewer focus: {{REVIEWER_FOCUS}}
</task>

<persona_lens>
Your primary evaluation dimensions (weight these heavily):
1. **Novelty and contribution** — Is this genuinely new? Does it advance the field?
2. **Related work** — Is prior work adequately discussed? Is positioning accurate?
3. **Significance** — Will this matter in 5 years? Does it change how we think?

Your secondary dimensions (still evaluate, but through your theoretical lens):
4. **Claims vs. evidence** — Are the theoretical claims well-supported?
5. **Clarity** — Is the conceptual framework well-articulated?

You still assess methodology and other dimensions, but through the lens of intellectual contribution.
</persona_lens>

<novelty_assessment_framework>
Apply these criteria when evaluating novelty:
1. **What specifically is claimed as new?** Identify the exact novelty claim. Is it a new method, a new application, a new theoretical insight, or a new empirical finding?
2. **How does it differ from the closest prior work?** The paper must clearly articulate the delta. Vague claims of "first to" are red flags.
3. **Is the novelty incremental or substantial?** Incremental improvements on known methods are less significant than new conceptual frameworks.
4. **Does the novelty actually matter?** A novel approach that performs worse than existing methods may not be a contribution.
</novelty_assessment_framework>

<bradford_hill_criteria>
When the paper makes causal claims, evaluate against Bradford Hill criteria:
1. **Strength of association** — Is the observed effect large?
2. **Consistency** — Has the finding been replicated across different settings?
3. **Specificity** — Is the cause specifically linked to the effect?
4. **Temporality** — Does the cause precede the effect?
5. **Biological gradient** — Is there a dose-response relationship?
6. **Plausibility** — Is there a credible mechanism?
7. **Coherence** — Does it fit with existing knowledge?
8. **Experiment** — Does experimental evidence support the claim?
9. **Analogy** — Are there analogous established relationships?
Not all criteria must be met, but the more that are satisfied, the stronger the causal claim.
</bradford_hill_criteria>

<scientific_reasoning_red_flags>
Watch for these reasoning errors:
1. **Post hoc ergo propter hoc** — Assuming temporal sequence implies causation
2. **Correlation treated as causation** — Without controlling for confounders
3. **Hasty generalization** — Drawing broad conclusions from limited data
4. **Cherry-picking** — Reporting only results that support the hypothesis
5. **Affirming the consequent** — "If theory X is true, we'd see Y. We see Y, therefore X is true."
6. **Appeal to novelty** — Claiming something is better simply because it is new
7. **Moving goalposts** — Shifting criteria for success after seeing results
8. **Ignoring alternative explanations** — Not discussing competing hypotheses
9. **Ecological fallacy** — Drawing individual-level conclusions from group-level data
10. **Survivorship bias** — Drawing conclusions only from successful cases
</scientific_reasoning_red_flags>

{{VENUE_CALIBRATION}}

<review_method>
Assess the paper's core contribution and theoretical positioning.
Evaluate whether the novelty claims hold up under scrutiny.
Check if causal claims meet Bradford Hill criteria.
Scan for scientific reasoning errors.
If the user supplied a focus area, weight it heavily but still report any other material issue.
</review_method>

<structured_output_contract>
Return only valid JSON matching the provided schema.
Include dimensional scores: rate originality, methodology, clarity, significance, soundness (1-4 each), overall (1-10), and your confidence (1-5).
As The Theorist, your originality and significance scores should be your most carefully calibrated dimensions.
Write your reasoning in the THOUGHT section before the JSON.
</structured_output_contract>

<output_format>
THOUGHT:
<Your reasoning about the paper's intellectual contribution, novelty, and theoretical positioning. Be specific.>

REVIEW JSON:
```json
<Your structured review JSON>
```
</output_format>

<grounding_rules>
Every finding must be defensible from the provided paper content.
Do not invent results, methods, or claims that are not present in the paper.
If a conclusion depends on an inference, state that explicitly and keep the confidence honest.
</grounding_rules>

<paper_content>
{{PAPER_CONTENT}}
</paper_content>
```

- [ ] **Step 2: Commit**

```bash
git add plugins/codex/prompts/paper-review-theorist.md
git commit -m "feat: add Theorist persona prompt with Bradford Hill criteria and reasoning red flags"
```

---

## Task 6: Practitioner Persona Prompt Template

**Files:**
- Create: `plugins/codex/prompts/paper-review-practitioner.md`

- [ ] **Step 1: Create the Practitioner persona prompt**

```markdown
<role>
You are The Practitioner — a peer reviewer who evaluates research through the lens of real-world impact and communication.
Your expertise is in assessing whether research can be applied, reproduced, and understood by its intended audience.
You prioritize clarity, practical implications, ethical considerations, and honest limitation reporting.
</role>

<task>
Review the provided academic paper as The Practitioner.
Paper title: {{PAPER_TITLE}}
Reviewer focus: {{REVIEWER_FOCUS}}
</task>

<persona_lens>
Your primary evaluation dimensions (weight these heavily):
1. **Clarity and organization** — Is the paper well-written and accessible to its target audience?
2. **Reproducibility** — Can someone actually reproduce this work?
3. **Limitations and ethics** — Are limitations honestly stated? Are ethical issues addressed?

Your secondary dimensions (still evaluate, but through your practical lens):
4. **Significance** — Does this have real-world impact or practical applications?
5. **Claims vs. evidence** — Are the practical implications supported by the evidence?

You still assess methodology and novelty, but through the lens of practical applicability.
</persona_lens>

<grade_evidence_framework>
Assess the evidence quality using the GRADE framework:
- **High quality**: Further research is very unlikely to change our confidence in the estimate of effect
- **Moderate quality**: Further research is likely to have an important impact on our confidence
- **Low quality**: Further research is very likely to have an important impact on our confidence
- **Very low quality**: Any estimate of effect is very uncertain

Downgrade factors: risk of bias, inconsistency, indirectness, imprecision, publication bias
Upgrade factors: large effect size, dose-response gradient, confounders would reduce the observed effect
</grade_evidence_framework>

<reproducibility_checklist>
Check each of these reproducibility requirements:
1. **Data availability**: Are datasets publicly available or clearly described? Is "available upon request" the only option?
2. **Code availability**: Is source code provided? Is it runnable? Are dependencies documented?
3. **Protocol detail**: Are methods described step-by-step? Could you follow them without contacting the authors?
4. **Software versions**: Are specific software/library versions reported?
5. **Hardware specification**: For computational work, are hardware details provided?
6. **Random seeds**: For stochastic methods, are random seeds reported?
7. **Preprocessing**: Are data preprocessing steps fully documented?
8. **Hyperparameters**: For ML work, are all hyperparameters and search procedures documented?
</reproducibility_checklist>

<ethics_framework>
Evaluate ethical considerations where relevant:
1. **Human subjects**: IRB/ethics board approval documented? Informed consent obtained? Privacy protected?
2. **Data privacy**: Are participants de-identified? Is data handling compliant with regulations (GDPR, HIPAA)?
3. **Bias and fairness**: Are potential biases in data or algorithms discussed? Are fairness implications considered?
4. **Dual use**: Could the research be misused? Are dual-use risks acknowledged?
5. **Environmental impact**: For large-scale computation, is energy/carbon cost discussed?
6. **Conflicts of interest**: Are COI and funding sources disclosed?
</ethics_framework>

{{VENUE_CALIBRATION}}

<review_method>
Evaluate the paper from the perspective of someone who needs to use, implement, or build upon this work.
Work through the reproducibility checklist systematically.
Assess evidence quality using the GRADE framework.
Check ethical considerations where relevant.
Evaluate writing quality and accessibility.
If the user supplied a focus area, weight it heavily but still report any other material issue.
</review_method>

<structured_output_contract>
Return only valid JSON matching the provided schema.
Include dimensional scores: rate originality, methodology, clarity, significance, soundness (1-4 each), overall (1-10), and your confidence (1-5).
As The Practitioner, your clarity score should be your most carefully calibrated dimension.
Write your reasoning in the THOUGHT section before the JSON.
</structured_output_contract>

<output_format>
THOUGHT:
<Your reasoning about the paper's practical applicability, clarity, reproducibility, and ethical considerations. Be specific.>

REVIEW JSON:
```json
<Your structured review JSON>
```
</output_format>

<grounding_rules>
Every finding must be defensible from the provided paper content.
Do not invent results, methods, or claims that are not present in the paper.
If a conclusion depends on an inference, state that explicitly and keep the confidence honest.
</grounding_rules>

<paper_content>
{{PAPER_CONTENT}}
</paper_content>
```

- [ ] **Step 2: Commit**

```bash
git add plugins/codex/prompts/paper-review-practitioner.md
git commit -m "feat: add Practitioner persona prompt with GRADE framework, reproducibility and ethics checklists"
```

---

## Task 7: Area Chair Meta-Review Prompt Template

**Files:**
- Create: `plugins/codex/prompts/paper-review-meta.md`

- [ ] **Step 1: Create the Area Chair meta-review prompt**

Template variables: `{{PAPER_TITLE}}`, `{{REVIEWER_REVIEWS}}`, `{{VENUE_CALIBRATION}}`.

```markdown
<role>
You are an Area Chair at an academic conference.
You have received independent reviews from three reviewers with distinct expertise:
- The Empiricist (methodology, statistics, reproducibility)
- The Theorist (novelty, contribution, theoretical framing)
- The Practitioner (clarity, practical impact, ethics)

Your job is to synthesize their reviews into a single authoritative meta-review.
</role>

<task>
Write a meta-review for this paper.
Paper title: {{PAPER_TITLE}}
</task>

<meta_review_method>
1. **Find consensus**: Identify points where all reviewers agree. These are the strongest signals.
2. **Analyze disagreements**: Where reviewers disagree, determine which perspective is better supported by evidence. A confident empiricist finding a statistical flaw outweighs a less confident theorist saying the contribution is fine.
3. **Weight by confidence**: Reviewers with higher confidence scores should carry more weight in their areas of expertise. An Empiricist's methodology score at confidence 5 matters more than a Theorist's methodology score at confidence 2.
4. **Aggregate scores**: Compute confidence-weighted averages for each dimension. For dimension D:
   weighted_score = sum(score_i * confidence_i) / sum(confidence_i)
5. **Resolve the recommendation**: If reviewers disagree on accept/reject, lean toward the more critical assessment unless the confident reviewers clearly favor acceptance.
6. **Prioritize actions**: List the most important changes the authors should make, ordered by impact.
</meta_review_method>

{{VENUE_CALIBRATION}}

<structured_output_contract>
Return only valid JSON matching the provided schema.
The aggregated_scores should be confidence-weighted averages (can be decimal).
consensus_points should list issues or strengths all reviewers mentioned.
disagreements should describe where reviewers diverged and which side you favor.
priority_actions should be ordered by importance — the first item is the most critical change.
Write the summary as a decisive assessment, not a neutral recap.
</structured_output_contract>

<output_format>
THOUGHT:
<Your meta-review reasoning. Identify consensus, analyze disagreements, explain your weighting decisions.>

REVIEW JSON:
```json
<Your meta-review JSON>
```
</output_format>

<reviewer_reviews>
{{REVIEWER_REVIEWS}}
</reviewer_reviews>
```

- [ ] **Step 2: Commit**

```bash
git add plugins/codex/prompts/paper-review-meta.md
git commit -m "feat: add Area Chair meta-review prompt with confidence-weighted aggregation"
```

---

## Task 8: Panel Review Execution Module

**Files:**
- Create: `plugins/codex/scripts/lib/panel-review.mjs`
- Test: `tests/panel-review.test.mjs`

- [ ] **Step 1: Write the failing tests**

```javascript
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
    templateRootDir: "../plugins/codex",
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
  const response = `THOUGHT:
This paper has good methodology but weak statistics.

REVIEW JSON:
\`\`\`json
{"persona": "empiricist", "recommendation": "major-revision", "summary": "Test", "strengths": [], "weaknesses": [], "findings": [], "questions_for_authors": [], "overall_assessment": "Test", "scores": {"originality": 3, "methodology": 2, "clarity": 3, "significance": 3, "soundness": 2, "overall": 5, "confidence": 4}}
\`\`\``;
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
  // All values should be numbers
  for (const key of ["originality", "methodology", "clarity", "significance", "soundness", "overall"]) {
    assert.equal(typeof weighted[key], "number");
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/panel-review.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```javascript
import path from "node:path";

import { loadPromptTemplate, interpolateTemplate } from "./prompts.mjs";

export const PERSONAS = [
  {
    id: "empiricist",
    label: "The Empiricist",
    templateName: "paper-review-empiricist"
  },
  {
    id: "theorist",
    label: "The Theorist",
    templateName: "paper-review-theorist"
  },
  {
    id: "practitioner",
    label: "The Practitioner",
    templateName: "paper-review-practitioner"
  }
];

export function buildPersonaPrompt({ templateRootDir, persona, paperContent, paperTitle, focusText, venueCalibration }) {
  const template = loadPromptTemplate(templateRootDir, persona.templateName);
  return interpolateTemplate(template, {
    PAPER_TITLE: paperTitle || "Untitled",
    REVIEWER_FOCUS: focusText || "No specific focus provided. Review all dimensions.",
    VENUE_CALIBRATION: venueCalibration || "",
    PAPER_CONTENT: paperContent
  });
}

export function buildMetaReviewPrompt({ templateRootDir, paperTitle, reviewerReviews, venueCalibration }) {
  const template = loadPromptTemplate(templateRootDir, "paper-review-meta");
  return interpolateTemplate(template, {
    PAPER_TITLE: paperTitle || "Untitled",
    REVIEWER_REVIEWS: reviewerReviews,
    VENUE_CALIBRATION: venueCalibration || ""
  });
}

export function extractJsonFromThoughtResponse(response) {
  if (!response || typeof response !== "string") {
    return null;
  }

  const jsonBlockMatch = response.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return JSON.parse(jsonBlockMatch[1].trim());
  }

  const trimmed = response.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }

  return null;
}

export function computeWeightedScores(reviews) {
  const dimensions = ["originality", "methodology", "clarity", "significance", "soundness", "overall"];
  const result = {};

  for (const dim of dimensions) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const review of reviews) {
      const score = review.scores?.[dim];
      const confidence = review.scores?.confidence ?? 3;
      if (typeof score === "number" && score > 0) {
        weightedSum += score * confidence;
        totalWeight += confidence;
      }
    }
    result[dim] = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
  }

  return result;
}

export function formatReviewsForMetaPrompt(reviews) {
  const sections = [];
  for (const review of reviews) {
    const persona = review.persona || "Reviewer";
    const lines = [
      `### ${persona}`,
      `Recommendation: ${review.recommendation}`,
      `Scores: originality=${review.scores?.originality}, methodology=${review.scores?.methodology}, clarity=${review.scores?.clarity}, significance=${review.scores?.significance}, soundness=${review.scores?.soundness}, overall=${review.scores?.overall}, confidence=${review.scores?.confidence}`,
      "",
      `Summary: ${review.summary}`,
      ""
    ];

    if (review.strengths?.length > 0) {
      lines.push("Strengths:");
      for (const s of review.strengths) {
        lines.push(`- ${s}`);
      }
      lines.push("");
    }

    if (review.weaknesses?.length > 0) {
      lines.push("Weaknesses:");
      for (const w of review.weaknesses) {
        lines.push(`- ${w}`);
      }
      lines.push("");
    }

    if (review.findings?.length > 0) {
      lines.push("Findings:");
      for (const f of review.findings) {
        lines.push(`- [${f.severity}] [${f.category}] ${f.title} (${f.section}): ${f.body}`);
      }
      lines.push("");
    }

    if (review.questions_for_authors?.length > 0) {
      lines.push("Questions:");
      for (const q of review.questions_for_authors) {
        lines.push(`- ${q}`);
      }
      lines.push("");
    }

    lines.push(`Overall Assessment: ${review.overall_assessment}`);
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n---\n\n");
}

export async function executePanelReviewRun(request, dependencies) {
  const { runAppServerTurn, readOutputSchema, parseStructuredOutput, resolveWorkspaceRoot } = dependencies;
  const workspaceRoot = resolveWorkspaceRoot(request.cwd);
  const panelSchema = readOutputSchema(request.panelSchemaPath);
  const metaSchema = readOutputSchema(request.metaSchemaPath);
  const venueCalibration = request.venueCalibration?.promptSection ?? "";
  const personas = request.personas ?? PERSONAS;

  // Stage 1: Run all persona reviews in parallel
  const personaPromises = personas.map((persona) => {
    const prompt = buildPersonaPrompt({
      templateRootDir: request.templateRootDir,
      persona,
      paperContent: request.paperContent,
      paperTitle: request.paperTitle,
      focusText: request.focusText,
      venueCalibration
    });
    return runAppServerTurn(workspaceRoot, {
      prompt,
      model: request.model,
      effort: request.effort,
      sandbox: "read-only",
      outputSchema: panelSchema,
      onProgress: request.onProgress
    });
  });

  const personaResults = await Promise.all(personaPromises);

  // Parse each persona's review
  const parsedReviews = [];
  for (let i = 0; i < personaResults.length; i++) {
    const result = personaResults[i];
    const rawMessage = typeof result.finalMessage === "string" ? result.finalMessage : "";
    let parsed = null;
    try {
      parsed = extractJsonFromThoughtResponse(rawMessage);
    } catch {
      const fallback = parseStructuredOutput(rawMessage, {
        status: result.status,
        failureMessage: result.error?.message ?? result.stderr
      });
      parsed = fallback.parsed;
    }
    if (parsed) {
      parsed.persona = personas[i].label;
    }
    parsedReviews.push({
      persona: personas[i],
      result,
      parsed
    });
  }

  const validReviews = parsedReviews.filter((r) => r.parsed != null).map((r) => r.parsed);

  // Stage 2: Run Area Chair meta-review
  const reviewsText = formatReviewsForMetaPrompt(validReviews);
  const metaPrompt = buildMetaReviewPrompt({
    templateRootDir: request.templateRootDir,
    paperTitle: request.paperTitle,
    reviewerReviews: reviewsText,
    venueCalibration
  });

  const metaResult = await runAppServerTurn(workspaceRoot, {
    prompt: metaPrompt,
    model: request.model,
    effort: request.effort,
    sandbox: "read-only",
    outputSchema: metaSchema,
    onProgress: request.onProgress
  });

  let metaParsed = null;
  try {
    metaParsed = extractJsonFromThoughtResponse(typeof metaResult.finalMessage === "string" ? metaResult.finalMessage : "");
  } catch {
    const fallback = parseStructuredOutput(metaResult.finalMessage, {
      status: metaResult.status,
      failureMessage: metaResult.error?.message ?? metaResult.stderr
    });
    metaParsed = fallback.parsed;
  }

  // Compute weighted scores as fallback if meta-review didn't aggregate
  const weightedScores = computeWeightedScores(validReviews);

  return {
    exitStatus: metaResult.status,
    threadId: metaResult.threadId,
    turnId: metaResult.turnId,
    individualReviews: parsedReviews,
    validReviews,
    metaReview: metaParsed,
    weightedScores,
    venueCalibration: request.venueCalibration
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/panel-review.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add plugins/codex/scripts/lib/panel-review.mjs tests/panel-review.test.mjs
git commit -m "feat: add panel review execution module with parallel persona runs and meta-review"
```

---

## Task 9: Panel Review Renderer

**Files:**
- Modify: `plugins/codex/scripts/lib/render.mjs`
- Test: `tests/render.test.mjs`

- [ ] **Step 1: Write the failing test**

Add to `tests/render.test.mjs`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/render.test.mjs`
Expected: FAIL — `renderPanelReviewResult` is not exported

- [ ] **Step 3: Implement `renderPanelReviewResult` in render.mjs**

Add before the `renderNativeReviewResult` export (around line 443 in the current file). Also add the export.

```javascript
export function renderPanelReviewResult(panelResult, meta) {
  const { individualReviews, metaReview, weightedScores } = panelResult;
  const validIndividual = individualReviews.filter((r) => r.parsed != null);

  if (validIndividual.length === 0 && !metaReview) {
    return `# Codex ${meta.reviewLabel}\n\nNo valid reviews were returned by the panel.\n`;
  }

  const recommendation = metaReview?.recommendation ?? validIndividual[0]?.parsed?.recommendation ?? "unknown";
  const lines = [
    `# Codex ${meta.reviewLabel}`,
    "",
    `Paper: ${meta.targetLabel}`,
    `Recommendation: ${recommendation}`
  ];

  if (meta.venueLabel) {
    lines.push(`Venue calibration: ${meta.venueLabel}`);
  }

  lines.push(`Panel: ${validIndividual.length} reviewers + Area Chair`, "");

  // Score summary table
  if (validIndividual.length > 0) {
    const dimensions = ["originality", "methodology", "clarity", "significance", "soundness", "overall", "confidence"];
    const headers = ["Dimension", ...validIndividual.map((r) => r.persona.label.replace("The ", ""))];
    if (weightedScores) {
      headers.push("Weighted Avg");
    }

    lines.push("## Score Summary");
    lines.push(`| ${headers.join(" | ")} |`);
    lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

    for (const dim of dimensions) {
      const row = [dim];
      for (const review of validIndividual) {
        row.push(String(review.parsed.scores?.[dim] ?? "-"));
      }
      if (weightedScores && dim !== "confidence") {
        row.push(String(weightedScores[dim] ?? "-"));
      } else if (dim === "confidence") {
        row.push("-");
      }
      lines.push(`| ${row.join(" | ")} |`);
    }
    lines.push("");
  }

  // Meta-review sections
  if (metaReview) {
    if (metaReview.summary) {
      lines.push(metaReview.summary.trim(), "");
    }

    if (metaReview.consensus_points?.length > 0) {
      lines.push("## Consensus");
      for (const point of metaReview.consensus_points) {
        lines.push(`- ${point}`);
      }
      lines.push("");
    }

    if (metaReview.disagreements?.length > 0) {
      lines.push("## Disagreements");
      for (const point of metaReview.disagreements) {
        lines.push(`- ${point}`);
      }
      lines.push("");
    }

    if (metaReview.priority_actions?.length > 0) {
      lines.push("## Priority Actions");
      for (let i = 0; i < metaReview.priority_actions.length; i++) {
        lines.push(`${i + 1}. ${metaReview.priority_actions[i]}`);
      }
      lines.push("");
    }
  }

  // Individual reviews
  if (validIndividual.length > 0) {
    lines.push("## Individual Reviews");
    for (const review of validIndividual) {
      const r = review.parsed;
      lines.push("");
      lines.push(`### ${r.persona || review.persona.label}`);
      lines.push(`Recommendation: ${r.recommendation}`);
      lines.push("");
      if (r.summary) {
        lines.push(r.summary.trim(), "");
      }
      if (r.strengths?.length > 0) {
        lines.push("**Strengths:**");
        for (const s of r.strengths) {
          if (typeof s === "string" && s.trim()) lines.push(`- ${s.trim()}`);
        }
        lines.push("");
      }
      if (r.weaknesses?.length > 0) {
        lines.push("**Weaknesses:**");
        for (const w of r.weaknesses) {
          if (typeof w === "string" && w.trim()) lines.push(`- ${w.trim()}`);
        }
        lines.push("");
      }
      if (r.findings?.length > 0) {
        lines.push("**Findings:**");
        for (const f of r.findings) {
          const finding = normalizePaperReviewFinding(f, 0);
          lines.push(`- [${finding.severity}] [${finding.category}] ${finding.title} (Section: ${finding.section})`);
          lines.push(`  ${finding.body}`);
          if (finding.recommendation) {
            lines.push(`  Recommendation: ${finding.recommendation}`);
          }
        }
        lines.push("");
      }
    }
  }

  // Area Chair meta-review assessment
  if (metaReview?.overall_assessment) {
    lines.push("## Area Chair Meta-Review", "");
    lines.push(metaReview.overall_assessment.trim());
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
```

- [ ] **Step 4: Update the import in render.mjs**

The `renderPanelReviewResult` function uses `normalizePaperReviewFinding` which is already defined in the same file (line 329). No additional imports needed.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/render.test.mjs`
Expected: PASS (all tests including new panel test)

- [ ] **Step 6: Commit**

```bash
git add plugins/codex/scripts/lib/render.mjs tests/render.test.mjs
git commit -m "feat: add panel review renderer with score table, consensus, and individual reviews"
```

---

## Task 10: Wire Panel Review into codex-companion.mjs

**Files:**
- Modify: `plugins/codex/scripts/codex-companion.mjs`

- [ ] **Step 1: Add new imports and constants**

At the top of `codex-companion.mjs`, add the panel-review and venue-calibration imports alongside the existing imports, and the new schema constant alongside `PAPER_REVIEW_SCHEMA` (line 67):

Add imports:
```javascript
import {
  PERSONAS,
  executePanelReviewRun as runPanelReview
} from "./lib/panel-review.mjs";
import { getVenueCalibration } from "./lib/venue-calibration.mjs";
```

Add to the render imports:
```javascript
  renderPanelReviewResult,
```

Add constants near `PAPER_REVIEW_SCHEMA`:
```javascript
const PANEL_REVIEW_SCHEMA = path.join(ROOT_DIR, "schemas", "panel-review-output.schema.json");
const META_REVIEW_SCHEMA = path.join(ROOT_DIR, "schemas", "meta-review-output.schema.json");
```

- [ ] **Step 2: Update `handlePaperReview` to support `--panel`, `--venue`, `--reflect`, `--reviewers`**

Replace the current `handlePaperReview` function (lines 775-819) with:

```javascript
async function handlePaperReview(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["model", "effort", "cwd", "title", "venue", "reviewers"],
    booleanOptions: ["json", "background", "wait", "panel", "reflect"],
    aliasMap: {
      m: "model"
    }
  });

  const cwd = resolveCommandCwd(options);
  const workspaceRoot = resolveCommandWorkspace(options);
  const model = normalizeRequestedModel(options.model);
  const effort = normalizeReasoningEffort(options.effort);
  const focusText = positionals.join(" ").trim();
  const paperContent = readStdinIfPiped();

  if (!paperContent) {
    throw new Error("No paper content provided. Pipe the paper text to this command via stdin.");
  }

  const paperTitle = options.title || "";

  if (options.panel) {
    const venueCalibration = options.venue ? getVenueCalibration(options.venue) : null;
    if (options.venue && !venueCalibration) {
      throw new Error(`Unknown venue "${options.venue}". Supported: neurips, icml, iclr, acl, nature, workshop.`);
    }

    const job = createCompanionJob({
      prefix: "review",
      kind: "panel-review",
      title: "Codex Paper Review Panel",
      workspaceRoot,
      jobClass: "review",
      summary: `Panel Review${paperTitle ? `: ${shorten(paperTitle)}` : ""}`
    });

    await runForegroundCommand(
      job,
      async (progress) => {
        const panelResult = await runPanelReview(
          {
            cwd,
            model,
            effort,
            paperContent,
            paperTitle,
            focusText,
            venueCalibration,
            templateRootDir: ROOT_DIR,
            panelSchemaPath: PANEL_REVIEW_SCHEMA,
            metaSchemaPath: META_REVIEW_SCHEMA,
            onProgress: progress
          },
          {
            runAppServerTurn,
            readOutputSchema,
            parseStructuredOutput,
            resolveWorkspaceRoot
          }
        );

        const rendered = renderPanelReviewResult(panelResult, {
          reviewLabel: "Paper Review Panel",
          targetLabel: paperTitle || "academic paper",
          venueLabel: venueCalibration?.name ?? null
        });

        return {
          exitStatus: panelResult.exitStatus,
          threadId: panelResult.threadId,
          turnId: panelResult.turnId,
          payload: panelResult,
          rendered,
          summary: panelResult.metaReview?.summary ?? `Panel review finished.`,
          jobTitle: "Codex Paper Review Panel",
          jobClass: "review"
        };
      },
      { json: options.json }
    );
    return;
  }

  // Single reviewer path (existing)
  const job = createCompanionJob({
    prefix: "review",
    kind: "paper-review",
    title: "Codex Paper Review",
    workspaceRoot,
    jobClass: "review",
    summary: `Paper Review${paperTitle ? `: ${shorten(paperTitle)}` : ""}`
  });

  await runForegroundCommand(
    job,
    (progress) =>
      executePaperReviewRun({
        cwd,
        model,
        effort,
        paperContent,
        paperTitle,
        focusText,
        onProgress: progress
      }),
    { json: options.json }
  );
}
```

- [ ] **Step 3: Update `getJobKindLabel` to handle `"panel-review"`**

```javascript
function getJobKindLabel(kind, jobClass) {
  if (kind === "adversarial-review") {
    return "adversarial-review";
  }
  if (kind === "paper-review") {
    return "paper-review";
  }
  if (kind === "panel-review") {
    return "panel-review";
  }
  return jobClass === "review" ? "review" : "rescue";
}
```

- [ ] **Step 4: Update `printUsage`**

Replace the paper-review usage line with:
```
"  node scripts/codex-companion.mjs paper-review [--panel] [--venue <venue>] [--reflect] [--model <model>] [--effort <effort>] [--title <title>] [focus text]  (reads paper from stdin)",
```

- [ ] **Step 5: Commit**

```bash
git add plugins/codex/scripts/codex-companion.mjs
git commit -m "feat: wire panel review into handlePaperReview with --panel, --venue, --reflect flags"
```

---

## Task 11: Update Command Definition

**Files:**
- Modify: `plugins/codex/commands/paper-review.md`

- [ ] **Step 1: Update the command definition**

Update the YAML frontmatter `argument-hint` to:
```
'<file> [--panel] [--venue <neurips|icml|iclr|acl|nature|workshop>] [--reflect] [--wait|--background] [--model <model>] [--effort <effort>] [--title <title>] [focus ...]'
```

Add a new section after "Paper reading:" describing the panel flags:

```markdown
Panel review mode:
- If `--panel` is present, the companion script runs 3 parallel Codex reviews with distinct personas (Empiricist, Theorist, Practitioner) and then synthesizes them via an Area Chair meta-review.
- `--venue <name>` calibrates the review to a specific venue's standards. Supported: neurips, icml, iclr, acl, nature, workshop.
- `--reflect` adds a self-reflection round where each reviewer refines their initial assessment.
- Panel mode takes significantly longer than single review. Always recommend background.
- Pass all panel flags through to the companion script.
```

Update the `Execution mode rules` to mention: "If `--panel` is present, always recommend background regardless of paper size."

- [ ] **Step 2: Commit**

```bash
git add plugins/codex/commands/paper-review.md
git commit -m "feat: update paper-review command definition with panel, venue, and reflect flags"
```

---

## Task 12: Update Tests

**Files:**
- Modify: `tests/commands.test.mjs`
- Modify: `tests/render.test.mjs`

- [ ] **Step 1: Update command test assertions**

In the existing `paper-review command reads paper via stdin and stays review-only` test, add:
```javascript
  assert.match(source, /--panel/);
  assert.match(source, /--venue/);
  assert.match(source, /--reflect/);
  assert.match(source, /Empiricist.*Theorist.*Practitioner/i);
  assert.match(source, /neurips.*icml.*iclr.*acl.*nature.*workshop/i);
```

- [ ] **Step 2: Add import of `renderPanelReviewResult` in render test**

Update the import line in `tests/render.test.mjs`:
```javascript
import { renderPaperReviewResult, renderPanelReviewResult, renderReviewResult, renderStoredJobResult } from "../plugins/codex/scripts/lib/render.mjs";
```

(The panel review render test was already added in Task 9.)

- [ ] **Step 3: Run all tests**

Run: `node --test tests/*.test.mjs`
Expected: All new tests pass. Pre-existing failures (4 flaky tests) remain unchanged.

- [ ] **Step 4: Commit**

```bash
git add tests/commands.test.mjs tests/render.test.mjs
git commit -m "test: add panel review assertions to command and render tests"
```

---

## Task 13: Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `node --test tests/*.test.mjs`
Expected: All new tests pass (venue-calibration, panel-review, render panel, commands panel assertions).

- [ ] **Step 2: Verify the companion script loads without errors**

Run: `node plugins/codex/scripts/codex-companion.mjs help`
Expected: Shows usage including the paper-review line with `--panel`.

- [ ] **Step 3: Verify schema files are valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('plugins/codex/schemas/panel-review-output.schema.json', 'utf8')); console.log('panel schema OK')"
node -e "JSON.parse(require('fs').readFileSync('plugins/codex/schemas/meta-review-output.schema.json', 'utf8')); console.log('meta schema OK')"
```

- [ ] **Step 4: Commit any final fixes**

---

## Verification Summary

| What | How | Expected |
|------|-----|----------|
| Unit tests | `node --test tests/venue-calibration.test.mjs` | 3 tests pass |
| Panel logic tests | `node --test tests/panel-review.test.mjs` | 5 tests pass |
| Render tests | `node --test tests/render.test.mjs` | All pass (including 2 existing + 1 new panel) |
| Command tests | `node --test tests/commands.test.mjs` | All pass (paper-review assertions updated) |
| Full suite | `node --test tests/*.test.mjs` | No new failures |
| Schema validity | `node -e "JSON.parse(...)"` | OK for both schemas |
| Script loads | `node codex-companion.mjs help` | Usage printed |
| Manual E2E | `echo "paper text" \| node codex-companion.mjs paper-review --panel --venue neurips --title "Test"` | Requires Codex auth |
