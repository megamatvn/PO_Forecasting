import { spawn } from "node:child_process";

const port = "3200";
const resetUrl = `http://127.0.0.1:${port}/api/e2e/reset`;
const server = spawn("pnpm", ["start", "--port", port], {
  env: { ...process.env, E2E_MODE: "true" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

const deadline = Date.now() + 20_000;

try {
  let response;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Production server exited early.\n${output}`);
    }
    try {
      response = await fetch(resetUrl, { method: "POST", redirect: "manual" });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  if (!response) throw new Error(`Production server did not become ready.\n${output}`);
  if (response.status !== 404) {
    throw new Error(`Expected ${resetUrl} to return 404, received ${response.status}.`);
  }
  console.log("Production E2E reset route is unavailable (404).");
} finally {
  server.kill("SIGTERM");
}
