function severityRank(severity) {
  switch (severity) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    default:
      return 3;
  }
}

function formatLineRange(finding) {
  if (!finding.line_start) {
    return "";
  }
  if (!finding.line_end || finding.line_end === finding.line_start) {
    return `:${finding.line_start}`;
  }
  return `:${finding.line_start}-${finding.line_end}`;
}

function validateReviewResultShape(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "Expected a top-level JSON object.";
  }
  if (typeof data.verdict !== "string" || !data.verdict.trim()) {
    return "Missing string `verdict`.";
  }
  if (typeof data.summary !== "string" || !data.summary.trim()) {
    return "Missing string `summary`.";
  }
  if (!Array.isArray(data.findings)) {
    return "Missing array `findings`.";
  }
  if (!Array.isArray(data.next_steps)) {
    return "Missing array `next_steps`.";
  }
  return null;
}

function normalizeReviewFinding(finding, index) {
  const source = finding && typeof finding === "object" && !Array.isArray(finding) ? finding : {};
  const lineStart = Number.isInteger(source.line_start) && source.line_start > 0 ? source.line_start : null;
  const lineEnd =
    Number.isInteger(source.line_end) && source.line_end > 0 && (!lineStart || source.line_end >= lineStart)
      ? source.line_end
      : lineStart;

  return {
    severity: typeof source.severity === "string" && source.severity.trim() ? source.severity.trim() : "low",
    title: typeof source.title === "string" && source.title.trim() ? source.title.trim() : `Finding ${index + 1}`,
    body: typeof source.body === "string" && source.body.trim() ? source.body.trim() : "No details provided.",
    file: typeof source.file === "string" && source.file.trim() ? source.file.trim() : "unknown",
    line_start: lineStart,
    line_end: lineEnd,
    recommendation: typeof source.recommendation === "string" ? source.recommendation.trim() : ""
  };
}

function normalizeReviewResultData(data) {
  return {
    verdict: data.verdict.trim(),
    summary: data.summary.trim(),
    findings: data.findings.map((finding, index) => normalizeReviewFinding(finding, index)),
    next_steps: data.next_steps
      .filter((step) => typeof step === "string" && step.trim())
      .map((step) => step.trim())
  };
}

function isStructuredReviewStoredResult(storedJob) {
  const result = storedJob?.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return false;
  }
  return (
    Object.prototype.hasOwnProperty.call(result, "result") ||
    Object.prototype.hasOwnProperty.call(result, "parseError")
  );
}

function formatJobLine(job) {
  const parts = [job.id, `${job.status || "unknown"}`];
  if (job.kindLabel) {
    parts.push(job.kindLabel);
  }
  if (job.title) {
    parts.push(job.title);
  }
  return parts.join(" | ");
}

function escapeMarkdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function formatCodexResumeCommand(job) {
  if (!job?.threadId) {
    return null;
  }
  return `codex resume ${job.threadId}`;
}

