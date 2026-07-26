import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CliError,
  formatAtomic,
  nextActionFor,
  parseCliArguments,
  runCli,
} from "../packages/cli/src/cli";

describe("Yareon CLI contract", () => {
  it("parses flags without consuming positional values", () => {
    const parsed = parseCliArguments([
      "buy",
      "--offer-id",
      "offer_1",
      "--execute",
    ]);
    expect(parsed.command).toBe("buy");
    expect(parsed.options.get("offer-id")).toBe("offer_1");
    expect(parsed.options.get("execute")).toBe(true);
  });

  it("rejects duplicate and malformed options", () => {
    expect(() =>
      parseCliArguments(["buy", "--execute=true"]),
    ).toThrowError(CliError);
    expect(() =>
      parseCliArguments(["buy", "--offer-id", "a", "--offer-id", "b"]),
    ).toThrowError(/provided twice/);
  });

  it("formats atomic amounts without floating point conversion", () => {
    expect(
      formatAtomic({ asset: "HBAR", atomicAmount: "123450000", decimals: 8 }),
    ).toBe("1.2345 HBAR");
  });

  it("returns the independent next actor", () => {
    expect(nextActionFor({ status: "DELIVERY_SUBMITTED" })).toBe(
      "Delivery verifier must approve the delivery.",
    );
    expect(nextActionFor({ status: "PAYMENT_EXECUTED" })).toMatch(
      /settlement is complete/,
    );
  });

  it("exposes separate member-scoped balance and offer reads", async () => {
    const previousPublicUrl = process.env.YAREON_PUBLIC_URL;
    const previousProgramId = process.env.YAREON_PROGRAM_ID;
    const originalFetch = global.fetch;
    const originalLog = console.log;
    const output: string[] = [];
    process.env.YAREON_PUBLIC_URL = "https://yareon.example";
    process.env.YAREON_PROGRAM_ID = "program_1";
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          program: { id: "program_1", name: "Robotics", status: "ACTIVE" },
          agent: { id: "agent_1" },
          remaining: {
            delegationAtomic: "300",
            allocationAtomic: "250",
            programFundsAtomic: "900",
          },
          offers: [
            {
              id: "offer_1",
              vendorId: "vendor_1",
              category: "GPU",
              description: "One approved GPU hour",
              amount: { asset: "HBAR", atomicAmount: "100", decimals: 8 },
            },
          ],
          recommendedOfferId: "offer_1",
        }),
        { status: 200 },
      );
    console.log = (value?: unknown) => output.push(String(value));

    try {
      await runCli(["balance"]);
      await runCli(["offers"]);
      const balance = JSON.parse(output[0]) as {
        data: Record<string, unknown>;
      };
      const offers = JSON.parse(output[1]) as {
        data: Record<string, unknown>;
      };
      expect(balance.data).toHaveProperty("remaining");
      expect(balance.data).not.toHaveProperty("offers");
      expect(offers.data).toMatchObject({
        recommendedOfferId: "offer_1",
        offers: [{ id: "offer_1" }],
      });
      expect(offers.data).not.toHaveProperty("remaining");
    } finally {
      global.fetch = originalFetch;
      console.log = originalLog;
      if (previousPublicUrl === undefined) {
        delete process.env.YAREON_PUBLIC_URL;
      } else {
        process.env.YAREON_PUBLIC_URL = previousPublicUrl;
      }
      if (previousProgramId === undefined) {
        delete process.env.YAREON_PROGRAM_ID;
      } else {
        process.env.YAREON_PROGRAM_ID = previousProgramId;
      }
    }
  });

  it("connects with public configuration only", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "yareon-cli-"));
    const previousConfigHome = process.env.YAREON_CONFIG_HOME;
    const previousPrivateKey = process.env.WORLD_AGENT_PRIVATE_KEY;
    process.env.YAREON_CONFIG_HOME = directory;
    delete process.env.WORLD_AGENT_PRIVATE_KEY;
    const originalFetch = global.fetch;
    const originalLog = console.log;
    global.fetch = async (input) => {
      const url = input instanceof URL ? input : new URL(input.toString());
      return new Response(
        JSON.stringify(
          url.pathname.endsWith("/manifest")
            ? { service: "yareon", apiVersion: "1" }
            : {
                program: {
                  id: "program_1",
                  name: "Robotics",
                  status: "ACTIVE",
                },
                agent: {
                  id: "agent_1",
                  worldAgentAddress:
                    "0x0000000000000000000000000000000000000001",
                },
                remaining: {
                  delegationAtomic: "1",
                  allocationAtomic: "1",
                  programFundsAtomic: "1",
                },
                offers: [],
              },
        ),
        { status: 200 },
      );
    };
    console.log = () => undefined;
    try {
      await runCli([
        "connect",
        "https://yareon.example/programs/program_1",
        "--program-id",
        "program_1",
      ]);
      const saved = JSON.parse(
        await readFile(path.join(directory, "config.json"), "utf8"),
      ) as Record<string, string>;
      expect(saved).toEqual({
        baseUrl: "https://yareon.example",
        programId: "program_1",
      });
      expect(saved).not.toHaveProperty("privateKey");
    } finally {
      global.fetch = originalFetch;
      console.log = originalLog;
      if (previousConfigHome === undefined) {
        delete process.env.YAREON_CONFIG_HOME;
      } else {
        process.env.YAREON_CONFIG_HOME = previousConfigHome;
      }
      if (previousPrivateKey === undefined) {
        delete process.env.WORLD_AGENT_PRIVATE_KEY;
      } else {
        process.env.WORLD_AGENT_PRIVATE_KEY = previousPrivateKey;
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
});
