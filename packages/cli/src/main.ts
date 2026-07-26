import { printFailure, runCli } from "./cli";

void runCli(process.argv.slice(2)).catch((error: unknown) => {
  printFailure(error);
  process.exitCode = 1;
});
