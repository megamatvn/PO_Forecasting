const databasePasswordName = "(?:SUPABASE_)?(?:DB|DATABASE)_" + "PASSWORD";
const databaseUrlName = "(?:DATABASE_URL|SUPABASE_DB_(?:POOLER_)?URL)";
const jwtVariableName = "(?:[A-Z0-9_]*(?:SERVICE[_-]?ROLE|SECRET)[A-Z0-9_]*)";

const placeholder = /^(?:$|replace(?:[-_].*)?|placeholder|example|changeme|your[-_].*)$/i;

const rules = [
  {
    label: "database URI containing credentials",
    pattern: new RegExp("postgres" + "(?:ql)?://[^\\s:@]+:[^\\s@\\[]+@", "i"),
  },
  {
    label: "database password assignment",
    pattern: new RegExp(
      `${databasePasswordName}\\s*[:=]\\s*["']?([^\\s"']+)`,
      "i",
    ),
    validate: (match) => !placeholder.test(match[1] ?? ""),
  },
  {
    label: "database URL assignment containing credentials",
    pattern: new RegExp(
      `${databaseUrlName}\\s*[:=]\\s*["']?(postgres` +
        `(?:ql)?://[^\\s:@]+:[^\\s@\\[]+@[^\\s"']+)`,
      "i",
    ),
  },
  {
    label: "Supabase service-role or secret key assignment",
    pattern: new RegExp(
      `${jwtVariableName}\\s*[:=]\\s*["']?(?:` +
        "eyJ[A-Za-z0-9_-]{20,}|sb_" + "secret_[A-Za-z0-9_-]{20,})",
      "i",
    ),
  },
  {
    label: "private key material",
    pattern: new RegExp("-----BEGIN " + "(?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
  },
];

export function findSecret(text) {
  for (const rule of rules) {
    const match = text.match(rule.pattern);
    if (match && (!rule.validate || rule.validate(match))) return rule.label;
  }
  return null;
}
