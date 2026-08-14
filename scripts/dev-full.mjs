import { spawn } from "node:child_process";
import net from "node:net";

const API_PORT = 3001;
const WEB_PORT = 5173;
const API_READY_TIMEOUT_MS = 30000;
const API_READY_POLL_MS = 250;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function waitForPort(port, timeoutMs) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ port, host: "127.0.0.1" });

      socket.once("connect", () => {
        socket.end();
        resolve();
      });

      socket.once("error", () => {
        socket.destroy();

        if (Date.now() - start >= timeoutMs) {
          reject(
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
    shell: true,
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

function shutdown() {
  for (const child of childProcesses) {
    if (!child.killed) {
      child.kill();
    }
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

spawnCommand("npm", ["run", "dev:server"], "api");

try {
  await waitForPort(API_PORT, API_READY_TIMEOUT_MS);
} catch (error) {
  shutdown();
  throw error;
}

spawnCommand("npm", ["run", "dev"], "web");
