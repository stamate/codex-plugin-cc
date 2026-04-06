#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseArgs, splitRawArgumentString } from "./lib/args.mjs";
import {
    buildPersistentTaskThreadName,
    DEFAULT_CONTINUE_PROMPT,
    findLatestTaskThread,
    getCodexAvailability,
    getCodexLoginStatus,
    getSessionRuntimeStatus,
    interruptAppServerTurn,
    parseStructuredOutput,
    readOutputSchema,
    runAppServerReview,
    runAppServerTurn
  } from "./lib/codex.mjs";
import { readStdinIfPiped } from "./lib/fs.mjs";
import { collectReviewContext, ensureGitRepository, resolveReviewTarget } from "./lib/git.mjs";
import { binaryAvailable, terminateProcessTree } from "./lib/process.mjs";
import { loadPromptTemplate, interpolateTemplate } from "./lib/prompts.mjs";
import {
  generateJobId,
  getConfig,
  listJobs,
  setConfig,
  upsertJob,
  writeJobFile
} from "./lib/state.mjs";
import {
  buildSingleJobSnapshot,
  buildStatusSnapshot,
  readStoredJob,
  resolveCancelableJob,
  resolveResultJob,
  sortJobsNewestFirst
} from "./lib/job-control.mjs";
import {
  appendLogLine,
  createJobLogFile,
  createJobProgressUpdater,
  createJobRecord,
  createProgressReporter,
  nowIso,
  runTrackedJob,
  SESSION_ID_ENV
} from "./lib/tracked-jobs.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";
import {
  renderCodeAlignmentResult,
  renderNativeReviewResult,
  renderPaperReviewResult,
  renderPanelReviewResult,
  renderGrantReviewResult,
  renderGrantPanelReviewResult,
  renderReviewResult,
  renderStoredJobResult,
  renderCancelReport,
  renderJobStatusReport,
  renderSetupReport,
  renderStatusReport,
  renderTaskResult
} from "./lib/render.mjs";
import {
  PERSONAS,
  executePanelReviewRun as runPanelReview,
  extractJsonFromThoughtResponse
} from "./lib/panel-review.mjs";
import { getVenueCalibration } from "./lib/venue-calibration.mjs";
import { getAgencyCalibration } from "./lib/agency-calibration.mjs";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const REVIEW_SCHEMA = path.join(ROOT_DIR, "schemas", "review-output.schema.json");
const PAPER_REVIEW_SCHEMA = path.join(ROOT_DIR, "schemas", "paper-review-output.schema.json");
const PANEL_REVIEW_SCHEMA = path.join(ROOT_DIR, "schemas", "panel-review-output.schema.json");
const META_REVIEW_SCHEMA = path.join(ROOT_DIR, "schemas", "meta-review-output.schema.json");
const GRANT_REVIEW_SCHEMA = path.join(ROOT_DIR, "schemas", "grant-review-output.schema.json");
const GRANT_PANEL_REVIEW_SCHEMA = path.join(ROOT_DIR, "schemas", "grant-panel-review-output.schema.json");
const GRANT_META_REVIEW_SCHEMA = path.join(ROOT_DIR, "schemas", "grant-meta-review-output.schema.json");
const CODE_ALIGNMENT_SCHEMA = path.join(ROOT_DIR, "schemas", "code-alignment-output.schema.json");
const DEFAULT_STATUS_WAIT_TIMEOUT_MS = 240000;
const DEFAULT_STATUS_POLL_INTERVAL_MS = 2000;
const VALID_REASONING_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh"]);
const MODEL_ALIASES = new Map([["spark", "gpt-5.3-codex-spark"]]);
const STOP_REVIEW_TASK_MARKER = "Run a stop-gate review of the previous Claude turn.";

const GRANT_PERSONAS = [
  { id: "scientific", label: "The Scientific Reviewer", templateName: "grant-review-scientific" },
  { id: "program-officer", label: "The Program Officer", templateName: "grant-review-program-officer" },
  { id: "feasibility", label: "The Feasibility Assessor", templateName: "grant-review-feasibility" }
];

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/codex-companion.mjs setup [--enable-review-gate|--disable-review-gate] [--json]",
      "  node scripts/codex-companion.mjs paper-review [--panel] [--venue <venue>] [--docs <folder>] [--code <path>] [--model <model>] [--effort <effort>] [--title <title>] [focus text]  (reads paper from stdin)",
      "  node scripts/codex-companion.mjs grant-review [--panel] [--agency <agency>] [--docs <folder>] [--code <path>] [--model <model>] [--effort <effort>] [--title <title>] [focus text]  (reads proposal from stdin)",
      "  node scripts/codex-companion.mjs review [--wait|--background] [--base <ref>] [--scope <auto|working-tree|branch>]",
      "  node scripts/codex-companion.mjs adversarial-review [--wait|--background] [--base <ref>] [--scope <auto|working-tree|branch>] [focus text]",
      "  node scripts/codex-companion.mjs task [--background] [--write] [--resume-last|--resume|--fresh] [--model <model|spark>] [--effort <none|minimal|low|medium|high|xhigh>] [prompt]",
      "  node scripts/codex-companion.mjs status [job-id] [--all] [--json]",
      "  node scripts/codex-companion.mjs result [job-id] [--json]",
      "  node scripts/codex-companion.mjs cancel [job-id] [--json]"
    ].join("\n")
  );
}

function outputResult(value, asJson) {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2));
  } else {
    process.stdout.write(value);
  }
}

function outputCommandResult(payload, rendered, asJson) {
  outputResult(asJson ? payload : rendered, asJson);
}

function normalizeRequestedModel(model) {
  if (model == null) {
    return null;
  }
  const normalized = String(model).trim();
  if (!normalized) {
    return null;
  }
  return MODEL_ALIASES.get(normalized.toLowerCase()) ?? normalized;
}