function appendActiveJobsTable(lines, jobs) {
  lines.push("Active jobs:");
  lines.push("| Job | Kind | Status | Phase | Elapsed | Codex Session ID | Summary | Actions |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const job of jobs) {
    const actions = [`/codex:status ${job.id}`];
    if (job.status === "queued" || job.status === "running") {
      actions.push(`/codex:cancel ${job.id}`);
    }
    lines.push(
      `| ${escapeMarkdownCell(job.id)} | ${escapeMarkdownCell(job.kindLabel)} | ${escapeMarkdownCell(job.status)} | ${escapeMarkdownCell(job.phase ?? "")} | ${escapeMarkdownCell(job.elapsed ?? "")} | ${escapeMarkdownCell(job.threadId ?? "")} | ${escapeMarkdownCell(job.summary ?? "")} | ${actions.map((action) => `\`${action}\``).join("<br>")} |`
    );
  }
}

function pushJobDetails(lines, job, options = {}) {
  lines.push(`- ${formatJobLine(job)}`);
  if (job.summary) {
    lines.push(`  Summary: ${job.summary}`);
  }
  if (job.phase) {
    lines.push(`  Phase: ${job.phase}`);
  }
  if (options.showElapsed && job.elapsed) {
    lines.push(`  Elapsed: ${job.elapsed}`);
  }
  if (options.showDuration && job.duration) {
    lines.push(`  Duration: ${job.duration}`);
  }
  if (job.threadId) {
    lines.push(`  Codex session ID: ${job.threadId}`);
  }
  const resumeCommand = formatCodexResumeCommand(job);
  if (resumeCommand) {
    lines.push(`  Resume in Codex: ${resumeCommand}`);
  }
  if (job.logFile && options.showLog) {
    lines.push(`  Log: ${job.logFile}`);
  }
  if ((job.status === "queued" || job.status === "running") && options.showCancelHint) {
    lines.push(`  Cancel: /codex:cancel ${job.id}`);
  }
  if (job.status !== "queued" && job.status !== "running" && options.showResultHint) {
    lines.push(`  Result: /codex:result ${job.id}`);
  }
  if (job.status !== "queued" && job.status !== "running" && job.jobClass === "task" && job.write && options.showReviewHint) {
    lines.push("  Review changes: /codex:review --wait");
    lines.push("  Stricter review: /codex:adversarial-review --wait");
  }
  if (job.progressPreview?.length) {
    lines.push("  Progress:");
    for (const line of job.progressPreview) {
      lines.push(`    ${line}`);
    }
  }
}

function appendReasoningSection(lines, reasoningSummary) {
  if (!Array.isArray(reasoningSummary) || reasoningSummary.length === 0) {
    return;
  }

  lines.push("", "Reasoning:");
  for (const section of reasoningSummary) {
    lines.push(`- ${section}`);
  }
}

export function renderSetupReport(report) {
  const lines = [
    "# Codex Setup",
    "",
    `Status: ${report.ready ? "ready" : "needs attention"}`,
    "",
    "Checks:",
    `- node: ${report.node.detail}`,
    `- npm: ${report.npm.detail}`,
    `- codex: ${report.codex.detail}`,
    `- auth: ${report.auth.detail}`,
    `- session runtime: ${report.sessionRuntime.label}`,
    `- review gate: ${report.reviewGateEnabled ? "enabled" : "disabled"}`,
    ""
  ];

  if (report.actionsTaken.length > 0) {
    lines.push("Actions taken:");
    for (const action of report.actionsTaken) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  }

  if (report.nextSteps.length > 0) {
    lines.push("Next steps:");
    for (const step of report.nextSteps) {
      lines.push(`- ${step}`);
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderReviewResult(parsedResult, meta) {
  if (!parsedResult.parsed) {
    const lines = [
      `# Codex ${meta.reviewLabel}`,
      "",
      "Codex did not return valid structured JSON.",
      "",
      `- Parse error: ${parsedResult.parseError}`
    ];

    if (parsedResult.rawOutput) {
      lines.push("", "Raw final message:", "", "```text", parsedResult.rawOutput, "```");
    }

    appendReasoningSection(lines, meta.reasoningSummary ?? parsedResult.reasoningSummary);

    return `${lines.join("\n").trimEnd()}\n`;
  }

  const validationError = validateReviewResultShape(parsedResult.parsed);
  if (validationError) {
    const lines = [
      `# Codex ${meta.reviewLabel}`,
      "",
      `Target: ${meta.targetLabel}`,
      "Codex returned JSON with an unexpected review shape.",
      "",
      `- Validation error: ${validationError}`
    ];

    if (parsedResult.rawOutput) {
      lines.push("", "Raw final message:", "", "```text", parsedResult.rawOutput, "```");
    }

    appendReasoningSection(lines, meta.reasoningSummary ?? parsedResult.reasoningSummary);

    return `${lines.join("\n").trimEnd()}\n`;
  }

  const data = normalizeReviewResultData(parsedResult.parsed);
  const findings = [...data.findings].sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
  const lines = [
    `# Codex ${meta.reviewLabel}`,
    "",
    `Target: ${meta.targetLabel}`,
    `Verdict: ${data.verdict}`,
    "",
    data.summary,
    ""
  ];

  if (findings.length === 0) {
    lines.push("No material findings.");
  } else {
    lines.push("Findings:");
    for (const finding of findings) {
      const lineSuffix = formatLineRange(finding);
      lines.push(`- [${finding.severity}] ${finding.title} (${finding.file}${lineSuffix})`);
      lines.push(`  ${finding.body}`);
      if (finding.recommendation) {
        lines.push(`  Recommendation: ${finding.recommendation}`);
      }
    }
  }

  if (data.next_steps.length > 0) {
    lines.push("", "Next steps:");
    for (const step of data.next_steps) {
      lines.push(`- ${step}`);
    }
  }

  appendReasoningSection(lines, meta.reasoningSummary);

  return `${lines.join("\n").trimEnd()}\n`;
}

