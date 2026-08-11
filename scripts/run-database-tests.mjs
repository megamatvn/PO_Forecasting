import { readFile } from "node:fs/promises";
import process from "node:process";
import postgres from "postgres";

const files = process.argv.slice(2).filter((argument) => argument !== "--");
const connectionString =
  process.env.SUPABASE_DB_POOLER_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Thiếu SUPABASE_DB_POOLER_URL hoặc DATABASE_URL để chạy database tests.",
  );
}

if (files.length === 0) {
  throw new Error("Hãy truyền ít nhất một file SQL test.");
}

const sql = postgres(connectionString, {
  max: 1,
  prepare: false,
  ssl: "require",
});

function collectTapLines(value, lines = []) {
  if (
    typeof value === "string" &&
    /^(?:(?:not )?ok\b|# Looks like|Bail out!)/.test(value)
  ) {
    lines.push(value);
    return lines;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTapLines(item, lines);
    }
    return lines;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectTapLines(item, lines);
    }
  }

  return lines;
}

let hasFailure = false;

try {
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const result = await sql.unsafe(source);
    const tapLines = collectTapLines(result);

    for (const line of tapLines) {
      console.log(`${file}: ${line}`);
      hasFailure ||=
        line.startsWith("not ok") ||
        line.startsWith("# Looks like") ||
        line.startsWith("Bail out!");
    }

    if (tapLines.length === 0) {
      console.log(`${file}: executed without TAP failures`);
    }
  }
} finally {
  await sql.end();
}

if (hasFailure) {
  process.exitCode = 1;
}
