import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const API_PORT = 3001;
const WEB_PORT = 5173;
const API_READY_TIMEOUT_MS = Number(process.env.API_READY_TIMEOUT_MS ?? 90000);
const API_READY_POLL_MS = 250;
const isWindows = process.platform === "win32";

function log(message) {
  process.stdout.write(`${message}\n`);
}

function waitForPort(port, timeoutMs, child) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    let settled = false;

    const rejectOnce = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    const resolveOnce = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    };

    child?.once("exit", (code, signal) => {
      const reason = signal
        ? `signal ${signal}`
        : `code ${code ?? 0}`;
      rejectOnce(
        new Error(
          `Backend process exited with ${reason} before http://127.0.0.1:${port} became available.`,
        ),
      );
    });

    const tryConnect = () => {
      const socket = net.createConnection({ port, host: "127.0.0.1" });

      socket.once("connect", () => {
        socket.end();
        resolveOnce();
      });

      socket.once("error", () => {
        socket.destroy();

        if (Date.now() - start >= timeoutMs) {
          rejectOnce(
            new Error(`Timed out waiting for http://127.0.0.1:${port} to accept connections.`),
          );
          return;
        }

        setTimeout(tryConnect, API_READY_POLL_MS);
      });
    };

    tryConnect();
  });
}

const childProcesses = [];

function spawnCommand(command, args, name) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });

  childProcesses.push(child);

  child.on("exit", (code, signal) => {
    if (signal) {
      log(`[${name}] exited with signal ${signal}`);
    } else if (code && code !== 0) {
      log(`[${name}] exited with code ${code}`);
      process.exitCode = code;
    }
  });

  return child;
}

function spawnNpmScript(scriptName, name) {
  if (isWindows) {
    const comspec = process.env.ComSpec || "cmd.exe";

    return spawnCommand(
      comspec,
      ["/d", "/s", "/c", `npm run ${scriptName}`],
      name,
    );
  }

  return spawnCommand("npm", ["run", scriptName], name);
}

function terminateChildProcessTree(child) {
  if (!child?.pid) {
    return;
  }

  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(child.pid, "SIGTERM");
  } catch {
    return;
  }
}

function shutdown() {
  for (const child of childProcesses) {
    terminateChildProcessTree(child);
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(143);
});

log(`Open the app at http://localhost:${WEB_PORT}`);
log(`Backend API runs at http://localhost:${API_PORT}`);

const apiProcess = spawnNpmScript("dev:server", "api");

try {
  await waitForPort(API_PORT, API_READY_TIMEOUT_MS, apiProcess);
} catch (error) {
  shutdown();
  throw error;
}

spawnNpmScript("dev", "web");
