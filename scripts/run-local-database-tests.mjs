import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, "supabase", "tests", "database");

async function listV2Tests() {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        /^v2_.*\.test\.sql$/u.test(entry.name) &&
        !entry.name.startsWith("._"),
    )
    .map((entry) => entry.name)
    .sort();
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code: code ?? 1, signal, output }));
  });
}

const testNames = await listV2Tests();
if (testNames.length === 0) {
  throw new Error("Không tìm thấy test pgTAP V2 nào; dừng để tránh xanh giả.");
}

let testDir = sourceDir;
let stagingDir = null;
try {
  // Docker Desktop on macOS may not share an external /Volumes mount. Stage
  // only the SQL tests under the user's shared home directory in that case.
  if (process.platform === "darwin" && projectRoot.startsWith("/Volumes/")) {
    const sharedRoot = path.join(os.homedir(), ".supabase", "po-forecasting-tests-");
    stagingDir = await mkdtemp(sharedRoot);
    for (const name of testNames) {
      await cp(path.join(sourceDir, name), path.join(stagingDir, name));
    }
    testDir = stagingDir;
  }

  const result = await run("pnpm", ["supabase", "test", "db", "--local", testDir]);
  if (result.code !== 0) process.exitCode = result.code;

  const summary = result.output.match(/Files=(\d+),\s*Tests=(\d+)/u);
  const fileCount = summary ? Number(summary[1]) : 0;
  const testCount = summary ? Number(summary[2]) : 0;
  if (fileCount < testNames.length || testCount === 0 || /Result:\s+NOTESTS/u.test(result.output)) {
    console.error(
      `pgTAP discovery incomplete: expected ${testNames.length} files, received ${fileCount} files/${testCount} tests.`,
    );
    process.exitCode = 1;
  }
} finally {
  if (stagingDir) await rm(stagingDir, { recursive: true, force: true });
}
