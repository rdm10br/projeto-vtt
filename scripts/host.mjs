import { spawnSync, spawn } from "child_process";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const CLIENT_INDEX = path.join(rootDir, "apps/client/dist/index.html");
const SERVER_ENTRY = path.join(rootDir, "apps/server/dist/apps/server/src/server.js");

function runBuild(label, args) {
  console.log(`\n▶ Build ausente — buildando ${label}...`);
  const result = spawnSync("npm", args, { cwd: rootDir, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error(`✗ Falha ao buildar ${label}. Abortando.`);
    process.exit(1);
  }
}

// --- Passo 1: builda só o que estiver faltando ---
if (!existsSync(CLIENT_INDEX)) {
  runBuild("client", ["--workspace", "apps/client", "run", "build"]);
} else {
  console.log("✓ Build do client já existe, pulando.");
}

if (!existsSync(SERVER_ENTRY)) {
  runBuild("server", ["--workspace", "apps/server", "run", "build"]);
} else {
  console.log("✓ Build do server já existe, pulando.");
}

// --- Passo 2: sobe o server ---
console.log("\n▶ Iniciando server...");
const server = spawn("node", [SERVER_ENTRY], { cwd: rootDir, stdio: "inherit" });

server.on("exit", (code) => {
  console.log(`Server encerrado (código ${code}).`);
  tunnel?.kill();
  process.exit(code ?? 0);
});

// --- Passo 3: sobe o túnel Cloudflare, capturando a URL gerada ---
console.log("▶ Iniciando túnel Cloudflare...\n");
const tunnel = spawn("cloudflared", ["tunnel", "--url", "http://localhost:3000"], {
  cwd: rootDir,
  shell: true,
});

let urlShown = false;
const urlRegex = /https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/;

function handleTunnelOutput(chunk) {
  const text = chunk.toString();
  process.stdout.write(text); // mantém o log completo visível também

  if (!urlShown) {
    const match = text.match(urlRegex);
    if (match) {
      urlShown = true;
      console.log("\n" + "=".repeat(60));
      console.log(`  🌐 URL pública:  ${match[0]}`);
      console.log("=".repeat(60) + "\n");
    }
  }
}

tunnel.stdout.on("data", handleTunnelOutput);
tunnel.stderr.on("data", handleTunnelOutput);

tunnel.on("error", (err) => {
  console.error("\n✗ Não foi possível iniciar o cloudflared. Ele está instalado e no PATH?");
  console.error(err.message);
});

tunnel.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.warn(`Túnel encerrado com código ${code}.`);
  }
});

// --- Encerramento limpo com Ctrl+C ---
process.on("SIGINT", () => {
  console.log("\n▶ Encerrando server e túnel...");
  server.kill();
  tunnel.kill();
  process.exit(0);
});