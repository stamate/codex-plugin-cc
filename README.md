# Codex plugin for Claude Code

Use Codex from inside Claude Code for code reviews or to delegate tasks to Codex.

This plugin is for Claude Code users who want an easy way to start using Codex from the workflow
they already have.

<video src="./docs/plugin-demo.webm" controls muted playsinline autoplay></video>

## What You Get

- `/codex:review` for a normal read-only Codex review
- `/codex:adversarial-review` for a steerable challenge review
- `/codex:paper-review` for academic paper peer review, with optional multi-persona panel (`--panel`) and venue calibration (`--venue`)
- `/codex:grant-review` for research grant proposal peer review, with optional multi-persona panel (`--panel`) and agency calibration (`--agency`)
- `/codex:rescue`, `/codex:status`, `/codex:result`, and `/codex:cancel` to delegate work and manage background jobs

## Requirements

- **ChatGPT subscription (incl. Free) or OpenAI API key.**
  - Usage will contribute to your Codex usage limits. [Learn more](https://developers.openai.com/codex/pricing).
- **Node.js 18.18 or later**

## Install

**Option A — Agent Skills** (recommended, works with Claude Code, Codex, Cursor, etc.):
```bash
npx skills add stamate/codex-plugin-cc
```

**Option B — Claude Code plugin**:
```bash
/plugin marketplace add stamate/codex-plugin-cc
/plugin install codex@stm-codex
```

Reload plugins:

```bash
/reload-plugins
```

Then run:

```bash
/codex:setup
```

`/codex:setup` will tell you whether Codex is ready. If Codex is missing and npm is available, it can offer to install Codex for you.

If you prefer to install Codex yourself, use:

```bash
npm install -g @openai/codex
```

If Codex is installed but not logged in yet, run:

```bash
!codex login
```

After install, you should see:

- the slash commands listed below
- the `codex:codex-rescue` subagent in `/agents`

One simple first run is:

```bash
/codex:review --background
/codex:status
/codex:result
```

## Usage

### `/codex:review`

Runs a normal Codex review on your current work. It gives you the same quality of code review as running `/review` inside Codex directly.

> [!NOTE]
> Code review especially for multi-file changes might take a while. It's generally recommended to run it in the background.

Use it when you want:

- a review of your current uncommitted changes
- a review of your branch compared to a base branch like `main`

Use `--base <ref>` for branch review. It also supports `--wait` and `--background`. It is not steerable and does not take custom focus text. Use [`/codex:adversarial-review`](#codexadversarial-review) when you want to challenge a specific decision or risk area.

Examples:

```bash
/codex:review
/codex:review --base main
/codex:review --background
```

This command is read-only and will not perform any changes. When run in the background you can use [`/codex:status`](#codexstatus) to check on the progress and [`/codex:cancel`](#codexcancel) to cancel the ongoing task.

### `/codex:adversarial-review`

Runs a **steerable** review that questions the chosen implementation and design.

It can be used to pressure-test assumptions, tradeoffs, failure modes, and whether a different approach would have been safer or simpler.

It uses the same review target selection as `/codex:review`, including `--base <ref>` for branch review.
It also supports `--wait` and `--background`. Unlike `/codex:review`, it can take extra focus text after the flags.

Use it when you want:

- a review before shipping that challenges the direction, not just the code details
- review focused on design choices, tradeoffs, hidden assumptions, and alternative approaches
- pressure-testing around specific risk areas like auth, data loss, rollback, race conditions, or reliability

Examples:

```bash
/codex:adversarial-review
/codex:adversarial-review --base main challenge whether this was the right caching and retry design
/codex:adversarial-review --background look for race conditions and question the chosen approach
```

This command is read-only. It does not fix code.

### `/codex:rescue`

Hands a task to Codex through the `codex:codex-rescue` subagent.

Use it when you want Codex to:

- investigate a bug
- try a fix
- continue a previous Codex task
- take a faster or cheaper pass with a smaller model

> [!NOTE]
> Depending on the task and the model you choose these tasks might take a long time and it's generally recommended to force the task to be in the background or move the agent to the background.

It supports `--background`, `--wait`, `--resume`, and `--fresh`. If you omit `--resume` and `--fresh`, the plugin can offer to continue the latest rescue thread for this repo.

Examples:

```bash
/codex:rescue investigate why the tests started failing
/codex:rescue fix the failing test with the smallest safe patch
/codex:rescue --resume apply the top fix from the last run
/codex:rescue --model gpt-5.4-mini --effort medium investigate the flaky integration test
/codex:rescue --model spark fix the issue quickly
/codex:rescue --background investigate the regression
```

You can also just ask for a task to be delegated to Codex:

```text
Ask Codex to redesign the database connection to be more resilient.
```

**Notes:**

- if you do not pass `--model` or `--effort`, Codex chooses its own defaults.
- if you say `spark`, the plugin maps that to `gpt-5.3-codex-spark`
- follow-up rescue requests can continue the latest Codex task in the repo

### `/codex:paper-review`

Runs a Codex peer review of an academic paper (PDF, LaTeX, Markdown, or plain text).

Codex evaluates the paper across standard academic dimensions: novelty, methodology, statistical rigor, claims vs. evidence, clarity, related work, limitations, reproducibility, and ethics.

> [!NOTE]
> Paper reviews can take a while, especially in panel mode. It's generally recommended to run them in the background.

Examples:

```bash
/codex:paper-review paper.pdf
/codex:paper-review manuscript.tex --background
/codex:paper-review draft.md focus on statistical methodology
```

This command is read-only and will not perform any changes.

#### Panel review mode

Use `--panel` to run a multi-persona review panel with three independent reviewers and an Area Chair synthesis:

- **The Empiricist** — focuses on methodology, statistical rigor, and reproducibility
- **The Theorist** — focuses on novelty, contribution significance, and theoretical framing
- **The Practitioner** — focuses on clarity, real-world impact, and ethical considerations

The Area Chair aggregates all three reviews using confidence-weighted scoring, identifies consensus and disagreements, and produces a final recommendation with prioritized action items.

```bash
/codex:paper-review paper.pdf --panel
/codex:paper-review paper.pdf --panel --venue neurips
/codex:paper-review paper.pdf --panel --venue nature focus on statistical methodology
```

#### Venue calibration

Use `--venue <name>` with `--panel` to calibrate the review to a specific venue's acceptance standards:

| Venue | Acceptance Rate | Focus |
|-------|----------------|-------|
| `neurips` | ~25% | Originality, quality, clarity, significance |
| `icml` | ~25% | Technical rigor, theoretical contributions |
| `iclr` | ~30% | Representation learning, open review |
| `acl` | ~20-25% | Linguistic insight, reproducibility |
| `nature` | ~8% | Broad significance, exceptional novelty |
| `workshop` | ~50-70% | Interesting ideas, promising directions |

#### Review output

Single-reviewer mode returns a structured review with recommendation (accept / minor-revision / major-revision / reject), strengths, weaknesses, detailed findings, questions for authors, and overall assessment.

Panel mode additionally includes a score comparison table across all reviewers, consensus points, disagreements, priority action items, and the Area Chair's meta-review.

#### Supplementary documents (`--docs`)

Use `--docs <folder>` to include call guidelines, submission instructions, or prior reviewer feedback as additional context for the review:

```bash
/codex:paper-review paper.pdf --docs ./submission-guidelines/
/codex:paper-review paper.pdf --panel --venue neurips --docs ./call-docs/
```

#### Code-methods alignment (`--code`)

Use `--code <path>` to cross-validate the paper's methods against the actual implementation code. Codex reads the codebase and checks for hyperparameter mismatches, undocumented preprocessing steps, data leakage, and other discrepancies:

```bash
/codex:paper-review paper.pdf --code ./experiments/
/codex:paper-review paper.pdf --panel --code ./src/ focus on statistical implementation
```

### `/codex:grant-review`

Runs a Codex peer review of a research grant proposal (PDF, Word, Markdown, or plain text).

Codex evaluates the proposal across standard grant review dimensions: significance, innovation, approach, investigator, environment, budget, and timeline.

> [!NOTE]
> Grant reviews can take a while, especially in panel mode. It's generally recommended to run them in the background.

Examples:

```bash
/codex:grant-review proposal.pdf
/codex:grant-review proposal.pdf --panel --agency horizon
/codex:grant-review proposal.pdf --panel --agency erc --background
```

This command is read-only and will not perform any changes.

#### Panel review mode

Use `--panel` to run a multi-persona review panel with three independent reviewers and a panel synthesis:

- **Scientific Reviewer** — focuses on scientific merit, novelty, methodology, and feasibility
- **Program Officer** — focuses on strategic fit, agency priorities, and portfolio alignment
- **Feasibility Assessor** — focuses on budget justification, timeline realism, and team qualifications

The panel synthesizes all three reviews, identifies consensus and disagreements, and produces a final funding recommendation with prioritized action items.

```bash
/codex:grant-review proposal.pdf --panel
/codex:grant-review proposal.pdf --panel --agency nih
/codex:grant-review proposal.pdf --panel --agency nsf focus on broader impacts
```

#### Agency calibration

Use `--agency <name>` to calibrate the review to a specific funding agency's acceptance standards and priorities. Works with both single and panel mode.

| Agency | Acceptance Rate | Focus |
|--------|----------------|-------|
| `horizon` | ~15% | Excellence, impact, implementation quality (EU Horizon Europe) |
| `erc` | ~14% | Scientific excellence, investigator track record (European Research Council) |
| `ukri` | ~25-30% | Innovation, societal impact, national priority areas |
| `dfg` | ~30% | Scientific quality, originality, feasibility (German Research Foundation) |
| `anr` | ~24% | Scientific excellence, international collaboration (French National Research Agency) |
| `snsf` | ~20-40% | Scientific merit, methodology, career development (Swiss National Science Foundation) |
| `nwo` | ~14-20% | Scientific quality, societal relevance (Dutch Research Council) |
| `nih` | ~20% | Significance, innovation, approach, investigators, environment |
| `nsf` | ~25% | Intellectual merit, broader impacts |
| `doe` | varies | Scientific merit, relevance to DOE mission, technology transfer potential |
| `darpa` | varies | Revolutionary potential, technical feasibility, transition to practice |

#### Review output

Single-reviewer mode returns a structured review with recommendation (fund / fund-with-revisions / revise-and-resubmit / do-not-fund), strengths, weaknesses, detailed findings per review dimension, questions for investigators, and overall assessment.

Panel mode additionally includes a score comparison table across all reviewers, consensus points, disagreements, priority action items, and the panel's funding recommendation.

Grant review also supports `--docs <folder>` for including call guidelines, and `--code <path>` for reviewing preliminary data code:

```bash
/codex:grant-review proposal.pdf --panel --agency horizon --docs ./call-guidelines/
/codex:grant-review proposal.pdf --code ./pilot-study/
```

### `/codex:status`

Shows running and recent Codex jobs for the current repository.

Examples:

```bash
/codex:status
/codex:status task-abc123
```

Use it to:

- check progress on background work
- see the latest completed job
- confirm whether a task is still running

### `/codex:result`

Shows the final stored Codex output for a finished job.
When available, it also includes the Codex session ID so you can reopen that run directly in Codex with `codex resume <session-id>`.

Examples:

```bash
/codex:result
/codex:result task-abc123
```

### `/codex:cancel`

Cancels an active background Codex job.

Examples:

```bash
/codex:cancel
/codex:cancel task-abc123
```

### `/codex:setup`

Checks whether Codex is installed and authenticated.
If Codex is missing and npm is available, it can offer to install Codex for you.

You can also use `/codex:setup` to manage the optional review gate.

#### Enabling review gate

```bash
/codex:setup --enable-review-gate
/codex:setup --disable-review-gate
```

When the review gate is enabled, the plugin uses a `Stop` hook to run a targeted Codex review based on Claude's response. If that review finds issues, the stop is blocked so Claude can address them first.

> [!WARNING]
> The review gate can create a long-running Claude/Codex loop and may drain usage limits quickly. Only enable it when you plan to actively monitor the session.

## Typical Flows

### Review Before Shipping

```bash
/codex:review
```

### Review An Academic Paper

```bash
/codex:paper-review paper.pdf
```

### Multi-Persona Paper Review Panel

```bash
/codex:paper-review paper.pdf --panel --venue neurips --background
/codex:status
/codex:result
```

### Review A Grant Proposal

```bash
/codex:grant-review proposal.pdf
```

### Multi-Persona Grant Review Panel

```bash
/codex:grant-review proposal.pdf --panel --agency nih --background
/codex:status
/codex:result
```

### Hand A Problem To Codex

```bash
/codex:rescue investigate why the build is failing in CI
```

### Start Something Long-Running

```bash
/codex:adversarial-review --background
/codex:rescue --background investigate the flaky test
```

Then check in with:

```bash
/codex:status
/codex:result
```

## Codex Integration

The Codex plugin wraps the [Codex app server](https://developers.openai.com/codex/app-server). It uses the global `codex` binary installed in your environment and [applies the same configuration](https://developers.openai.com/codex/config-basic).

### Common Configurations

If you want to change the default reasoning effort or the default model that gets used by the plugin, you can define that inside your user-level or project-level `config.toml`. For example to always use `gpt-5.4-mini` on `high` for a specific project you can add the following to a `.codex/config.toml` file at the root of the directory you started Claude in:

```toml
model = "gpt-5.4-mini"
model_reasoning_effort = "xhigh"
```

Your configuration will be picked up based on:

- user-level config in `~/.codex/config.toml`
- project-level overrides in `.codex/config.toml`
- project-level overrides only load when the [project is trusted](https://developers.openai.com/codex/config-advanced#project-config-files-codexconfigtoml)

Check out the Codex docs for more [configuration options](https://developers.openai.com/codex/config-reference).

### Moving The Work Over To Codex

Delegated tasks and any [stop gate](#what-does-the-review-gate-do) run can also be directly resumed inside Codex by running `codex resume` either with the specific session ID you received from running `/codex:result` or `/codex:status` or by selecting it from the list.

This way you can review the Codex work or continue the work there.

## FAQ

### Do I need a separate Codex account for this plugin?

If you are already signed into Codex on this machine, that account should work immediately here too. This plugin uses your local Codex CLI authentication.

If you only use Claude Code today and have not used Codex yet, you will also need to sign in to Codex with either a ChatGPT account or an API key. [Codex is available with your ChatGPT subscription](https://developers.openai.com/codex/pricing/), and [`codex login`](https://developers.openai.com/codex/cli/reference/#codex-login) supports both ChatGPT and API key sign-in. Run `/codex:setup` to check whether Codex is ready, and use `!codex login` if it is not.

### Does the plugin use a separate Codex runtime?

No. This plugin delegates through your local [Codex CLI](https://developers.openai.com/codex/cli/) and [Codex app server](https://developers.openai.com/codex/app-server/) on the same machine.

That means:

- it uses the same Codex install you would use directly
- it uses the same local authentication state
- it uses the same repository checkout and machine-local environment

### Will it use the same Codex config I already have?

Yes. If you already use Codex, the plugin picks up the same [configuration](#common-configurations).

### Can I keep using my current API key or base URL setup?

Yes. Because the plugin uses your local Codex CLI, your existing sign-in method and config still apply.

If you need to point the built-in OpenAI provider at a different endpoint, set `openai_base_url` in your [Codex config](https://developers.openai.com/codex/config-advanced/#config-and-state-locations).
