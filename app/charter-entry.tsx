"use client";

import dynamic from "next/dynamic";
import { RefreshCw } from "lucide-react";

const CharterApp = dynamic(
  () => import("./charter-app").then((module) => module.CharterApp),
  {
    ssr: false,
    loading: () => (
      <main className="shell loading-shell">
        <div className="loading-card">
          <RefreshCw className="spin" size={24} />
          <strong>Preparing live Charter</strong>
          <span>Connecting to Hedera Mirror Node…</span>
        </div>
      </main>
    ),
  },
);

export function CharterEntry() {
  return <CharterApp />;
}