function normalizeReasoningEffort(effort) {
  if (effort == null) {
    return null;
  }
  const normalized = String(effort).trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (!VALID_REASONING_EFFORTS.has(normalized)) {
    throw new Error(
      `Unsupported reasoning effort "${effort}". Use one of: none, minimal, low, medium, high, xhigh.`
    );
  }
  return normalized;
}

function normalizeArgv(argv) {
  if (argv.length === 1) {
    const [raw] = argv;
    if (!raw || !raw.trim()) {
      return [];
    }
    return splitRawArgumentString(raw);
  }
  return argv;
}

function parseCommandInput(argv, config = {}) {
  return parseArgs(normalizeArgv(argv), {
    ...config,
    aliasMap: {
      C: "cwd",
      ...(config.aliasMap ?? {})
    }
  });
}

function resolveCommandCwd(options = {}) {
  return options.cwd ? path.resolve(process.cwd(), options.cwd) : process.cwd();
}

function resolveCommandWorkspace(options = {}) {
  return resolveWorkspaceRoot(resolveCommandCwd(options));
}

function parseReviewOutput(rawMessage, fallbackOptions) {
  if (typeof rawMessage === "string" && rawMessage.trim()) {
    try {
      const extracted = extractJsonFromThoughtResponse(rawMessage);
      if (extracted) {
        return { parsed: extracted, parseError: null, rawOutput: rawMessage };
      }
    } catch {
      // fall through to parseStructuredOutput
    }
  }
  return parseStructuredOutput(rawMessage, fallbackOptions);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shorten(text, limit = 96) {
  const normalized = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 3)}...`;
}

function firstMeaningfulLine(text, fallback) {
  const line = String(text ?? "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean);
  return line ?? fallback;
}

function buildSetupReport(cwd, actionsTaken = []) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const nodeStatus = binaryAvailable("node", ["--version"], { cwd });
  const npmStatus = binaryAvailable("npm", ["--version"], { cwd });
  const codexStatus = getCodexAvailability(cwd);
  const authStatus = getCodexLoginStatus(cwd);
  const config = getConfig(workspaceRoot);

  const nextSteps = [];
  if (!codexStatus.available) {
    nextSteps.push("Install Codex with `npm install -g @openai/codex`.");
  }
  if (codexStatus.available && !authStatus.loggedIn) {
    nextSteps.push("Run `!codex login`.");
    nextSteps.push("If browser login is blocked, retry with `!codex login --device-auth` or `!codex login --with-api-key`.");
  }
  if (!config.stopReviewGate) {
    nextSteps.push("Optional: run `/codex:setup --enable-review-gate` to require a fresh review before stop.");
  }

  return {
    ready: nodeStatus.available && codexStatus.available && authStatus.loggedIn,
    node: nodeStatus,
    npm: npmStatus,
    codex: codexStatus,
    auth: authStatus,
    sessionRuntime: getSessionRuntimeStatus(),
    reviewGateEnabled: Boolean(config.stopReviewGate),
    actionsTaken,
    nextSteps
  };
}

function handleSetup(argv) {
  const { options } = parseCommandInput(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json", "enable-review-gate", "disable-review-gate"]
  });

  if (options["enable-review-gate"] && options["disable-review-gate"]) {
    throw new Error("Choose either --enable-review-gate or --disable-review-gate.");
  }

  const cwd = resolveCommandCwd(options);
  const workspaceRoot = resolveCommandWorkspace(options);
  const actionsTaken = [];

  if (options["enable-review-gate"]) {
    setConfig(workspaceRoot, "stopReviewGate", true);
    actionsTaken.push(`Enabled the stop-time review gate for ${workspaceRoot}.`);
  } else if (options["disable-review-gate"]) {
    setConfig(workspaceRoot, "stopReviewGate", false);
    actionsTaken.push(`Disabled the stop-time review gate for ${workspaceRoot}.`);
  }

  const finalReport = buildSetupReport(cwd, actionsTaken);
  outputResult(options.json ? finalReport : renderSetupReport(finalReport), options.json);
}

function buildAdversarialReviewPrompt(context, focusText) {
  const template = loadPromptTemplate(ROOT_DIR, "adversarial-review");
  return interpolateTemplate(template, {
    REVIEW_KIND: "Adversarial Review",
    TARGET_LABEL: context.target.label,
    USER_FOCUS: focusText || "No extra focus provided.",
    REVIEW_INPUT: context.content
  });
}

function parseStdinContent(rawStdin) {
  if (!rawStdin) {
    return { documentContent: "", supplementaryDocs: "" };
  }
  const separator = "\n---SUPPLEMENTARY_DOCS---\n";
  const separatorIndex = rawStdin.indexOf(separator);
  if (separatorIndex === -1) {
    return { documentContent: rawStdin, supplementaryDocs: "" };
  }
  return {
    documentContent: rawStdin.slice(0, separatorIndex),
    supplementaryDocs: rawStdin.slice(separatorIndex + separator.length)
  };
}

function buildPaperReviewPrompt(paperContent, focusText, paperTitle, supplementaryDocs) {
  const template = loadPromptTemplate(ROOT_DIR, "paper-review");
  return interpolateTemplate(template, {
    PAPER_TITLE: paperTitle || "Untitled",
    REVIEWER_FOCUS: focusText || "No specific focus provided. Review all dimensions.",
    SUPPLEMENTARY_DOCS: supplementaryDocs || "",
    PAPER_CONTENT: paperContent
  });
}

function buildGrantReviewPrompt(proposalContent, focusText, proposalTitle, agencyCalibration, supplementaryDocs) {
  const template = loadPromptTemplate(ROOT_DIR, "grant-review");
  return interpolateTemplate(template, {
    PROPOSAL_TITLE: proposalTitle || "Untitled",
    REVIEWER_FOCUS: focusText || "No specific focus provided. Review all dimensions.",
    AGENCY_CALIBRATION: agencyCalibration || "",
    SUPPLEMENTARY_DOCS: supplementaryDocs || "",
    PROPOSAL_CONTENT: proposalContent
  });
}

function ensureCodexReady(cwd) {
  const authStatus = getCodexLoginStatus(cwd);
  if (!authStatus.available) {
    throw new Error("Codex CLI is not installed or is missing required runtime support. Install it with `npm install -g @openai/codex`, then rerun `/codex:setup`.");
  }
  if (!authStatus.loggedIn) {
    throw new Error("Codex CLI is not authenticated. Run `!codex login` and retry.");
  }
}

function buildNativeReviewTarget(target) {
  if (target.mode === "working-tree") {
    return { type: "uncommittedChanges" };
  }

  if (target.mode === "branch") {
    return { type: "baseBranch", branch: target.baseRef };
  }

  return null;
}

function validateNativeReviewRequest(target, focusText) {
  if (focusText.trim()) {
    throw new Error(
      `\`/codex:review\` now maps directly to the built-in reviewer and does not support custom focus text. Retry with \`/codex:adversarial-review ${focusText.trim()}\` for focused review instructions.`
    );
  }

  const nativeTarget = buildNativeReviewTarget(target);
  if (!nativeTarget) {
    throw new Error("This `/codex:review` target is not supported by the built-in reviewer. Retry with `/codex:adversarial-review` for custom targeting.");
  }

  return nativeTarget;
}

