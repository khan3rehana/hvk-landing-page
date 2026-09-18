import fs from "fs";
import path from "path";

/**
 * Resolves the absolute path to an email HTML template.
 * Looks in both development (src) and production (dist) directories.
 */
export function getTemplatePath(templateName: string): string {
  const normalizedName = templateName.endsWith(".html")
    ? templateName
    : `${templateName}.html`;

  const searchPaths = [
    path.join(__dirname, "../templates/emails", normalizedName),
    path.join(__dirname, "../../src/templates/emails", normalizedName),
    path.join(process.cwd(), "src/templates/emails", normalizedName),
    path.join(process.cwd(), "dist/templates/emails", normalizedName),
  ];

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  throw new Error(`Email template not found: '${templateName}'`);
}

/**
 * Returns a list of all available email template names (without .html extension).
 */
export function listAvailableTemplates(): string[] {
  const searchDirs = [
    path.join(__dirname, "../templates/emails"),
    path.join(__dirname, "../../src/templates/emails"),
    path.join(process.cwd(), "src/templates/emails"),
    path.join(process.cwd(), "dist/templates/emails"),
  ];

  const templateSet = new Set<string>();

  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.endsWith(".html")) {
            templateSet.add(file.replace(/\.html$/, ""));
          }
        }
      } catch {
        // Continue searching other directories
      }
    }
  }

  return Array.from(templateSet).sort();
}

/**
 * Checks whether a template exists.
 */
export function hasTemplate(templateName: string): boolean {
  try {
    getTemplatePath(templateName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Renders an email template by substituting variables and evaluating simple conditionals.
 * Supports:
 * - `{{key}}` -> value of data[key]
 * - `{{#if key}}content{{/if}}` -> renders content if data[key] is truthy/non-empty
 */
export function renderTemplate(
  templateName: string,
  data: Record<string, any> = {}
): string {
  const filePath = getTemplatePath(templateName);
  let html = fs.readFileSync(filePath, "utf-8");

  const mergedData: Record<string, any> = {
    year: new Date().getFullYear(),
    ...data,
  };

  // 1. Process conditional blocks: {{#if key}}...{{/if}}
  html = html.replace(
    /\{\{#if\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key, content) => {
      const value = mergedData[key];
      const isTruthy =
        value !== undefined &&
        value !== null &&
        value !== "" &&
        value !== false &&
        !(Array.isArray(value) && value.length === 0);

      return isTruthy ? content : "";
    }
  );

  // 2. Process variable placeholders: {{key}}
  html = html.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
    const value = mergedData[key];
    return value !== undefined && value !== null ? String(value) : "";
  });

  return html;
}
