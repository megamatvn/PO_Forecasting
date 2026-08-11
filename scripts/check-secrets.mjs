import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { findSecret } from "./secret-rules.mjs";

function inspectText(label, text) {
  const finding = findSecret(text);
  if (finding) throw new Error(`${label}: phát hiện ${finding}`);
}

function inspectFile(path) {
  const data = readFileSync(path);
  if (data.includes(0)) return;
  inspectText(path, data.toString("utf8"));
}

function walk(path) {
  if (!existsSync(path)) return;
  if (statSync(path).isFile()) {
    inspectFile(path);
    return;
  }
  for (const entry of readdirSync(path)) walk(join(path, entry));
}

const tracked = execFileSync("git", ["ls-files", "-z"])
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
for (const path of tracked) inspectFile(path);

const history = execFileSync("git", ["log", "-p", "--all", "--no-ext-diff"], {
  maxBuffer: 64 * 1024 * 1024,
}).toString("utf8");
inspectText("git history", history);

walk(".next/static");
console.log("Secret scan passed: tracked files, Git history and browser assets are clean.");
