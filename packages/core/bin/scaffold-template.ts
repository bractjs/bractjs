// Placeholder substitution for `bractjs new` template files.
//
// Placeholders are matched with optional inner whitespace: `{{APP_NAME}}` in
// JSX text is a valid expression (an object literal), so formatters rewrite it
// to `{{ APP_NAME }}` — an exact-string replace then silently missed it and
// every scaffolded app crashed with "APP_NAME is not defined".

export interface TemplateVars {
  APP_NAME: string;
  BRACT_PATH: string;
}

const PLACEHOLDER = /\{\{\s*(APP_NAME|BRACT_PATH)\s*\}\}/g;

export function fillTemplate(content: string, vars: TemplateVars): string {
  return content.replace(PLACEHOLDER, (_m, key: keyof TemplateVars) => vars[key]);
}
