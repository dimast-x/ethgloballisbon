import type { Money } from "./types";

export function atomic(value: bigint, asset = "HBAR", decimals = 8): Money {
  return { asset, decimals, atomicAmount: value.toString() };
}

export function fromDisplay(value: string, asset = "HBAR", decimals = 8): Money {
  const [whole = "0", fraction = ""] = value.split(".");
  const normalized = `${whole}${fraction.padEnd(decimals, "0").slice(0, decimals)}`;
  return atomic(BigInt(normalized), asset, decimals);
}

export function toDisplay(money: Money): string {
  const negative = money.atomicAmount.startsWith("-");
  const digits = negative ? money.atomicAmount.slice(1) : money.atomicAmount;
  const padded = digits.padStart(money.decimals + 1, "0");
  const split = padded.length - money.decimals;
  const fraction = padded.slice(split).replace(/0+$/, "");
  return `${negative ? "-" : ""}${padded.slice(0, split)}${fraction ? `.${fraction}` : ""}`;
}

export function assertCompatible(left: Money, right: Money): void {
  if (left.asset !== right.asset || left.decimals !== right.decimals) {
    throw new Error("Money values use different assets or decimal precision");
  }
}

export function add(left: Money, right: Money): Money {
  assertCompatible(left, right);
  return atomic(
    BigInt(left.atomicAmount) + BigInt(right.atomicAmount),
    left.asset,
    left.decimals,
  );
}

export function subtract(left: Money, right: Money): Money {
  assertCompatible(left, right);
  return atomic(
    BigInt(left.atomicAmount) - BigInt(right.atomicAmount),
    left.asset,
    left.decimals,
  );
}

export function lte(left: Money, right: Money): boolean {
  assertCompatible(left, right);
  return BigInt(left.atomicAmount) <= BigInt(right.atomicAmount);
}
