---
description: Run a Codex peer review of an academic paper
argument-hint: '<file> [--panel] [--venue <neurips|icml|iclr|acl|nature|workshop>] [--reflect] [--wait|--background] [--model <model>] [--effort <effort>] [--title <title>] [focus ...]'
disable-model-invocation: true
allowed-tools: Read, Bash(node:*), AskUserQuestion
---

Run an academic peer review of a paper through the shared plugin runtime.
Codex evaluates the paper across standard academic dimensions: novelty, methodology, statistical rigor, claims vs. evidence, clarity, related work, limitations, reproducibility, and ethics.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command is review-only.
- Do not fix issues, apply patches, or suggest that you are about to make changes.
- Your only job is to run the review and return Codex's output verbatim to the user.

Paper reading:
- The first positional argument (before any flags or focus text) is the paper file path.
- Use the `Read` tool to read the paper file. This handles PDF, .tex, .md, .txt, and other text formats natively.
- If the file cannot be read or the format is unsupported, tell the user and stop.
- Extract or infer the paper title from the content. If unclear, use the filename without extension.
- Everything after the file path and flags is focus text for the reviewer (e.g., "focus on statistical methodology").

Panel review mode:
- If `--panel` is present, the companion script runs 3 parallel Codex reviews with distinct personas (Empiricist, Theorist, Practitioner) and then synthesizes them via an Area Chair meta-review.
- `--venue <name>` calibrates the review to a specific venue's standards. Supported: neurips, icml, iclr, acl, nature, workshop.
- `--reflect` adds a self-reflection round where each reviewer refines their initial assessment.
- Panel mode takes significantly longer than single review. Always recommend background.
- Pass all panel flags through to the companion script.

Execution mode rules:
- If `--panel` is present, always recommend background regardless of paper size.
- If the raw arguments include `--wait`, do not ask. Run in the foreground.
- If the raw arguments include `--background`, do not ask. Run in a Claude background task.
- Otherwise, recommend background since paper reviews are typically long-running.
- Then use `AskUserQuestion` exactly once with two options, putting the recommended option first and suffixing its label with `(Recommended)`:
  - `Run in background`
  - `Wait for results`

Argument handling:
- Preserve the user's arguments exactly.
- Do not strip `--wait` or `--background` yourself.
- The companion script parses `--wait` and `--background`, but Claude Code's `Bash(..., run_in_background: true)` is what actually detaches the run.
- Pass `--title "Extracted Paper Title"` so the review output includes the paper title.
- Pass `--model` and `--effort` through if the user specified them.
- Any remaining text after flags becomes focus text (positional arguments to the companion script).

Foreground flow:
- Pipe the extracted paper text to the companion script via stdin using a heredoc:
```bash
cat <<'PAPER_EOF' | node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" paper-review --title "Paper Title" [other flags] [focus text]
<extracted paper text>
PAPER_EOF
```
- Return the command stdout verbatim, exactly as-is.
- Do not paraphrase, summarize, or add commentary before or after it.
- Do not fix any issues mentioned in the review output.

Background flow:
- Launch the review with `Bash` in the background, piping paper content via heredoc:
```typescript
Bash({
  command: `cat <<'PAPER_EOF' | node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" paper-review --title "Paper Title" [other flags] [focus text]\n<extracted paper text>\nPAPER_EOF`,
  description: "Codex paper review",
  run_in_background: true
})
```
- Do not call `BashOutput` or wait for completion in this turn.
- After launching the command, tell the user: "Codex paper review started in the background. Check `/codex:status` for progress."
