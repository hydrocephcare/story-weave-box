import { describe, expect, it } from "vitest";
import { aiStore } from "@/lib/ompathAiStore";
import { wipePersonalData } from "@/lib/signOutCleanup";

describe("signing out", () => {
  it("clears chats, year, university and reminders from the device but keeps the free-use counters", () => {
    const id = aiStore.newSession();
    aiStore.addTurn(id, { id: "t1", q: "hello there", answer: "hi", hits: [], grounded: true, at: Date.now() });
    localStorage.setItem("ompath_my_year", "4");
    localStorage.setItem("ompath_university", "Mount Kenya University (MKU)");
    localStorage.setItem("ompath_reminders_v1", "[{}]");
    localStorage.setItem("ompath_ai_usage", JSON.stringify({ day: "2026-10-09", n: 3 }));
    sessionStorage.setItem("ompath_flow_plan", "{}");
    expect(aiStore.get().sessions.length).toBeGreaterThan(0);

    wipePersonalData();

    expect(aiStore.get().sessions).toHaveLength(0);
    expect(aiStore.get().activeId).toBeNull();
    expect(aiStore.exportForSync().deleted).toHaveLength(0); // not recorded as "deleted", so the account copy survives
    expect(localStorage.getItem("ompath_my_year")).toBeNull();
    expect(localStorage.getItem("ompath_university")).toBeNull();
    expect(localStorage.getItem("ompath_reminders_v1")).toBeNull();
    expect(sessionStorage.getItem("ompath_flow_plan")).toBeNull();
    expect(localStorage.getItem("ompath_ai_usage")).not.toBeNull();
  });
});
