import type { Express } from "express";
import express from "express";
import fs from "fs";
import path from "path";

function findClientBuildDir() {
  const candidates = [
    // Most common when server runs from dist/ and client build is copied into dist/client
    path.resolve(__dirname, "client"),

    // Most reliable on Railway: run from repo root, so dist/client is here
    path.resolve(process.cwd(), "dist", "client"),

    // Fallback if Vite ever outputs under client/dist/client
    path.resolve(process.cwd(), "client", "dist", "client"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, "index.html"))) {
      return p;
    }
  }

  return { candidates };
}

export function serveStatic(app: Express) {
  const result = findClientBuildDir();

  // Found a valid directory string
  if (typeof result === "string") {
    const clientDir = result;
    app.use(express.static(clientDir));
    app.use("*", (_req, res) => {
      res.sendFile(path.resolve(clientDir, "index.html"));
    });
    return;
  }

  // Not found
  const { candidates } = result;
  throw new Error(
    `Could not find the build directory. Tried:\n${candidates.join("\n")}\n\n` +
      `Make sure the client build exists (dist/client/index.html) and the build command ran.`,
  );
}
