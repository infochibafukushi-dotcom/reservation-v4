import path from "path";
import { fileURLToPath } from "url";

const defaultRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const WORKER_MODULE_FILES = [
  "worker.js",
  "snapshot-hash.js",
  "driver-auth.js",
  "driver-reservations.js",
  "pre-opening-reset.js",
  "fare-master-api.js",
  "shared/prelaunch-reservation.js",
  "shared/fare-master-v1.js",
  "shared/fare-master-core.js",
  "shared/fare-master-permissions.js",
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

/** Integration tests assume public reservation is allowed unless testing prelaunch itself. */
export async function seedTestPublicReservationSettings(db) {
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('force_public_reservation_enabled', 'true')`)
    .run();
}