function renderStatusPayload(report, asJson) {
  return asJson ? report : renderStatusReport(report);
}

function isActiveJobStatus(status) {
  return status === "queued" || status === "running";
}

async function waitForSingleJobSnapshot(cwd, reference, options = {}) {
  const timeoutMs = Math.max(0, Number(options.timeoutMs) || DEFAULT_STATUS_WAIT_TIMEOUT_MS);
  const pollIntervalMs = Math.max(100, Number(options.pollIntervalMs) || DEFAULT_STATUS_POLL_INTERVAL_MS);
  const deadline = Date.now() + timeoutMs;
  let snapshot = buildSingleJobSnapshot(cwd, reference);

  while (isActiveJobStatus(snapshot.job.status) && Date.now() < deadline) {
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
    snapshot = buildSingleJobSnapshot(cwd, reference);
  }

  return {
    ...snapshot,
    waitTimedOut: isActiveJobStatus(snapshot.job.status),
    timeoutMs
  };
}

async function resolveLatestTrackedTaskThread(cwd, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const jobs = sortJobsNewestFirst(listJobs(workspaceRoot)).filter((job) => job.id !== options.excludeJobId);
  const activeTask = jobs.find((job) => job.jobClass === "task" && (job.status === "queued" || job.status === "running"));
  if (activeTask) {
    throw new Error(`Task ${activeTask.id} is still running. Use /codex:status before continuing it.`);
  }

  const trackedTask = jobs.find((job) => job.jobClass === "task" && job.status === "completed" && job.threadId);
  if (trackedTask) {
    return { id: trackedTask.threadId };
  }

  return findLatestTaskThread(workspaceRoot);
}

async function executeReviewRun(request) {
  ensureCodexReady(request.cwd);
  ensureGitRepository(request.cwd);

  const target = resolveReviewTarget(request.cwd, {
    base: request.base,
    scope: request.scope
  });
  const focusText = request.focusText?.trim() ?? "";
  const reviewName = request.reviewName ?? "Review";
  if (reviewName === "Review") {
    const reviewTarget = validateNativeReviewRequest(target, focusText);
    const result = await runAppServerReview(request.cwd, {
      target: reviewTarget,
      model: request.model,
      onProgress: request.onProgress
    });
    const payload = {
      review: reviewName,
      target,
      threadId: result.threadId,
      sourceThreadId: result.sourceThreadId,
      codex: {
        status: result.status,
        stderr: result.stderr,
        stdout: result.reviewText,
        reasoning: result.reasoningSummary
      }
    };
    const rendered = renderNativeReviewResult(
      {
        status: result.status,
        stdout: result.reviewText,
        stderr: result.stderr
      },
      { reviewLabel: reviewName, targetLabel: target.label, reasoningSummary: result.reasoningSummary }
    );

    return {
      exitStatus: result.status,
      threadId: result.threadId,
      turnId: result.turnId,
      payload,
      rendered,
      summary: firstMeaningfulLine(result.reviewText, `${reviewName} completed.`),
      jobTitle: `Codex ${reviewName}`,
      jobClass: "review",
      targetLabel: target.label
    };
  }

  const context = collectReviewContext(request.cwd, target);
  const prompt = buildAdversarialReviewPrompt(context, focusText);
  const result = await runAppServerTurn(context.repoRoot, {
    prompt,
    model: request.model,
    sandbox: "read-only",
    outputSchema: readOutputSchema(REVIEW_SCHEMA),
    onProgress: request.onProgress
  });
  const parsed = parseStructuredOutput(result.finalMessage, {
    status: result.status,
    failureMessage: result.error?.message ?? result.stderr
  });
  const payload = {
    review: reviewName,
    target,
    threadId: result.threadId,
    context: {
      repoRoot: context.repoRoot,
      branch: context.branch,
      summary: context.summary
    },
    codex: {
      status: result.status,
      stderr: result.stderr,
      stdout: result.finalMessage,
      reasoning: result.reasoningSummary
    },
    result: parsed.parsed,
    rawOutput: parsed.rawOutput,
    parseError: parsed.parseError,
    reasoningSummary: result.reasoningSummary
  };

  return {
    exitStatus: result.status,
    threadId: result.threadId,
    turnId: result.turnId,
    payload,
    rendered: renderReviewResult(parsed, {
      reviewLabel: reviewName,
      targetLabel: context.target.label,
      reasoningSummary: result.reasoningSummary
    }),
    summary: parsed.parsed?.summary ?? parsed.parseError ?? firstMeaningfulLine(result.finalMessage, `${reviewName} finished.`),
    jobTitle: `Codex ${reviewName}`,
    jobClass: "review",
    targetLabel: context.target.label
  };
}


