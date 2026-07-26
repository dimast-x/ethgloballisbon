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
