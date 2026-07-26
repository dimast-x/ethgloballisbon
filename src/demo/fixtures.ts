import { fromDisplay } from "../protocol/money";
import type {
  AgentDelegation,
  BuyerAllocation,
  Offer,
  PublicIdentity,
  Program,
  Vendor,
} from "../protocol/types";

export type DemoAgentFixture = {
  agentId: string;
  principalId: string;
  publicIdentity: PublicIdentity;
  organizationName: string;
  executionAccountId: string;
  role: string;
  delegation: AgentDelegation;
};

export type DemoFixture = {
  slug: string;
  organizationId: string;
  buyerId: string;
  program: Program;
  allocation: BuyerAllocation;
  vendors: Vendor[];
  offers: Offer[];
  selectedOfferId: string;
  rejectedAmount: ReturnType<typeof fromDisplay>;
  agent: DemoAgentFixture;
};

export const universityGpuFixture: DemoFixture = {
  slug: "university-gpu",
  organizationId: "org_lisbon_university",
  buyerId: "buyer_robotics_lab",
  program: {
    id: "program_ai_compute",
    organizationId: "org_lisbon_university",
    name: "AI Research Compute Fund",
    description:
      "A policy-controlled budget for university research infrastructure.",
    budget: fromDisplay("20"),
    status: "ACTIVE",
    policy: {
      allowedCategories: ["GPU_COMPUTE"],
      maxOrderAmount: fromDisplay("5"),
      requireDeliveryEvidence: true,
      approvalRequirements: [
        { role: "DELIVERY_VERIFIER", count: 1 },
        { role: "FINANCE", count: 1 },
      ],
    },
  },
  allocation: {
    id: "allocation_robotics",
    programId: "program_ai_compute",
    buyerId: "buyer_robotics_lab",
    participantType: "HUMAN",
    humanVerificationRequired: false,
    totalLimit: fromDisplay("5"),
    committed: fromDisplay("0"),
    paid: fromDisplay("0"),
    allowedCategories: ["GPU_COMPUTE"],
  },
  vendors: [
    {
      id: "vendor_atlas",
      name: "Atlas Compute",
      settlementAccountId: "0.0.70101",
      approvedCategories: ["GPU_COMPUTE"],
      status: "APPROVED",
    },
    {
      id: "vendor_nova",
      name: "Nova GPU",
      settlementAccountId: "0.0.70102",
      approvedCategories: ["GPU_COMPUTE"],
      status: "APPROVED",
    },
    {
      id: "vendor_horizon",
      name: "Horizon Cloud",
      settlementAccountId: "0.0.70103",
      approvedCategories: ["GPU_COMPUTE"],
      status: "APPROVED",
    },
  ],
  offers: [
    {
      id: "offer_atlas",
      programId: "program_ai_compute",
      vendorId: "vendor_atlas",
      category: "GPU_COMPUTE",
      description: "A100 research cluster · 1-day delivery",
      amount: fromDisplay("3.7"),
      deliveryDays: 1,
    },
    {
      id: "offer_nova",
      programId: "program_ai_compute",
      vendorId: "vendor_nova",
      category: "GPU_COMPUTE",
      description: "A100 research cluster · 5-day delivery",
      amount: fromDisplay("3.3"),
      deliveryDays: 5,
    },
    {
      id: "offer_horizon",
      programId: "program_ai_compute",
      vendorId: "vendor_horizon",
      category: "GPU_COMPUTE",
      description: "A100 research cluster · 2-day delivery",
      amount: fromDisplay("3.5"),
      deliveryDays: 2,
    },
  ],
  selectedOfferId: "offer_horizon",
  rejectedAmount: fromDisplay("5.5"),
  agent: {
    agentId: "agent_robotics_lab",
    principalId: "principal_alice",
    publicIdentity: { scheme: "ens", name: "buyer.robotics-lab.eth" },
    organizationName: "lisbon-university.eth",
    executionAccountId: "0.0.4859221",
    role: "PROCUREMENT_AGENT",
    delegation: {
      delegationId: "delegation_robotics",
      organizationId: "org_lisbon_university",
      principalId: "principal_alice",
      agentId: "agent_robotics_lab",
      humanVerificationRequired: true,
      allowedPrograms: ["*"],
      allowedActions: ["CREATE_ORDER", "CREATE_SCHEDULED_PAYMENT"],
      allowedCategories: ["GPU_COMPUTE"],
      maxPerOrder: fromDisplay("4"),
      maxTotalSpend: fromDisplay("4"),
      validFrom: "2025-01-01T00:00:00.000Z",
      validUntil: "2030-01-01T00:00:00.000Z",
      integrityHash: "fixture",
    },
  },
};

export const medicalSupplyFixture: DemoFixture = {
  slug: "ngo-medical-supplies",
  organizationId: "org_field_relief",
  buyerId: "buyer_clinic_north",
  program: {
    id: "program_clinic_supply",
    organizationId: "org_field_relief",
    name: "Regional Clinic Supply Program",
    description: "Restricted purchasing for verified medical supply deliveries.",
    budget: fromDisplay("40"),
    status: "ACTIVE",
    policy: {
      allowedCategories: ["MEDICAL_SUPPLIES"],
      maxOrderAmount: fromDisplay("8"),
      requireDeliveryEvidence: true,
      approvalRequirements: [{ role: "FIELD_VERIFIER", count: 1 }],
    },
  },
  allocation: {
    id: "allocation_clinic_north",
    programId: "program_clinic_supply",
    buyerId: "buyer_clinic_north",
    participantType: "HUMAN",
    humanVerificationRequired: false,
    totalLimit: fromDisplay("12"),
    committed: fromDisplay("0"),
    paid: fromDisplay("0"),
    allowedCategories: ["MEDICAL_SUPPLIES"],
  },
  vendors: [
    {
      id: "vendor_care",
      name: "Careline Logistics",
      settlementAccountId: "0.0.70201",
      approvedCategories: ["MEDICAL_SUPPLIES"],
      status: "APPROVED",
    },
  ],
  offers: [
    {
      id: "offer_care",
      programId: "program_clinic_supply",
      vendorId: "vendor_care",
      category: "MEDICAL_SUPPLIES",
      description: "Sterile field kits · 3-day delivery",
      amount: fromDisplay("6"),
      deliveryDays: 3,
    },
  ],
  selectedOfferId: "offer_care",
  rejectedAmount: fromDisplay("13"),
  agent: {
    agentId: "agent_clinic_north",
    principalId: "principal_field_coordinator",
    publicIdentity: { scheme: "did:web", name: "buyer.clinic.field-relief.example" },
    organizationName: "field-relief.example",
    executionAccountId: "service:clinic-north",
    role: "FIELD_BUYER_AGENT",
    delegation: {
      delegationId: "delegation_clinic_north",
      organizationId: "org_field_relief",
      principalId: "principal_field_coordinator",
      agentId: "agent_clinic_north",
      humanVerificationRequired: true,
      allowedPrograms: ["*"],
      allowedActions: ["CREATE_ORDER"],
      allowedCategories: ["MEDICAL_SUPPLIES"],
      maxPerOrder: fromDisplay("7"),
      maxTotalSpend: fromDisplay("10"),
      validFrom: "2025-01-01T00:00:00.000Z",
      validUntil: "2030-01-01T00:00:00.000Z",
      integrityHash: "fixture",
    },
  },
};
