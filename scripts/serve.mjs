#!/usr/bin/env node
// npm run stop      stop whatever is listening on PORT (default 3000)
// npm run restart   stop, build, start in the background, wait until it answers
//
// WHY THIS EXISTS: an agent cannot press Ctrl+C, and killing the `npm start`
// wrapper leaves the `next-server` child holding the port, so the OLD build
// keeps serving and a restart looks like it worked. These commands find the
// process by the PORT it holds, which is the only thing that matters, and they
// never touch any other process.
import { spawn, spawnSync } from "node:child_process";
import { openSync, mkdirSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 3000);
const win = process.platform === "win32";

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`PORT must be a number from 1 to 65535 (got "${process.env.PORT}").`);
  process.exit(1);
}

/** PIDs LISTENING on PORT, never anything that merely connects to it. */
function listeners() {
  const pids = new Set();
  if (win) {
    const out = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" }).stdout || "";
    for (const line of out.split(/\r?\n/)) {
      const c = line.trim().split(/\s+/); // Proto Local Foreign State PID
      if (c.length >= 5 && c[3] === "LISTENING" && c[1].endsWith(`:${PORT}`)) pids.add(Number(c[4]));
    }
  } else {
    let out = spawnSync("lsof", ["-ti", `tcp:${PORT}`, "-sTCP:LISTEN"], { encoding: "utf8" });
    if (out.error || (!out.stdout && out.status !== 1)) {
      out = spawnSync("fuser", [`${PORT}/tcp`], { encoding: "utf8" });
    }
    for (const t of ((out.stdout || "") + " " + (out.stderr || "")).match(/\d+/g) || []) {
      // fuser prints "3000/tcp:" on stderr; skip the port number itself
      if (Number(t) !== PORT) pids.add(Number(t));
    }
  }
  pids.delete(0);
  return [...pids];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const answers = () =>
  new Promise((res) => {
    const s = net.connect({ port: PORT, host: "127.0.0.1" }, () => { s.destroy(); res(true); });
    s.on("error", () => res(false));
  });

async function stop() {
  const pids = listeners();
  if (!pids.length) { console.log(`Nothing is listening on port ${PORT}. Nothing to stop.`); return; }
  for (const pid of pids) {
    console.log(`Stopping process ${pid} (the one listening on port ${PORT}).`);
    if (win) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    else { try { process.kill(pid, "SIGTERM"); } catch {} }
  }
  for (let i = 0; i < 30 && listeners().length; i++) {
    if (i === 15 && !win) for (const pid of listeners()) { try { process.kill(pid, "SIGKILL"); } catch {} }
    await sleep(200);
  }
  if (listeners().length) {
    console.error(`Port ${PORT} is still held by ${listeners().join(", ")}. Stop it by hand.`);
    process.exit(1);
  }
  console.log(`Port ${PORT} is free.`);
}

async function restart() {
  await stop();
  console.log("Building...");
  const b = spawnSync("npm run build", { cwd: root, stdio: "inherit", shell: true });
  if (b.status !== 0) { console.error("Build failed, so the server was NOT started. Fix the error above, then run `npm run restart` again."); process.exit(1); }
  mkdirSync(join(root, ".next"), { recursive: true });
  const logPath = join(root, ".next", `serve-${PORT}.log`);
  const log = openSync(logPath, "w");
  const child = spawn(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], {
    cwd: root, detached: true, stdio: ["ignore", log, log], windowsHide: true,
  });
  child.unref();
  for (let i = 0; i < 100; i++) {
    if (await answers()) {
      console.log(`Serving the NEW build at http://localhost:${PORT} (process ${listeners().join(", ") || child.pid}).`);
      console.log(`Stop it with: PORT=${PORT} npm run stop     Log: ${logPath}`);
      return;
    }
    await sleep(300);
  }
  console.error(`Nothing answered on port ${PORT} after 30 seconds. See ${logPath}.`);
  process.exit(1);
}

const cmd = process.argv[2];
if (cmd === "stop") await stop();
else if (cmd === "restart") await restart();
else { console.error("usage: node scripts/serve.mjs stop|restart  (PORT env, default 3000)"); process.exit(1); }
