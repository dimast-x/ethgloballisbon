"use client";

import dynamic from "next/dynamic";
import { AppLoadingPage } from "./landing-page";

const YareonApp = dynamic(
  () => import("./yareon-app").then((module) => module.YareonApp),
  {
    ssr: false,
    loading: () => <AppLoadingPage />,
  },
);

export function YareonEntry() {
  return <YareonApp />;
}

const MemberApp = dynamic(
  () => import("./member-app").then((module) => module.MemberApp),
  {
    ssr: false,
    loading: () => <AppLoadingPage message="Loading member access…" />,
  },
);

export function MemberEntry() {
  return <MemberApp />;
}