async function executePaperReviewRun(request) {
  ensureCodexReady(request.cwd);

  const prompt = buildPaperReviewPrompt(
    request.paperContent,
    request.focusText,
    request.paperTitle,
    request.supplementaryDocs
  );
  const workspaceRoot = resolveWorkspaceRoot(request.cwd);
  const result = await runAppServerTurn(workspaceRoot, {
    prompt,
    model: request.model,
    effort: request.effort,
    sandbox: "read-only",
    outputSchema: readOutputSchema(PAPER_REVIEW_SCHEMA),
    onProgress: request.onProgress
  });
  const parsed = parseReviewOutput(result.finalMessage, {
    status: result.status,
    failureMessage: result.error?.message ?? result.stderr
  });
  const reviewName = "Paper Review";
  const targetLabel = request.paperTitle || "academic paper";
  const payload = {
    review: reviewName,
    paperTitle: request.paperTitle,
    threadId: result.threadId,
    codex: {
      status: result.status,
      stderr: result.stderr,
      stdout: result.finalMessage,
      reasoning: result.reasoningSummary
    },
    result: parsed.parsed,
    rawOutput: parsed.rawOutput,
    parseError: parsed.parseError,
    reasoningSummary: result.reasoningSummary
  };

  return {
    exitStatus: result.status,
    threadId: result.threadId,
    turnId: result.turnId,
    payload,
    rendered: renderPaperReviewResult(parsed, {
      reviewLabel: reviewName,
      targetLabel,
      reasoningSummary: result.reasoningSummary
    }),
    summary: parsed.parsed?.summary ?? parsed.parseError ?? firstMeaningfulLine(result.finalMessage, `${reviewName} finished.`),
    jobTitle: `Codex ${reviewName}`,
    jobClass: "review",
    targetLabel
  };
}

async function executeGrantReviewRun(request) {
  ensureCodexReady(request.cwd);

  const prompt = buildGrantReviewPrompt(
    request.proposalContent,
    request.focusText,
    request.proposalTitle,
    request.agencyCalibration?.promptSection ?? "",
    request.supplementaryDocs
  );
  const workspaceRoot = resolveWorkspaceRoot(request.cwd);
  const result = await runAppServerTurn(workspaceRoot, {
    prompt,
    model: request.model,
    effort: request.effort,
    sandbox: "read-only",
    outputSchema: readOutputSchema(GRANT_REVIEW_SCHEMA),
    onProgress: request.onProgress
  });
  const parsed = parseReviewOutput(result.finalMessage, {
    status: result.status,
    failureMessage: result.error?.message ?? result.stderr
  });
  const reviewName = "Grant Review";
  const targetLabel = request.proposalTitle || "research proposal";
  const payload = {
    review: reviewName,
    proposalTitle: request.proposalTitle,
    threadId: result.threadId,
    codex: {
      status: result.status,
      stderr: result.stderr,
      stdout: result.finalMessage,
      reasoning: result.reasoningSummary
    },
    result: parsed.parsed,
    rawOutput: parsed.rawOutput,
    parseError: parsed.parseError,
    reasoningSummary: result.reasoningSummary
  };

  return {
    exitStatus: result.status,
    threadId: result.threadId,
    turnId: result.turnId,
    payload,
    rendered: renderGrantReviewResult(parsed, {
      reviewLabel: reviewName,
      targetLabel,
      reasoningSummary: result.reasoningSummary
    }),
    summary: parsed.parsed?.summary ?? parsed.parseError ?? firstMeaningfulLine(result.finalMessage, `${reviewName} finished.`),
    jobTitle: `Codex ${reviewName}`,
    jobClass: "review",
    targetLabel
  };
}

async function executeCodeAlignmentRun(request) {
  ensureCodexReady(request.cwd);

  const template = loadPromptTemplate(ROOT_DIR, "code-methods-alignment");
  const prompt = interpolateTemplate(template, {
    PAPER_TITLE: request.documentTitle || "Untitled",
    METHODS_SUMMARY: request.supplementaryDocs
      ? `${request.methodsSummary || request.documentContent}\n\n--- Supplementary Documents ---\n${request.supplementaryDocs}`
      : (request.methodsSummary || request.documentContent),
    REVIEWER_FOCUS: request.focusText || "Check all alignment categories."
  });
  const resolvedCodePath = path.resolve(request.cwd, request.codePath);
  if (!fs.existsSync(resolvedCodePath)) {
    throw new Error(`--code path does not exist: ${resolvedCodePath}`);
  }
  const codePath = fs.statSync(resolvedCodePath).isDirectory() ? resolvedCodePath : path.dirname(resolvedCodePath);
  const result = await runAppServerTurn(codePath, {
    prompt,
    model: request.model,
    effort: request.effort,
    sandbox: "read-only",
    outputSchema: readOutputSchema(CODE_ALIGNMENT_SCHEMA),
    onProgress: request.onProgress
  });

  let parsed = null;
  try {
    parsed = extractJsonFromThoughtResponse(typeof result.finalMessage === "string" ? result.finalMessage : "");
  } catch {
    const fallback = parseStructuredOutput(result.finalMessage, {
      status: result.status,
      failureMessage: result.error?.message ?? result.stderr
    });
    parsed = fallback.parsed;
  }

  return {
    exitStatus: result.status,
    parsed,
    rawOutput: typeof result.finalMessage === "string" ? result.finalMessage : "",
    threadId: result.threadId
  };
}

