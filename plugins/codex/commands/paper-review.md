---
description: Run a Codex peer review of an academic paper
argument-hint: '<file> [--panel] [--venue <neurips|icml|iclr|acl|nature|workshop>] [--docs <folder>] [--code <path>] [--wait|--background] [--model <model>] [--effort <effort>] [--title <title>] [focus ...]'
disable-model-invocation: true
allowed-tools: Read, Glob, Bash(node:*), Bash(cat:*), AskUserQuestion
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
- Panel mode takes significantly longer than single review. Always recommend background.
- Pass all panel flags through to the companion script.

Supplementary documents:
- If `--docs <folder>` is present, read all files in the specified folder using the `Read` tool.
- Format each file's content with a header line `### File: <filename>` followed by the file text.
- Append all docs content to stdin after a separator line, using this format:
```bash
cat <<'PAPER_EOF' | node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" paper-review --title "Paper Title" [other flags] [focus text]
<extracted paper text>
---SUPPLEMENTARY_DOCS---
### File: doc1.pdf
<content of doc1>

### File: doc2.txt
<content of doc2>
PAPER_EOF
```
- The companion script splits on `\n---SUPPLEMENTARY_DOCS---\n` to separate the paper from the supplementary documents.
- If `--docs` is absent, pipe only the paper text with no separator.

Code-methods alignment:
- If `--code <path>` is present, an additional review stage runs after the main review (single or panel).
- Codex reads the code at the specified path and cross-validates it against the paper's methods section.
- Checks for: hyperparameter mismatches, undocumented preprocessing steps, data leakage, and statistical implementation errors.
- The alignment results are appended to the review output as a "Code-Methods Alignment" section.
- Pass `--code <path>` through to the companion script unchanged.

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
- Pass `--title` with the extracted paper title. Shell-escape the title: replace single quotes with `'\''` and wrap in single quotes (e.g., `--title 'A Paper'\''s Title'`).
- Pass `--model` and `--effort` through if the user specified them.
- Any remaining text after flags becomes focus text. Shell-escape focus text the same way as the title.
- Shell-escape any `--code` or `--docs` paths that contain special characters.

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
