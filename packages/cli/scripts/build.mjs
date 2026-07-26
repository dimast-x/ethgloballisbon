import { chmod, cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.resolve(packageRoot, "../..");
const outputDirectory = path.join(packageRoot, "dist");
const skillDirectory = path.join(packageRoot, "skill");
const skillNames = ["yareon-agent", "yareon-governor"];

await rm(outputDirectory, { recursive: true, force: true });
await rm(skillDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await mkdir(skillDirectory, { recursive: true });

await build({
  entryPoints: [path.join(packageRoot, "src/main.ts")],
  outfile: path.join(outputDirectory, "cli.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  minify: false,
});

await chmod(path.join(outputDirectory, "cli.cjs"), 0o755);
for (const skillName of skillNames) {
  await cp(
    path.join(repositoryRoot, "agent-skills", skillName),
    path.join(skillDirectory, skillName),
    { recursive: true },
  );
}