async function executeTaskRun(request) {
  const workspaceRoot = resolveWorkspaceRoot(request.cwd);
  ensureCodexReady(request.cwd);

  const taskMetadata = buildTaskRunMetadata({
    prompt: request.prompt,
    resumeLast: request.resumeLast
  });

  let resumeThreadId = null;
  if (request.resumeLast) {
    const latestThread = await resolveLatestTrackedTaskThread(workspaceRoot, {
      excludeJobId: request.jobId
    });
    if (!latestThread) {
      throw new Error("No previous Codex task thread was found for this repository.");
    }
    resumeThreadId = latestThread.id;
  }

  if (!request.prompt && !resumeThreadId) {
    throw new Error("Provide a prompt, a prompt file, piped stdin, or use --resume-last.");
  }

  const result = await runAppServerTurn(workspaceRoot, {
    resumeThreadId,
    prompt: request.prompt,
    defaultPrompt: resumeThreadId ? DEFAULT_CONTINUE_PROMPT : "",
    model: request.model,
    effort: request.effort,
    sandbox: request.write ? "workspace-write" : "read-only",
    onProgress: request.onProgress,
    persistThread: true,
    threadName: resumeThreadId ? null : buildPersistentTaskThreadName(request.prompt || DEFAULT_CONTINUE_PROMPT)
  });

  const rawOutput = typeof result.finalMessage === "string" ? result.finalMessage : "";
  const failureMessage = result.error?.message ?? result.stderr ?? "";
  const rendered = renderTaskResult(
    {
      rawOutput,
      failureMessage,
      reasoningSummary: result.reasoningSummary
    },
    {
      title: taskMetadata.title,
      jobId: request.jobId ?? null,
      write: Boolean(request.write)
    }
  );
  const payload = {
    status: result.status,
    threadId: result.threadId,
    rawOutput,
    touchedFiles: result.touchedFiles,
    reasoningSummary: result.reasoningSummary
  };

  return {
    exitStatus: result.status,
    threadId: result.threadId,
    turnId: result.turnId,
    payload,
    rendered,
    summary: firstMeaningfulLine(rawOutput, firstMeaningfulLine(failureMessage, `${taskMetadata.title} finished.`)),
    jobTitle: taskMetadata.title,
    jobClass: "task",
    write: Boolean(request.write)
  };
}

function buildReviewJobMetadata(reviewName, target) {
  return {
    kind: reviewName === "Adversarial Review" ? "adversarial-review" : "review",
    title: reviewName === "Review" ? "Codex Review" : `Codex ${reviewName}`,
    summary: `${reviewName} ${target.label}`
  };
}

function buildTaskRunMetadata({ prompt, resumeLast = false }) {
  if (!resumeLast && String(prompt ?? "").includes(STOP_REVIEW_TASK_MARKER)) {
    return {
      title: "Codex Stop Gate Review",
      summary: "Stop-gate review of previous Claude turn"
    };
  }

  const title = resumeLast ? "Codex Resume" : "Codex Task";
  const fallbackSummary = resumeLast ? DEFAULT_CONTINUE_PROMPT : "Task";
  return {
    title,
    summary: shorten(prompt || fallbackSummary)
  };
}

function renderQueuedTaskLaunch(payload) {
  return `${payload.title} started in the background as ${payload.jobId}. Check /codex:status ${payload.jobId} for progress.\n`;
}

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
  if (kind === "grant-review") {
    return "grant-review";
  }
  if (kind === "grant-panel-review") {
    return "grant-panel-review";
  }
  return jobClass === "review" ? "review" : "rescue";
}

function createCompanionJob({ prefix, kind, title, workspaceRoot, jobClass, summary, write = false }) {
  return createJobRecord({
    id: generateJobId(prefix),
    kind,
    kindLabel: getJobKindLabel(kind, jobClass),
    title,
    workspaceRoot,
    jobClass,
    summary,
    write
  });
}

function createTrackedProgress(job, options = {}) {
  const logFile = options.logFile ?? createJobLogFile(job.workspaceRoot, job.id, job.title);
  return {
    logFile,
    progress: createProgressReporter({
      stderr: Boolean(options.stderr),
      logFile,
      onEvent: createJobProgressUpdater(job.workspaceRoot, job.id)
    })
  };
}

function buildTaskJob(workspaceRoot, taskMetadata, write) {
  return createCompanionJob({
    prefix: "task",
    kind: "task",
    title: taskMetadata.title,
    workspaceRoot,
    jobClass: "task",
    summary: taskMetadata.summary,
    write
  });
}

function buildTaskRequest({ cwd, model, effort, prompt, write, resumeLast, jobId }) {
  return {
    cwd,
    model,
    effort,
    prompt,
    write,
    resumeLast,
    jobId
  };
}

function readTaskPrompt(cwd, options, positionals) {
  if (options["prompt-file"]) {
    return fs.readFileSync(path.resolve(cwd, options["prompt-file"]), "utf8");
  }

  const positionalPrompt = positionals.join(" ");
  return positionalPrompt || readStdinIfPiped();
}

function requireTaskRequest(prompt, resumeLast) {
  if (!prompt && !resumeLast) {
    throw new Error("Provide a prompt, a prompt file, piped stdin, or use --resume-last.");
  }
}

async function runForegroundCommand(job, runner, options = {}) {
  const { logFile, progress } = createTrackedProgress(job, {
    logFile: options.logFile,
    stderr: !options.json
  });
  const execution = await runTrackedJob(job, () => runner(progress), { logFile });
  outputResult(options.json ? execution.payload : execution.rendered, options.json);
  if (execution.exitStatus !== 0) {
    process.exitCode = execution.exitStatus;
  }
  return execution;
}