function paperSeverityRank(severity) {
  switch (severity) {
    case "critical":
      return 0;
    case "major":
      return 1;
    case "minor":
      return 2;
    default:
      return 3;
  }
}

function validatePaperReviewResultShape(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "Expected a top-level JSON object.";
  }
  if (typeof data.recommendation !== "string" || !data.recommendation.trim()) {
    return "Missing string `recommendation`.";
  }
  if (typeof data.summary !== "string" || !data.summary.trim()) {
    return "Missing string `summary`.";
  }
  if (!Array.isArray(data.strengths)) {
    return "Missing array `strengths`.";
  }
  if (!Array.isArray(data.weaknesses)) {
    return "Missing array `weaknesses`.";
  }
  if (!Array.isArray(data.findings)) {
    return "Missing array `findings`.";
  }
  if (!Array.isArray(data.questions_for_authors)) {
    return "Missing array `questions_for_authors`.";
  }
  if (typeof data.overall_assessment !== "string" || !data.overall_assessment.trim()) {
    return "Missing string `overall_assessment`.";
  }
  return null;
}

function normalizePaperReviewFinding(finding, index) {
  const source = finding && typeof finding === "object" && !Array.isArray(finding) ? finding : {};
  return {
    category: typeof source.category === "string" && source.category.trim() ? source.category.trim() : "methodology",
    severity: typeof source.severity === "string" && source.severity.trim() ? source.severity.trim() : "minor",
    title: typeof source.title === "string" && source.title.trim() ? source.title.trim() : `Finding ${index + 1}`,
    body: typeof source.body === "string" && source.body.trim() ? source.body.trim() : "No details provided.",
    section: typeof source.section === "string" && source.section.trim() ? source.section.trim() : "unknown",
    recommendation: typeof source.recommendation === "string" ? source.recommendation.trim() : ""
  };
}

