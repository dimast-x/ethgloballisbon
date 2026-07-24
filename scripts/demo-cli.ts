import { universityGpuFixture } from "../src/demo/fixtures";
import { advanceDemo, createDemoSession, type DemoAction } from "../src/demo/simulator";

let session = createDemoSession(universityGpuFixture);
const actions: DemoAction[] = [
  "REJECT_OVER_LIMIT",
  "CREATE_ORDER",
  "ACCEPT_ORDER",
  "CREATE_SCHEDULE",
  "SUBMIT_DELIVERY",
  "APPROVE_DELIVERY",
  "APPROVE_FINANCE",
];

for (const action of actions) {
  session = advanceDemo(session, action);
}

console.table(
  session.projection.timeline.map((event) => ({
    sequence: event.ledgerReference?.sequenceNumber,
    type: event.eventType,
    actor: event.actor.role,
    consensus: event.ledgerReference?.consensusTimestamp,
  })),
);
console.log(
  JSON.stringify(
    {
      runId: session.runId,
      program: session.projection.program?.name,
      order: Object.values(session.projection.orders)[0],
      rejectedDecisions: session.projection.rejectedDecisions,
    },
    null,
    2,
  ),
);