function spawnDetachedTaskWorker(cwd, jobId) {
  const scriptPath = path.join(ROOT_DIR, "scripts", "codex-companion.mjs");
  const child = spawn(process.execPath, [scriptPath, "task-worker", "--cwd", cwd, "--job-id", jobId], {
    cwd,
    env: process.env,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  return child;
}

function enqueueBackgroundTask(cwd, job, request) {
  const { logFile } = createTrackedProgress(job);
  appendLogLine(logFile, "Queued for background execution.");

  const child = spawnDetachedTaskWorker(cwd, job.id);
  const queuedRecord = {
    ...job,
    status: "queued",
    phase: "queued",
    pid: child.pid ?? null,
    logFile,
    request
  };
  writeJobFile(job.workspaceRoot, job.id, queuedRecord);
  upsertJob(job.workspaceRoot, queuedRecord);

  return {
    payload: {
      jobId: job.id,
      status: "queued",
      title: job.title,
      summary: job.summary,
      logFile
    },
    logFile
  };
}

async function handleReviewCommand(argv, config) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["base", "scope", "model", "cwd"],
    booleanOptions: ["json", "background", "wait"],
    aliasMap: {
      m: "model"
    }
  });

  const cwd = resolveCommandCwd(options);
  const workspaceRoot = resolveCommandWorkspace(options);
  const focusText = positionals.join(" ").trim();
  const target = resolveReviewTarget(cwd, {
    base: options.base,
    scope: options.scope
  });

  config.validateRequest?.(target, focusText);
  const metadata = buildReviewJobMetadata(config.reviewName, target);
  const job = createCompanionJob({
    prefix: "review",
    kind: metadata.kind,
    title: metadata.title,
    workspaceRoot,
    jobClass: "review",
    summary: metadata.summary
  });
  await runForegroundCommand(
    job,
    (progress) =>
      executeReviewRun({
        cwd,
        base: options.base,
        scope: options.scope,
        model: options.model,
        focusText,
        reviewName: config.reviewName,
        onProgress: progress
      }),
    { json: options.json }
  );
}

async function handleReview(argv) {
  return handleReviewCommand(argv, {
    reviewName: "Review",
    validateRequest: validateNativeReviewRequest
  });
}

async function handlePaperReview(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["model", "effort", "cwd", "title", "venue", "docs", "code"],
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
  const rawStdin = readStdinIfPiped();

  if (!rawStdin) {
    throw new Error("No paper content provided. Pipe the paper text to this command via stdin.");
  }

  const { documentContent: paperContent, supplementaryDocs } = parseStdinContent(rawStdin);
  const paperTitle = options.title || "";

  if (options.venue && !options.panel) {
    throw new Error("--venue requires --panel. Use `/codex:paper-review --panel --venue <name>` for venue-calibrated panel review.");
  }

  if (options.docs && !supplementaryDocs) {
    process.stderr.write("Warning: --docs was specified but no supplementary documents were found in stdin. Use the slash command `/codex:paper-review` which reads the docs folder automatically.\n");
  }

  if (options.code) {
    const resolvedCode = path.resolve(cwd, options.code);
    if (!fs.existsSync(resolvedCode)) {
      throw new Error(`--code path does not exist: ${resolvedCode}`);
    }
  }

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
            supplementaryDocs,
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

        let rendered = renderPanelReviewResult(panelResult, {
          reviewLabel: "Paper Review Panel",
          targetLabel: paperTitle || "academic paper",
          venueLabel: venueCalibration?.name ?? null
        });

        if (options.code) {
          try {
            const alignmentResult = await executeCodeAlignmentRun({
              cwd,
              codePath: options.code,
              documentContent: paperContent,
              documentTitle: paperTitle,
              focusText,
              supplementaryDocs,
              model,
              effort,
              onProgress: progress
            });
            rendered += "\n" + renderCodeAlignmentResult(alignmentResult);
            panelResult.codeAlignment = alignmentResult;
          } catch (alignErr) {
            rendered += `\n## Code-Methods Alignment\n\nCode alignment failed: ${alignErr.message}\n`;
          }
        }

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
    async (progress) => {
      const reviewResult = await executePaperReviewRun({
        cwd,
        model,
        effort,
        paperContent,
        paperTitle,
        focusText,
        supplementaryDocs,
        onProgress: progress
      });

      if (options.code) {
        try {
          const alignmentResult = await executeCodeAlignmentRun({
            cwd,
            codePath: options.code,
            documentContent: paperContent,
            documentTitle: paperTitle,
            focusText,
            supplementaryDocs,
            model,
            effort,
            onProgress: progress
          });
          reviewResult.rendered += "\n" + renderCodeAlignmentResult(alignmentResult);
          reviewResult.payload.codeAlignment = alignmentResult;
        } catch (alignErr) {
          reviewResult.rendered += `\n## Code-Methods Alignment\n\nCode alignment failed: ${alignErr.message}\n`;
        }
      }

      return reviewResult;
    },
    { json: options.json }
  );
}

