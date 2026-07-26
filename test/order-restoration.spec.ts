import { describe, expect, it } from "vitest";
import { restoredActiveOrderId } from "../app/yareon-app";
import type { Order } from "../src/protocol/types";

function order(id: string, status: Order["status"]): Order {
  return {
    id,
    programId: "program_1",
    buyerId: "buyer_1",
    vendorId: "vendor_1",
    offerId: "offer_1",
    category: "compute",
    amount: {
      asset: "HBAR",
      decimals: 8,
      atomicAmount: "100000000",
    },
    status,
    approvals: [],
  };
}

describe("restoredActiveOrderId", () => {
  it("restores the latest completed order instead of an empty draft", () => {
    const orders = {
      order_first: order("order_first", "PAYMENT_EXECUTED"),
      order_second: order("order_second", "PAYMENT_EXECUTED"),
    };

    expect(restoredActiveOrderId(orders, () => "order_new")).toBe(
      "order_second",
    );
  });

  it("prefers the latest unfinished order", () => {
    const orders = {
      order_open: order("order_open", "PAYMENT_SCHEDULED"),
      order_complete: order("order_complete", "PAYMENT_EXECUTED"),
    };

    expect(restoredActiveOrderId(orders, () => "order_new")).toBe(
      "order_open",
    );
  });

  it("creates an order id only when no history exists", () => {
    expect(restoredActiveOrderId({}, () => "order_new")).toBe("order_new");
  });
});
