import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

register("./cloudflare-workers-loader.mjs", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Charter landing page and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>Charter \| Policy-controlled organizational spending<\/title>/i,
  );
  assert.match(html, /Choice at the edge/);
  assert.match(html, /Create a live program/);
  assert.doesNotMatch(html, /sandbox|guest workspace|Connect MetaMask/i);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(
    html,
    /HEDERA_OPERATOR_KEY|WORLD_RP_SIGNING_KEY/,
  );
});

test("keeps private Hedera and identity configuration out of browser assets", async () => {
  const assetRoot = new URL("../dist/client/assets/", import.meta.url);
  const files = await readdir(assetRoot);
  const javascriptAssets = files.filter((file) => file.endsWith(".js"));
  const contents = await Promise.all(
    javascriptAssets.map((file) => readFile(new URL(file, assetRoot), "utf8")),
  );
  const browserCode = contents.join("\n");
  assert.doesNotMatch(browserCode, /HEDERA_OPERATOR_KEY/);
  assert.doesNotMatch(browserCode, /operatorPrivateKey/);
  assert.doesNotMatch(browserCode, /WORLD_RP_SIGNING_KEY/);
  assert.doesNotMatch(browserCode, /WORLD_RP_ID/);
  assert.doesNotMatch(browserCode, /ENS_RPC_URL/);
});

test("ships the resumable direct-wallet live flow and explorer proof links", async () => {
  const assetRoot = new URL("../dist/client/assets/", import.meta.url);
  const files = await readdir(assetRoot);
  const javascriptAssets = files.filter((file) => file.endsWith(".js"));
  const contents = await Promise.all(
    javascriptAssets.map((file) => readFile(new URL(file, assetRoot), "utf8")),
  );
  const browserCode = contents.join("\n");
  assert.match(browserCode, /Guided live integration run/);
  assert.match(browserCode, /Guided live run/);
  assert.match(browserCode, /Test without human backing/);
  assert.match(browserCode, /Test 4\.2 HBAR request/);
  assert.match(browserCode, /Hedera WalletConnect/);
  assert.match(browserCode, /charter_active_live_program/);
  assert.match(browserCode, /hashscan\.io\/testnet\/topic/);
  assert.match(browserCode, /hashscan\.io\/testnet\/schedule/);
  assert.match(browserCode, /hashscan\.io\/testnet\/transaction/);
  assert.match(browserCode, /hashscan\.io\/testnet\/account/);
  assert.doesNotMatch(
    browserCode,
    /sandbox simulation|guest workspace|D1 sandbox|Connect MetaMask/i,
  );
  assert.doesNotMatch(browserCode, /server-side relay|demo-relay|verifier-relay/i);
});
