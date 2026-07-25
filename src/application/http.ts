import type { ExecutionMode, ProtocolCommand } from "./commands";

export function parseExecutionMode(value: unknown): ExecutionMode {
  return value === "testnet" ? "testnet" : "simulation";
}

export function isProtocolCommand(value: unknown): value is ProtocolCommand {
  if (!value || typeof value !== "object") return false;
  const command = value as Record<string, unknown>;
  return (
    typeof command.type === "string" &&
    typeof command.idempotencyKey === "string" &&
    command.idempotencyKey.length > 0 &&
    Boolean(command.actor) &&
    typeof command.actor === "object"
  );
}

