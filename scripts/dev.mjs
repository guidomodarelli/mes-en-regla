import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const forwardedNextArguments = process.argv.slice(2);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const binaryExtension = process.platform === "win32" ? ".cmd" : "";
const reactGrabCodexBinary = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  `react-grab-codex${binaryExtension}`,
);
const nextBinary = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  `next${binaryExtension}`,
);
const developmentEnvironment = {
  ...process.env,
  FORCE_COLOR: "1",
};

delete developmentEnvironment.NO_COLOR;
delete developmentEnvironment.NODE_DISABLE_COLORS;

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      cwd: projectRoot,
      env: developmentEnvironment,
      stdio: "inherit",
    });

    childProcess.on("error", reject);
    childProcess.on("exit", (exitCode, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      resolve(exitCode ?? 0);
    });
  });
}

async function startDevelopmentServer() {
  const setupStatus = await runCommand("node", [
    "scripts/verify-react-grab-codex-dev.mjs",
    "--strict",
  ]);

  if (setupStatus !== 0) {
    process.exit(setupStatus);
  }

  const reactGrabStatus = await runCommand(reactGrabCodexBinary, []);

  if (reactGrabStatus !== 0) {
    process.exit(reactGrabStatus);
  }

  const nextStatus = await runCommand(nextBinary, ["dev", ...forwardedNextArguments]);
  process.exit(nextStatus);
}

startDevelopmentServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
