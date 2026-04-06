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

export function buildPersonaPrompt({ templateRootDir, persona, paperContent, paperTitle, focusText, venueCalibration, supplementaryDocs }) {
  const template = loadPromptTemplate(templateRootDir, persona.templateName);
  return interpolateTemplate(template, {
    PAPER_TITLE: paperTitle || "Untitled",
    PROPOSAL_TITLE: paperTitle || "Untitled",
    REVIEWER_FOCUS: focusText || "No specific focus provided. Review all dimensions.",
    VENUE_CALIBRATION: venueCalibration || "",
    AGENCY_CALIBRATION: venueCalibration || "",
    SUPPLEMENTARY_DOCS: supplementaryDocs || "",
    PAPER_CONTENT: paperContent,
    PROPOSAL_CONTENT: paperContent
  });
}

export function buildMetaReviewPrompt({ templateRootDir, metaTemplateName, paperTitle, reviewerReviews, venueCalibration }) {
  const template = loadPromptTemplate(templateRootDir, metaTemplateName || "paper-review-meta");
  return interpolateTemplate(template, {
    PAPER_TITLE: paperTitle || "Untitled",
    PROPOSAL_TITLE: paperTitle || "Untitled",
    REVIEWER_REVIEWS: reviewerReviews,
    VENUE_CALIBRATION: venueCalibration || "",
    AGENCY_CALIBRATION: venueCalibration || ""
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

const PAPER_SCORE_DIMENSIONS = ["originality", "methodology", "clarity", "significance", "soundness", "overall"];
const GRANT_SCORE_DIMENSIONS = ["significance", "innovation", "approach", "investigator", "environment", "overall"];

function detectScoreDimensions(reviews) {
  if (reviews.length === 0) {
    return PAPER_SCORE_DIMENSIONS;
  }
  const firstScores = reviews[0].scores;
  if (!firstScores) {
    return PAPER_SCORE_DIMENSIONS;
  }
  if ("investigator" in firstScores || "approach" in firstScores) {
    return GRANT_SCORE_DIMENSIONS;
  }
  return PAPER_SCORE_DIMENSIONS;
}

export function computeWeightedScores(reviews) {
  const dimensions = detectScoreDimensions(reviews);
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
      `Scores: ${Object.entries(review.scores || {}).map(([k, v]) => `${k}=${v}`).join(", ")}`,
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

    if (review.budget_assessment) {
      lines.push(`Budget Assessment: ${review.budget_assessment}`, "");
    }
    if (review.timeline_assessment) {
      lines.push(`Timeline Assessment: ${review.timeline_assessment}`, "");
    }
    if (review.risk_assessment) {
      lines.push(`Risk Assessment: ${review.risk_assessment}`, "");
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

  const personaPromises = personas.map((persona) => {
    const prompt = buildPersonaPrompt({
      templateRootDir: request.templateRootDir,
      persona,
      paperContent: request.paperContent,
      paperTitle: request.paperTitle,
      focusText: request.focusText,
      venueCalibration,
      supplementaryDocs: request.supplementaryDocs ?? ""
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

  const settledResults = await Promise.allSettled(personaPromises);
  const personaResults = settledResults.map((settled) =>
    settled.status === "fulfilled" ? settled.value : { status: 1, finalMessage: "", error: settled.reason, stderr: String(settled.reason?.message ?? settled.reason ?? ""), reasoningSummary: [] }
  );

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

  const validReviews = parsedReviews
    .filter((r) => r.parsed != null && typeof r.parsed.recommendation === "string" && r.parsed.scores != null)
    .map((r) => r.parsed);

  if (validReviews.length === 0) {
    return {
      exitStatus: 1,
      threadId: null,
      turnId: null,
      individualReviews: parsedReviews,
      validReviews,
      metaReview: null,
      weightedScores: {},
      venueCalibration: request.venueCalibration
    };
  }

  const reviewsText = formatReviewsForMetaPrompt(validReviews);
  const metaPrompt = buildMetaReviewPrompt({
    templateRootDir: request.templateRootDir,
    metaTemplateName: request.metaTemplateName,
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

  const weightedScores = computeWeightedScores(validReviews);
  const incompletePanel = validReviews.length < personas.length;
  const metaReviewFailed = metaParsed == null;

  return {
    exitStatus: (metaReviewFailed || incompletePanel) ? 1 : metaResult.status,
    threadId: metaResult.threadId,
    turnId: metaResult.turnId,
    individualReviews: parsedReviews,
    validReviews,
    metaReview: metaParsed,
    metaReviewFailed,
    incompletePanel,
    weightedScores,
    venueCalibration: request.venueCalibration
  };
}