async function handleGrantReview(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["model", "effort", "cwd", "title", "agency", "docs", "code"],
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
  const rawStdin = readStdinIfPiped();

  if (!rawStdin) {
    throw new Error("No proposal content provided. Pipe the proposal text to this command via stdin.");
  }

  const { documentContent: proposalContent, supplementaryDocs } = parseStdinContent(rawStdin);
  const proposalTitle = options.title || "";

  if (options.agency) {
    const agencyCheck = getAgencyCalibration(options.agency);
    if (!agencyCheck) {
      throw new Error(`Unknown agency "${options.agency}". Supported: horizon, erc, ukri, dfg, anr, snsf, nwo, nih, nsf, doe, darpa.`);
    }
  }

  if (options.docs && !supplementaryDocs) {
    process.stderr.write("Warning: --docs was specified but no supplementary documents were found in stdin. Use the slash command `/codex:grant-review` which reads the docs folder automatically.\n");
  }

  if (options.code) {
    const resolvedCode = path.resolve(cwd, options.code);
    if (!fs.existsSync(resolvedCode)) {
      throw new Error(`--code path does not exist: ${resolvedCode}`);
    }
  }

  if (options.panel) {
    const agencyCalibration = options.agency ? getAgencyCalibration(options.agency) : null;
    if (options.agency && !agencyCalibration) {
      throw new Error(`Unknown agency "${options.agency}". Supported: horizon, erc, ukri, dfg, anr, snsf, nwo, nih, nsf, doe, darpa.`);
    }

    const job = createCompanionJob({
      prefix: "review",
      kind: "grant-panel-review",
      title: "Codex Grant Review Panel",
      workspaceRoot,
      jobClass: "review",
      summary: `Grant Panel Review${proposalTitle ? `: ${shorten(proposalTitle)}` : ""}`
    });

    await runForegroundCommand(
      job,
      async (progress) => {
        const panelResult = await runPanelReview(
          {
            cwd,
            model,
            effort,
            paperContent: proposalContent,
            paperTitle: proposalTitle,
            focusText,
            venueCalibration: agencyCalibration,
            supplementaryDocs,
            templateRootDir: ROOT_DIR,
            panelSchemaPath: GRANT_PANEL_REVIEW_SCHEMA,
            metaSchemaPath: GRANT_META_REVIEW_SCHEMA,
            metaTemplateName: "grant-review-meta",
            personas: GRANT_PERSONAS,
            onProgress: progress
          },
          {
            runAppServerTurn,
            readOutputSchema,
            parseStructuredOutput,
            resolveWorkspaceRoot
          }
        );

        let rendered = renderGrantPanelReviewResult(panelResult, {
          reviewLabel: "Grant Review Panel",
          targetLabel: proposalTitle || "research proposal",
          agencyLabel: agencyCalibration?.name ?? null
        });

        if (options.code) {
          try {
            const alignmentResult = await executeCodeAlignmentRun({
              cwd,
              codePath: options.code,
              documentContent: proposalContent,
              documentTitle: proposalTitle,
              focusText,
              supplementaryDocs,
              model,
              effort,
              onProgress: progress
            });
            rendered += "\n" + renderCodeAlignmentResult(alignmentResult);
            panelResult.codeAlignment = alignmentResult;
          } catch (alignErr) {
            rendered += `\n## Code-Methods Alignment\n\nCode alignment failed: ${alignErr.message}\n`;
          }
        }

        return {
          exitStatus: panelResult.exitStatus,
          threadId: panelResult.threadId,
          turnId: panelResult.turnId,
          payload: panelResult,
          rendered,
          summary: panelResult.metaReview?.summary ?? `Grant panel review finished.`,
          jobTitle: "Codex Grant Review Panel",
          jobClass: "review"
        };
      },
      { json: options.json }
    );
    return;
  }

  const job = createCompanionJob({
    prefix: "review",
    kind: "grant-review",
    title: "Codex Grant Review",
    workspaceRoot,
    jobClass: "review",
    summary: `Grant Review${proposalTitle ? `: ${shorten(proposalTitle)}` : ""}`
  });

  await runForegroundCommand(
    job,
    async (progress) => {
      const reviewResult = await executeGrantReviewRun({
        cwd,
        model,
        effort,
        proposalContent,
        proposalTitle,
        focusText,
        supplementaryDocs,
        agencyCalibration: options.agency ? getAgencyCalibration(options.agency) : null,
        onProgress: progress
      });

      if (options.code) {
        try {
          const alignmentResult = await executeCodeAlignmentRun({
            cwd,
            codePath: options.code,
            documentContent: proposalContent,
            documentTitle: proposalTitle,
            focusText,
            supplementaryDocs,
            model,
            effort,
            onProgress: progress
          });
          reviewResult.rendered += "\n" + renderCodeAlignmentResult(alignmentResult);
          reviewResult.payload.codeAlignment = alignmentResult;
        } catch (alignErr) {
          reviewResult.rendered += `\n## Code-Methods Alignment\n\nCode alignment failed: ${alignErr.message}\n`;
        }
      }

      return reviewResult;
    },
    { json: options.json }
  );
}

async function handleTask(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["model", "effort", "cwd", "prompt-file"],
    booleanOptions: ["json", "write", "resume-last", "resume", "fresh", "background"],
    aliasMap: {
      m: "model"
    }
  });

  const cwd = resolveCommandCwd(options);
  const workspaceRoot = resolveCommandWorkspace(options);
  const model = normalizeRequestedModel(options.model);
  const effort = normalizeReasoningEffort(options.effort);
  const prompt = readTaskPrompt(cwd, options, positionals);

  const resumeLast = Boolean(options["resume-last"] || options.resume);
  const fresh = Boolean(options.fresh);
  if (resumeLast && fresh) {
    throw new Error("Choose either --resume/--resume-last or --fresh.");
  }
  const write = Boolean(options.write);
  const taskMetadata = buildTaskRunMetadata({
    prompt,
    resumeLast
  });

  if (options.background) {
    ensureCodexReady(cwd);
    requireTaskRequest(prompt, resumeLast);

    const job = buildTaskJob(workspaceRoot, taskMetadata, write);
    const request = buildTaskRequest({
      cwd,
      model,
      effort,
      prompt,
      write,
      resumeLast,
      jobId: job.id
    });
    const { payload } = enqueueBackgroundTask(cwd, job, request);
    outputCommandResult(payload, renderQueuedTaskLaunch(payload), options.json);
    return;
  }

  const job = buildTaskJob(workspaceRoot, taskMetadata, write);
  await runForegroundCommand(
    job,
    (progress) =>
      executeTaskRun({
        cwd,
        model,
        effort,
        prompt,
        write,
        resumeLast,
        jobId: job.id,
        onProgress: progress
      }),
    { json: options.json }
  );
}

