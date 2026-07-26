"use client";

import dynamic from "next/dynamic";
import { LandingPage } from "./landing-page";

const YareonApp = dynamic(
  () => import("./yareon-app").then((module) => module.YareonApp),
  {
    ssr: false,
    loading: () => <LandingPage />,
  },
);

export function YareonEntry() {
  return <YareonApp />;
}

const MemberApp = dynamic(
  () => import("./member-app").then((module) => module.MemberApp),
  {
    ssr: false,
    loading: () => <LandingPage />,
  },
);

export function MemberEntry() {
  return <MemberApp />;
}
