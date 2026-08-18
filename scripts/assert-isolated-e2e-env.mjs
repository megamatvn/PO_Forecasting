import process from "node:process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);
const LOCAL_PROJECT_REFS = new Set([
  "sagen-po-forecasting",
  "local",
  "test",
  "testing",
]);

function parseUrl(name, value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

export function validateIsolatedEnvironment(env = process.env) {
  const failures = [];
  const publicUrl = parseUrl("NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL);

  if (!publicUrl) {
    failures.push("NEXT_PUBLIC_SUPABASE_URL is required.");
  } else if (!LOOPBACK_HOSTS.has(publicUrl.hostname)) {
    failures.push("NEXT_PUBLIC_SUPABASE_URL must point to localhost/127.0.0.1.");
  }

  const databaseNames = [
    "SUPABASE_DB_URL",
    "SUPABASE_DB_POOLER_URL",
    "SUPABASE_DB_DIRECT_URL",
    "DATABASE_URL",
  ];
  for (const name of databaseNames) {
    const url = parseUrl(name, env[name]);
    if (url && !LOOPBACK_HOSTS.has(url.hostname)) {
      failures.push(`${name} must point to localhost/127.0.0.1.`);
    }
  }

  const projectRef = env.SUPABASE_PROJECT_REF?.trim();
  if (projectRef && !LOCAL_PROJECT_REFS.has(projectRef)) {
    failures.push(
      `SUPABASE_PROJECT_REF '${projectRef}' is not an allowed local/test project ref.`,
    );
  }

  const knownProductionRef = "gouplpvviajaihtmoymv";
  if (
    env.NEXT_PUBLIC_SUPABASE_URL?.includes(knownProductionRef) ||
    env.SUPABASE_DB_URL?.includes(knownProductionRef) ||
    env.SUPABASE_DB_POOLER_URL?.includes(knownProductionRef) ||
    env.SUPABASE_DB_DIRECT_URL?.includes(knownProductionRef) ||
    env.DATABASE_URL?.includes(knownProductionRef)
  ) {
    failures.push("The configured Supabase target is the production project.");
  }

  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const failures = validateIsolatedEnvironment();
    if (failures.length > 0) {
      console.error("Isolated E2E target check failed:");
      for (const failure of failures) console.error(`- ${failure}`);
      process.exitCode = 1;
    } else {
      console.log("Isolated E2E target verified: Supabase URLs are local.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