export function renderPaperReviewResult(parsedResult, meta) {
  if (!parsedResult.parsed) {
    const lines = [
      `# Codex ${meta.reviewLabel}`,
      "",
      "Codex did not return valid structured JSON.",
      "",
      `- Parse error: ${parsedResult.parseError}`
    ];

    if (parsedResult.rawOutput) {
      lines.push("", "Raw final message:", "", "```text", parsedResult.rawOutput, "```");
    }

    appendReasoningSection(lines, meta.reasoningSummary ?? parsedResult.reasoningSummary);

    return `${lines.join("\n").trimEnd()}\n`;
  }

  const validationError = validatePaperReviewResultShape(parsedResult.parsed);
  if (validationError) {
    const lines = [
      `# Codex ${meta.reviewLabel}`,
      "",
      `Paper: ${meta.targetLabel}`,
      "Codex returned JSON with an unexpected review shape.",
      "",
      `- Validation error: ${validationError}`
    ];

    if (parsedResult.rawOutput) {
      lines.push("", "Raw final message:", "", "```text", parsedResult.rawOutput, "```");
    }

    appendReasoningSection(lines, meta.reasoningSummary ?? parsedResult.reasoningSummary);

    return `${lines.join("\n").trimEnd()}\n`;
  }

  const data = parsedResult.parsed;
  const findings = data.findings
    .map((finding, index) => normalizePaperReviewFinding(finding, index))
    .sort((left, right) => paperSeverityRank(left.severity) - paperSeverityRank(right.severity));

  const lines = [
    `# Codex ${meta.reviewLabel}`,
    "",
    `Paper: ${meta.targetLabel}`,
    `Recommendation: ${data.recommendation}`,
    "",
    data.summary.trim(),
    ""
  ];

  if (data.strengths.length > 0) {
    lines.push("## Strengths");
    for (const strength of data.strengths) {
      if (typeof strength === "string" && strength.trim()) {
        lines.push(`- ${strength.trim()}`);
      }
    }
    lines.push("");
  }

  if (data.weaknesses.length > 0) {
    lines.push("## Weaknesses");
    for (const weakness of data.weaknesses) {
      if (typeof weakness === "string" && weakness.trim()) {
        lines.push(`- ${weakness.trim()}`);
      }
    }
    lines.push("");
  }

  if (findings.length === 0) {
    lines.push("No material findings.");
  } else {
    lines.push("## Findings");
    for (const finding of findings) {
      lines.push(`- [${finding.severity}] [${finding.category}] ${finding.title} (Section: ${finding.section})`);
      lines.push(`  ${finding.body}`);
      if (finding.recommendation) {
        lines.push(`  Recommendation: ${finding.recommendation}`);
      }
    }
  }

  if (data.questions_for_authors.length > 0) {
    lines.push("", "## Questions for Authors");
    for (const question of data.questions_for_authors) {
      if (typeof question === "string" && question.trim()) {
        lines.push(`- ${question.trim()}`);
      }
    }
  }

  lines.push("", "## Overall Assessment", "", data.overall_assessment.trim());

  appendReasoningSection(lines, meta.reasoningSummary);

  return `${lines.join("\n").trimEnd()}\n`;
}

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

  if (panelResult.incompletePanel) {
    lines.push(`**Warning:** Only ${validIndividual.length} of the expected reviewers returned valid results. The panel recommendation may be less reliable.`, "");
  }

  if (panelResult.metaReviewFailed) {
    lines.push("**Warning:** The Area Chair meta-review could not be parsed. Individual reviewer results are shown below without synthesis.", "");
  }

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

  if (metaReview?.overall_assessment) {
    lines.push("## Area Chair Meta-Review", "");
    lines.push(metaReview.overall_assessment.trim());
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function validateGrantReviewResultShape(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "Expected a top-level JSON object.";
  }
  if (typeof data.recommendation !== "string" || !data.recommendation.trim()) {
    return "Missing string `recommendation`.";
  }
  if (typeof data.impact_score !== "number") {
    return "Missing number `impact_score`.";
  }
  if (typeof data.summary !== "string" || !data.summary.trim()) {
    return "Missing string `summary`.";
  }
  if (!data.criterion_scores || typeof data.criterion_scores !== "object" || Array.isArray(data.criterion_scores)) {
    return "Missing object `criterion_scores`.";
  }
  for (const dim of ["significance", "innovation", "approach", "investigator", "environment"]) {
    const cs = data.criterion_scores[dim];
    if (!cs || typeof cs !== "object" || Array.isArray(cs)) {
      return `Missing criterion_scores.${dim} object.`;
    }
    if (typeof cs.score !== "number") {
      return `Missing number criterion_scores.${dim}.score.`;
    }
    if (typeof cs.rationale !== "string") {
      return `Missing string criterion_scores.${dim}.rationale.`;
    }
  }
  if (!Array.isArray(data.strengths)) {
    return "Missing array `strengths`.";
  }
  if (!Array.isArray(data.weaknesses)) {
    return "Missing array `weaknesses`.";
  }
  if (!Array.isArray(data.findings)) {
    return "Missing array `findings`.";
  }
  if (typeof data.budget_assessment !== "string" || !data.budget_assessment.trim()) {
    return "Missing string `budget_assessment`.";
  }
  if (typeof data.timeline_assessment !== "string" || !data.timeline_assessment.trim()) {
    return "Missing string `timeline_assessment`.";
  }
  if (typeof data.risk_assessment !== "string" || !data.risk_assessment.trim()) {
    return "Missing string `risk_assessment`.";
  }
  if (!Array.isArray(data.recommendations_for_revision)) {
    return "Missing array `recommendations_for_revision`.";
  }
  return null;
}

