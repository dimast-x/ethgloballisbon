import { createEvent, type ProtocolEvent, type RecordedEvent } from "../protocol/events";
import { createDemoSession, advanceDemo, type DemoAction, type DemoSession } from "../demo/simulator";
import { universityGpuFixture } from "../demo/fixtures";
import { reduceProtocolEvents, type ProtocolProjection } from "../protocol/reducer";
import type { Program } from "../protocol/types";

const runtimeKey = "__openProcureRuntime";

type Runtime = {
  sessions: Map<string, StoredSession>;
};

type StoredSession = {
  runId: string;
  events: RecordedEvent[];
  projection: ProtocolProjection;
  fixture?: DemoSession["fixture"];
};

function runtime(): Runtime {
  const root = globalThis as typeof globalThis & {
    [runtimeKey]?: Runtime;
  };
  root[runtimeKey] ??= { sessions: new Map() };
  return root[runtimeKey];
}

export function createUniversityRun(): DemoSession {
  const session = createDemoSession(universityGpuFixture);
  runtime().sessions.set(session.fixture.program.id, session);
  return session;
}

export function createProgram(program: Program): StoredSession {
  const runId = `run_${crypto.randomUUID().slice(0, 8)}`;
  const event = createEvent({
    eventType: "PROGRAM_CREATED",
    runId,
    organizationId: program.organizationId,
    programId: program.id,
    actor: { actorId: "api_client", role: "ADMIN", actorType: "HUMAN" },
    correlationId: `${runId}:program`,
    data: { program },
  });
  const events: RecordedEvent[] = [
    {
      ...event,
      ledgerReference: { sequenceNumber: 1 },
    },
  ];
  const session = { runId, events, projection: reduceProtocolEvents(events) };
  runtime().sessions.set(program.id, session);
  return session;
}

export function getProgramSession(programId: string): StoredSession | undefined {
  return runtime().sessions.get(programId);
}

export function runProgramCommand(
  programId: string,
  action: DemoAction,
): DemoSession {
  const current = getProgramSession(programId);
  if (!current) throw new Error(`Program ${programId} was not found`);
  if (!current.fixture) {
    throw new Error("This command is not available for a program without a command fixture");
  }
  const next = advanceDemo(current as DemoSession, action);
  runtime().sessions.set(programId, next);
  return next;
}

export class InMemoryEventStore {
  private events: RecordedEvent[] = [];

  async append(event: ProtocolEvent): Promise<{ sequenceNumber: number }> {
    if (!this.events.some((existing) => existing.eventId === event.eventId)) {
      this.events.push({
        ...event,
        ledgerReference: { sequenceNumber: this.events.length + 1 },
      });
    }
    return { sequenceNumber: this.events.length };
  }

  async read(programId: string): Promise<RecordedEvent[]> {
    return this.events.filter((event) => event.programId === programId);
  }
}
