import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const forwardedNextArguments = process.argv.slice(2);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const nextCliEntryPoint = path.join(
  projectRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      cwd: projectRoot,
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
  const nextStatus = await runCommand(process.execPath, [
    nextCliEntryPoint,
    "dev",
    ...forwardedNextArguments,
  ]);
  process.exit(nextStatus);
}

startDevelopmentServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
