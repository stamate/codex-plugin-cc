import fs from "node:fs";
import path from "node:path";

export function loadPromptTemplate(rootDir, name) {
  const promptPath = path.join(rootDir, "prompts", `${name}.md`);
  return fs.readFileSync(promptPath, "utf8");
}

const TRUSTED_VARIABLES = new Set([
  "VENUE_CALIBRATION",
  "AGENCY_CALIBRATION"
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
    return TRUSTED_VARIABLES.has(key) ? value : escapeContentForPrompt(value);
  });
}
