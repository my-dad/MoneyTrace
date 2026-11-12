import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The emulator reads declared secrets from this file instead of calling Secret Manager. The fake AI
// provider ignores the value, the emulator's access policy is open, and a build wipes `dist`, so this never reaches a deployment.
const here = dirname(fileURLToPath(import.meta.url));
await writeFile(join(here, "dist/.secret.local"), "DEEPSEEK_API_KEY=unused-in-emulator\nALLOWED_EMAILS=unused-in-emulator\n");