function normalizeGrantFinding(finding, index) {
  const source = finding && typeof finding === "object" && !Array.isArray(finding) ? finding : {};
  return {
    category: typeof source.category === "string" && source.category.trim() ? source.category.trim() : "approach",
    severity: typeof source.severity === "string" && source.severity.trim() ? source.severity.trim() : "minor",
    title: typeof source.title === "string" && source.title.trim() ? source.title.trim() : `Finding ${index + 1}`,
    body: typeof source.body === "string" && source.body.trim() ? source.body.trim() : "No details provided.",
    section: typeof source.section === "string" && source.section.trim() ? source.section.trim() : "unknown",
    recommendation: typeof source.recommendation === "string" ? source.recommendation.trim() : ""
  };
}

export function renderGrantReviewResult(parsedResult, meta) {
  if (!parsedResult.parsed) {
    const lines = [
      `# Codex ${meta.reviewLabel}`,
      "",
      "Codex did not return valid structured JSON.",
      "",
      `- Parse error: ${parsedResult.parseError}`
    ];

    if (parsedResult.rawOutput) {
      lines.push("", "Raw final message:", "", "```text", parsedResult.rawOutput, "```");
    }

    appendReasoningSection(lines, meta.reasoningSummary ?? parsedResult.reasoningSummary);

    return `${lines.join("\n").trimEnd()}\n`;
  }

  const validationError = validateGrantReviewResultShape(parsedResult.parsed);
  if (validationError) {
    const lines = [
      `# Codex ${meta.reviewLabel}`,
      "",
      `Proposal: ${meta.targetLabel}`,
      "Codex returned JSON with an unexpected review shape.",
      "",
      `- Validation error: ${validationError}`
    ];

    if (parsedResult.rawOutput) {
      lines.push("", "Raw final message:", "", "```text", parsedResult.rawOutput, "```");
    }

    appendReasoningSection(lines, meta.reasoningSummary ?? parsedResult.reasoningSummary);

    return `${lines.join("\n").trimEnd()}\n`;
  }

  const data = parsedResult.parsed;
  const findings = data.findings
    .map((finding, index) => normalizeGrantFinding(finding, index))
    .sort((left, right) => paperSeverityRank(left.severity) - paperSeverityRank(right.severity));

  const lines = [
    `# Codex ${meta.reviewLabel}`,
    "",
    `Proposal: ${meta.targetLabel}`,
    `Recommendation: ${data.recommendation}`,
    `Impact Score: ${data.impact_score}`,
    "",
    data.summary.trim(),
    ""
  ];

  const criterionDimensions = ["significance", "innovation", "approach", "investigator", "environment"];
  lines.push("## Criterion Scores");
  lines.push("| Criterion | Score | Rationale |");
  lines.push("| --- | --- | --- |");
  for (const dim of criterionDimensions) {
    const cs = data.criterion_scores[dim];
    const label = dim.charAt(0).toUpperCase() + dim.slice(1);
    lines.push(`| ${label} | ${cs.score} | ${escapeMarkdownCell(cs.rationale)} |`);
  }
  lines.push("");

  if (data.strengths.length > 0) {
    lines.push("## Strengths");
    for (const strength of data.strengths) {
      if (typeof strength === "string" && strength.trim()) {
        lines.push(`- ${strength.trim()}`);
      }
    }
    lines.push("");
  }

  if (data.weaknesses.length > 0) {
    lines.push("## Weaknesses");
    for (const weakness of data.weaknesses) {
      if (typeof weakness === "string" && weakness.trim()) {
        lines.push(`- ${weakness.trim()}`);
      }
    }
    lines.push("");
  }

  if (findings.length === 0) {
    lines.push("No material findings.");
  } else {
    lines.push("## Findings");
    for (const finding of findings) {
      lines.push(`- [${finding.severity}] [${finding.category}] ${finding.title} (Section: ${finding.section})`);
      lines.push(`  ${finding.body}`);
      if (finding.recommendation) {
        lines.push(`  Recommendation: ${finding.recommendation}`);
      }
    }
  }

  lines.push("", "## Budget Assessment", "", data.budget_assessment.trim());
  lines.push("", "## Timeline Assessment", "", data.timeline_assessment.trim());
  lines.push("", "## Risk Assessment", "", data.risk_assessment.trim());

  if (data.recommendations_for_revision.length > 0) {
    lines.push("", "## Recommendations for Revision");
    for (let i = 0; i < data.recommendations_for_revision.length; i++) {
      const item = data.recommendations_for_revision[i];
      if (typeof item === "string" && item.trim()) {
        lines.push(`${i + 1}. ${item.trim()}`);
      }
    }
  }

  appendReasoningSection(lines, meta.reasoningSummary);

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderGrantPanelReviewResult(panelResult, meta) {
  const { individualReviews, metaReview, weightedScores } = panelResult;
  const validIndividual = individualReviews.filter((r) => r.parsed != null);

  if (validIndividual.length === 0 && !metaReview) {
    return `# Codex ${meta.reviewLabel}\n\nNo valid reviews were returned by the panel.\n`;
  }

  const recommendation = metaReview?.recommendation ?? validIndividual[0]?.parsed?.recommendation ?? "unknown";
  const lines = [
    `# Codex ${meta.reviewLabel}`,
    "",
    `Proposal: ${meta.targetLabel}`,
    `Recommendation: ${recommendation}`
  ];

  if (meta.agencyLabel) {
    lines.push(`Agency: ${meta.agencyLabel}`);
  }

  lines.push(`Panel: ${validIndividual.length} reviewers + Panel Chair`, "");

  if (panelResult.incompletePanel) {
    lines.push(`**Warning:** Only ${validIndividual.length} of the expected reviewers returned valid results. The panel recommendation may be less reliable.`, "");
  }

  if (panelResult.metaReviewFailed) {
    lines.push("**Warning:** The Panel Chair meta-review could not be parsed. Individual reviewer results are shown below without synthesis.", "");
  }

  if (validIndividual.length > 0) {
    const dimensions = ["significance", "innovation", "approach", "investigator", "environment", "overall", "confidence"];
    const headers = ["Criterion", ...validIndividual.map((r) => r.persona.label.replace("The ", ""))];
    if (weightedScores) {
      headers.push("Weighted Avg");
    }

    lines.push("## Score Summary");
    lines.push(`| ${headers.join(" | ")} |`);
    lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

    for (const dim of dimensions) {
      const row = [dim.charAt(0).toUpperCase() + dim.slice(1)];
      for (const review of validIndividual) {
        const cs = review.parsed.criterion_scores?.[dim];
        const scoreVal = cs?.score ?? review.parsed.scores?.[dim] ?? "-";
        row.push(String(scoreVal));
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

    if (metaReview.budget_consensus) {
      lines.push("## Budget Consensus", "", metaReview.budget_consensus.trim(), "");
    }

    if (metaReview.risk_consensus) {
      lines.push("## Risk Consensus", "", metaReview.risk_consensus.trim(), "");
    }

    if (metaReview.priority_actions?.length > 0) {
      lines.push("## Priority Actions");
      for (let i = 0; i < metaReview.priority_actions.length; i++) {
        lines.push(`${i + 1}. ${metaReview.priority_actions[i]}`);
      }
      lines.push("");
    }
  }

  if (validIndividual.length > 0) {
    lines.push("## Individual Reviews");
    for (const review of validIndividual) {
      const r = review.parsed;
      lines.push("");
      lines.push(`### ${r.persona || review.persona.label}`);
      lines.push(`Recommendation: ${r.recommendation}`);
      lines.push(`Impact Score: ${r.impact_score}`);
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
          const finding = normalizeGrantFinding(f, 0);
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

  if (metaReview?.overall_assessment) {
    lines.push("## Panel Chair Summary", "");
    lines.push(metaReview.overall_assessment.trim());
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderCodeAlignmentResult(alignmentResult) {
  if (!alignmentResult || !alignmentResult.parsed) {
    if (alignmentResult?.rawOutput) {
      return `## Code-Methods Alignment\n\nCould not parse alignment results.\n\n\`\`\`text\n${alignmentResult.rawOutput}\n\`\`\`\n`;
    }
    return "## Code-Methods Alignment\n\nCode alignment review did not return results.\n";
  }

  const data = alignmentResult.parsed;
  if (!data.alignment_verdict || !Array.isArray(data.alignment_findings)) {
    return `## Code-Methods Alignment\n\nCode alignment returned incomplete results (missing verdict or findings).\n\n\`\`\`text\n${alignmentResult.rawOutput || JSON.stringify(data)}\n\`\`\`\n`;
  }

  const lines = [
    "## Code-Methods Alignment",
    "",
    `Verdict: ${data.alignment_verdict}`,
    ""
  ];

  if (data.summary) {
    lines.push(data.summary.trim(), "");
  }

  if (data.alignment_findings?.length > 0) {
    lines.push("### Alignment Findings");
    for (const finding of data.alignment_findings) {
      lines.push(`- [${finding.severity || "info"}] [${finding.category || "method-mismatch"}] ${finding.title || "Finding"}`);
      if (finding.paper_claim) {
        lines.push(`  Paper claims: ${finding.paper_claim}`);
      }
      if (finding.code_evidence) {
        lines.push(`  Code shows: ${finding.code_evidence}`);
      }
      if (finding.recommendation) {
        lines.push(`  Recommendation: ${finding.recommendation}`);
      }
    }
    lines.push("");
  } else {
    lines.push("No alignment discrepancies found.", "");
  }

  if (data.reproducibility_assessment) {
    lines.push("### Reproducibility Assessment", "", data.reproducibility_assessment.trim());
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderNativeReviewResult(result, meta) {
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  const lines = [
    `# Codex ${meta.reviewLabel}`,
    "",
    `Target: ${meta.targetLabel}`,
    ""
  ];

  if (stdout) {
    lines.push(stdout);
  } else if (result.status === 0) {
    lines.push("Codex review completed without any stdout output.");
  } else {
    lines.push("Codex review failed.");
  }

  if (stderr) {
    lines.push("", "stderr:", "", "```text", stderr, "```");
  }

  appendReasoningSection(lines, meta.reasoningSummary);

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderTaskResult(parsedResult, meta) {
  const rawOutput = typeof parsedResult?.rawOutput === "string" ? parsedResult.rawOutput : "";
  if (rawOutput) {
    return rawOutput.endsWith("\n") ? rawOutput : `${rawOutput}\n`;
  }

  const message = String(parsedResult?.failureMessage ?? "").trim() || "Codex did not return a final message.";
  return `${message}\n`;
}

export function renderStatusReport(report) {
  const lines = [
    "# Codex Status",
    "",
    `Session runtime: ${report.sessionRuntime.label}`,
    `Review gate: ${report.config.stopReviewGate ? "enabled" : "disabled"}`,
    ""
  ];

  if (report.running.length > 0) {
    appendActiveJobsTable(lines, report.running);
    lines.push("");
    lines.push("Live details:");
    for (const job of report.running) {
      pushJobDetails(lines, job, {
        showElapsed: true,
        showLog: true
      });
    }
    lines.push("");
  }

  if (report.latestFinished) {
    lines.push("Latest finished:");
    pushJobDetails(lines, report.latestFinished, {
      showDuration: true,
      showLog: report.latestFinished.status === "failed"
    });
    lines.push("");
  }

  if (report.recent.length > 0) {
    lines.push("Recent jobs:");
    for (const job of report.recent) {
      pushJobDetails(lines, job, {
        showDuration: true,
        showLog: job.status === "failed"
      });
    }
    lines.push("");
  } else if (report.running.length === 0 && !report.latestFinished) {
    lines.push("No jobs recorded yet.", "");
  }

  if (report.needsReview) {
    lines.push("The stop-time review gate is enabled.");
    lines.push("Ending the session will trigger a fresh Codex adversarial review and block if it finds issues.");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderJobStatusReport(job) {
  const lines = ["# Codex Job Status", ""];
  pushJobDetails(lines, job, {
    showElapsed: job.status === "queued" || job.status === "running",
    showDuration: job.status !== "queued" && job.status !== "running",
    showLog: true,
    showCancelHint: true,
    showResultHint: true,
    showReviewHint: true
  });
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderStoredJobResult(job, storedJob) {
  const threadId = storedJob?.threadId ?? job.threadId ?? null;
  const resumeCommand = threadId ? `codex resume ${threadId}` : null;
  if (isStructuredReviewStoredResult(storedJob) && storedJob?.rendered) {
    const output = storedJob.rendered.endsWith("\n") ? storedJob.rendered : `${storedJob.rendered}\n`;
    if (!threadId) {
      return output;
    }
    return `${output}\nCodex session ID: ${threadId}\nResume in Codex: ${resumeCommand}\n`;
  }

  const rawOutput =
    (typeof storedJob?.result?.rawOutput === "string" && storedJob.result.rawOutput) ||
    (typeof storedJob?.result?.codex?.stdout === "string" && storedJob.result.codex.stdout) ||
    "";
  if (rawOutput) {
    const output = rawOutput.endsWith("\n") ? rawOutput : `${rawOutput}\n`;
    if (!threadId) {
      return output;
    }
    return `${output}\nCodex session ID: ${threadId}\nResume in Codex: ${resumeCommand}\n`;
  }

  if (storedJob?.rendered) {
    const output = storedJob.rendered.endsWith("\n") ? storedJob.rendered : `${storedJob.rendered}\n`;
    if (!threadId) {
      return output;
    }
    return `${output}\nCodex session ID: ${threadId}\nResume in Codex: ${resumeCommand}\n`;
  }

  const lines = [
    `# ${job.title ?? "Codex Result"}`,
    "",
    `Job: ${job.id}`,
    `Status: ${job.status}`
  ];

  if (threadId) {
    lines.push(`Codex session ID: ${threadId}`);
    lines.push(`Resume in Codex: ${resumeCommand}`);
  }

  if (job.summary) {
    lines.push(`Summary: ${job.summary}`);
  }

  if (job.errorMessage) {
    lines.push("", job.errorMessage);
  } else if (storedJob?.errorMessage) {
    lines.push("", storedJob.errorMessage);
  } else {
    lines.push("", "No captured result payload was stored for this job.");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderCancelReport(job) {
  const lines = [
    "# Codex Cancel",
    "",
    `Cancelled ${job.id}.`,
    ""
  ];

  if (job.title) {
    lines.push(`- Title: ${job.title}`);
  }
  if (job.summary) {
    lines.push(`- Summary: ${job.summary}`);
  }
  lines.push("- Check `/codex:status` for the updated queue.");

  return `${lines.join("\n").trimEnd()}\n`;
}