async function handleTaskWorker(argv) {
  const { options } = parseCommandInput(argv, {
    valueOptions: ["cwd", "job-id"]
  });

  if (!options["job-id"]) {
    throw new Error("Missing required --job-id for task-worker.");
  }

  const cwd = resolveCommandCwd(options);
  const workspaceRoot = resolveCommandWorkspace(options);
  const storedJob = readStoredJob(workspaceRoot, options["job-id"]);
  if (!storedJob) {
    throw new Error(`No stored job found for ${options["job-id"]}.`);
  }

  const request = storedJob.request;
  if (!request || typeof request !== "object") {
    throw new Error(`Stored job ${options["job-id"]} is missing its task request payload.`);
  }

  const { logFile, progress } = createTrackedProgress(
    {
      ...storedJob,
      workspaceRoot
    },
    {
      logFile: storedJob.logFile ?? null
    }
  );
  await runTrackedJob(
    {
      ...storedJob,
      workspaceRoot,
      logFile
    },
    () =>
      executeTaskRun({
        ...request,
        onProgress: progress
      }),
    { logFile }
  );
}

async function handleStatus(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd", "timeout-ms", "poll-interval-ms"],
    booleanOptions: ["json", "all", "wait"]
  });

  const cwd = resolveCommandCwd(options);
  const reference = positionals[0] ?? "";
  if (reference) {
    const snapshot = options.wait
      ? await waitForSingleJobSnapshot(cwd, reference, {
          timeoutMs: options["timeout-ms"],
          pollIntervalMs: options["poll-interval-ms"]
        })
      : buildSingleJobSnapshot(cwd, reference);
    outputCommandResult(snapshot, renderJobStatusReport(snapshot.job), options.json);
    return;
  }

  if (options.wait) {
    throw new Error("`status --wait` requires a job id.");
  }

  const report = buildStatusSnapshot(cwd, { all: options.all });
  outputResult(renderStatusPayload(report, options.json), options.json);
}

function handleResult(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json"]
  });

  const cwd = resolveCommandCwd(options);
  const reference = positionals[0] ?? "";
  const { workspaceRoot, job } = resolveResultJob(cwd, reference);
  const storedJob = readStoredJob(workspaceRoot, job.id);
  const payload = {
    job,
    storedJob
  };

  outputCommandResult(payload, renderStoredJobResult(job, storedJob), options.json);
}

function handleTaskResumeCandidate(argv) {
  const { options } = parseCommandInput(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json"]
  });

  const cwd = resolveCommandCwd(options);
  const workspaceRoot = resolveCommandWorkspace(options);
  const sessionId = process.env[SESSION_ID_ENV] ?? null;
  const jobs = sortJobsNewestFirst(listJobs(workspaceRoot));
  const candidate =
    jobs.find(
      (job) =>
        job.jobClass === "task" &&
        job.threadId &&
        job.status !== "queued" &&
        job.status !== "running" &&
        (!sessionId || job.sessionId === sessionId)
    ) ?? null;

  const payload = {
    available: Boolean(candidate),
    sessionId,
    candidate:
      candidate == null
        ? null
        : {
            id: candidate.id,
            status: candidate.status,
            title: candidate.title ?? null,
            summary: candidate.summary ?? null,
            threadId: candidate.threadId,
            completedAt: candidate.completedAt ?? null,
            updatedAt: candidate.updatedAt ?? null
          }
  };

  const rendered = candidate
    ? `Resumable task found: ${candidate.id} (${candidate.status}).\n`
    : "No resumable task found for this session.\n";
  outputCommandResult(payload, rendered, options.json);
}

async function handleCancel(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json"]
  });

  const cwd = resolveCommandCwd(options);
  const reference = positionals[0] ?? "";
  const { workspaceRoot, job } = resolveCancelableJob(cwd, reference);
  const existing = readStoredJob(workspaceRoot, job.id) ?? {};
  const threadId = existing.threadId ?? job.threadId ?? null;
  const turnId = existing.turnId ?? job.turnId ?? null;

  const interrupt = await interruptAppServerTurn(cwd, { threadId, turnId });
  if (interrupt.attempted) {
    appendLogLine(
      job.logFile,
      interrupt.interrupted
        ? `Requested Codex turn interrupt for ${turnId} on ${threadId}.`
        : `Codex turn interrupt failed${interrupt.detail ? `: ${interrupt.detail}` : "."}`
    );
  }

  terminateProcessTree(job.pid ?? Number.NaN);
  appendLogLine(job.logFile, "Cancelled by user.");

  const completedAt = nowIso();
  const nextJob = {
    ...job,
    status: "cancelled",
    phase: "cancelled",
    pid: null,
    completedAt,
    errorMessage: "Cancelled by user."
  };

  writeJobFile(workspaceRoot, job.id, {
    ...existing,
    ...nextJob,
    cancelledAt: completedAt
  });
  upsertJob(workspaceRoot, {
    id: job.id,
    status: "cancelled",
    phase: "cancelled",
    pid: null,
    errorMessage: "Cancelled by user.",
    completedAt
  });

  const payload = {
    jobId: job.id,
    status: "cancelled",
    title: job.title,
    turnInterruptAttempted: interrupt.attempted,
    turnInterrupted: interrupt.interrupted
  };

  outputCommandResult(payload, renderCancelReport(nextJob), options.json);
}

async function main() {
  const [subcommand, ...argv] = process.argv.slice(2);
  if (!subcommand || subcommand === "help" || subcommand === "--help") {
    printUsage();
    return;
  }

  switch (subcommand) {
    case "setup":
      handleSetup(argv);
      break;
    case "review":
      await handleReview(argv);
      break;
    case "adversarial-review":
      await handleReviewCommand(argv, {
        reviewName: "Adversarial Review"
      });
      break;
    case "paper-review":
      await handlePaperReview(argv);
      break;
    case "grant-review":
      await handleGrantReview(argv);
      break;
    case "task":
      await handleTask(argv);
      break;
    case "task-worker":
      await handleTaskWorker(argv);
      break;
    case "status":
      await handleStatus(argv);
      break;
    case "result":
      handleResult(argv);
      break;
    case "task-resume-candidate":
      handleTaskResumeCandidate(argv);
      break;
    case "cancel":
      await handleCancel(argv);
      break;
    default:
      throw new Error(`Unknown subcommand: ${subcommand}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
