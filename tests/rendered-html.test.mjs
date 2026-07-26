import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import test, { after, before } from "node:test";

let server;
let origin;

before(async () => {
  const port = await availablePort();
  origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [
      new URL("../node_modules/next/dist/bin/next", import.meta.url).pathname,
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        YAREON_AUTH_SECRET:
          "render-test-secret-with-at-least-32-characters",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  await waitForServer(origin, server);
});

after(() => {
  server?.kill("SIGTERM");
});

async function render() {
  return fetch(origin, { headers: { accept: "text/html" } });
}

test("server-renders the Yareon landing page and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>Yareon \| Policy-controlled organizational spending<\/title>/i,
  );
  assert.match(html, /Choice at the edge/);
  assert.match(html, /Create a live program/);
  assert.doesNotMatch(
    html,
    /sandbox|guest workspace|Connect MetaMask|signin-with-chatgpt|chatgpt\.site/i,
  );
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(
    html,
    /HEDERA_OPERATOR_KEY|WORLD_AGENT_PRIVATE_KEY/,
  );
});

test("keeps private Hedera and identity configuration out of browser assets", async () => {
  const assetRoot = new URL("../.next/static/", import.meta.url);
  const javascriptAssets = (await filesRecursively(assetRoot)).filter((file) =>
    file.pathname.endsWith(".js"),
  );
  const contents = await Promise.all(
    javascriptAssets.map((file) => readFile(file, "utf8")),
  );
  const browserCode = contents.join("\n");
  assert.doesNotMatch(browserCode, /HEDERA_OPERATOR_KEY/);
  assert.doesNotMatch(browserCode, /operatorPrivateKey/);
  assert.doesNotMatch(browserCode, /WORLD_AGENT_PRIVATE_KEY/);
  assert.doesNotMatch(browserCode, /ENS_RPC_URL/);
  assert.doesNotMatch(browserCode, /YAREON_AUTH_SECRET/);
});

test("ships authenticated wallet controls and transaction proof links", async () => {
  const assetRoot = new URL("../.next/static/", import.meta.url);
  const javascriptAssets = (await filesRecursively(assetRoot)).filter((file) =>
    file.pathname.endsWith(".js"),
  );
  const contents = await Promise.all(
    javascriptAssets.map((file) => readFile(file, "utf8")),
  );
  const browserCode = contents.join("\n");
  assert.match(browserCode, /Hedera WalletConnect/);
  assert.match(browserCode, /Authenticating wallet/);
  assert.match(browserCode, /Open control panel/);
  assert.match(browserCode, /Disconnect wallet/);
  assert.match(browserCode, /\/api\/auth\/challenge/);
  assert.match(browserCode, /\/api\/auth\/session/);
  assert.match(browserCode, /yareon_active_live_program/);
  assert.match(browserCode, /hashscan\.io\/testnet\/topic/);
  assert.match(browserCode, /hashscan\.io\/testnet\/schedule/);
  assert.match(browserCode, /hashscan\.io\/testnet\/transaction/);
  assert.doesNotMatch(
    browserCode,
    /sandbox simulation|guest workspace|D1 sandbox|Connect MetaMask/i,
  );
  assert.doesNotMatch(browserCode, /server-side relay|demo-relay|verifier-relay/i);
  assert.doesNotMatch(browserCode, /signin-with-chatgpt|chatgpt\.site/i);
});

async function availablePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(target, child) {
  const deadline = Date.now() + 20_000;
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    output += chunk;
  });

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js server exited early.\n${output}`);
    }
    try {
      const response = await fetch(target);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Next.js server did not start.\n${output}`);
}

async function filesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const url = new URL(entry.name, directory);
      if (entry.isDirectory()) {
        url.pathname += "/";
        return filesRecursively(url);
      }
      return [url];
    }),
  );
  return nested.flat();
}
