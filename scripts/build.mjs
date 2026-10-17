import { mkdir } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
const temporary = path.resolve(".data/build-temp");
await mkdir(temporary, { recursive: true });
process.env.TEMP = temporary;
process.env.TMP = temporary;
process.env.TMPDIR = temporary;
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  { stdio: "inherit" },
);
const { build } = await import("vite");
await build();
