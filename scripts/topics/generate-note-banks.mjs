import { maintenanceRequest } from "./maintenance-client.mjs";

const mode = process.argv[2] === "flashcards" ? "flashcards" : "mcqs";
const count = Math.max(1, Math.min(20, Number(process.env[mode === "mcqs" ? "NOTE_MCQ_COUNT" : "NOTE_FLASHCARD_COUNT"] || 4)));
const task = mode === "mcqs" ? "note-mcqs" : "note-flashcards";
let completed = 0, failed = 0;
for (let i = 0; i < count; i++) {
  try {
    const result = await maintenanceRequest(task);
    if (result.done) {
      console.log(`No more eligible ${mode} source notes remain.`);
      break;
    }
    if (!result.success) throw new Error(result.error || result.status || "generation did not complete");
    completed++;
    console.log(`[${i + 1}/${count}] ${result.title || mode}: ${result.questions ?? result.cards ?? result.status ?? "done"}`);
  } catch (error) {
    failed++;
    console.error(`[${mode}] item ${i + 1} failed: ${String(error?.message || error).slice(0, 240)}`);
    break;
  }
}
console.log(`Note ${mode}: ${completed} completed; ${failed} failed.`);
if (failed) process.exitCode = 1;
