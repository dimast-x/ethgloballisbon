import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

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

test("server-renders the OpenProcure startup shell and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>OpenProcure \| Policy-controlled organizational spending<\/title>/i,
  );
  assert.match(html, /Preparing OpenProcure/);
  assert.match(html, /Starting a fresh protocol run/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(
    html,
    /HEDERA_OPERATOR_KEY|HEDERA_VERIFIER_RELAY_KEY|HEDERA_FINANCE_RELAY_KEY/,
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
  assert.doesNotMatch(browserCode, /HEDERA_VERIFIER_RELAY_KEY/);
  assert.doesNotMatch(browserCode, /HEDERA_FINANCE_RELAY_KEY/);
  assert.doesNotMatch(browserCode, /operatorPrivateKey/);
  assert.doesNotMatch(browserCode, /WORLD_RP_SIGNING_KEY/);
  assert.doesNotMatch(browserCode, /WORLD_RP_ID/);
  assert.doesNotMatch(browserCode, /ENS_RPC_URL/);
});
