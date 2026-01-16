import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import path from "path";
import fs from "fs";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  // Always build into /dist at repo root
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  const repoRoot = process.cwd();
  const clientRoot = path.resolve(repoRoot, "client");
  const clientOutDir = path.resolve(repoRoot, "dist", "client"); // <-- THIS is what server expects

  await viteBuild({
    root: clientRoot,
    build: {
      outDir: clientOutDir,
      emptyOutDir: false, // dist is already wiped; keep false to be safe
    },
  });

  // Hard fail if the expected file isn't there
  const indexHtml = path.join(clientOutDir, "index.html");
  if (!fs.existsSync(indexHtml)) {
    throw new Error(
      `Expected client build output at "${indexHtml}", but it was not found.`,
    );
  }

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
