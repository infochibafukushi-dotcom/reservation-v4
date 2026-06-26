import path from "path";
import { fileURLToPath } from "url";

const defaultRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const WORKER_MODULE_FILES = [
  "worker.js",
  "snapshot-hash.js",
  "driver-auth.js",
  "driver-reservations.js",
];

export function createMiniflareWorkerOptions(rootDir = defaultRoot) {
  return {
    modules: WORKER_MODULE_FILES.map((file) => ({
      type: "ESModule",
      path: path.join(rootDir, file),
    })),
    modulesRoot: rootDir,
  };
}
