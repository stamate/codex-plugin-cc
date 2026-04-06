import fs from "node:fs";
import path from "node:path";

export function loadPromptTemplate(rootDir, name) {
  const promptPath = path.join(rootDir, "prompts", `${name}.md`);
  return fs.readFileSync(promptPath, "utf8");
}

const CONTENT_VARIABLES = new Set([
  "PAPER_CONTENT",
  "PROPOSAL_CONTENT",
  "SUPPLEMENTARY_DOCS",
  "METHODS_SUMMARY",
  "REVIEWER_REVIEWS"
]);

function escapeContentForPrompt(value) {
  if (!value || typeof value !== "string") {
    return value ?? "";
  }
  return value.replace(/<\//g, "< /");
}

export function interpolateTemplate(template, variables) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key)) {
      return "";
    }
    const value = variables[key];
    return CONTENT_VARIABLES.has(key) ? escapeContentForPrompt(value) : value;
  });
}
