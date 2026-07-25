"use client";

import dynamic from "next/dynamic";
import { LandingPage } from "./landing-page";

const CharterApp = dynamic(
  () => import("./charter-app").then((module) => module.CharterApp),
  {
    ssr: false,
    loading: () => <LandingPage showcaseLoading />,
  },
);

export function CharterEntry() {
  return <CharterApp />;
}
