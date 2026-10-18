import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SubscribeModal } from "@/components/SubscribeModal";
import { CLOSE_OVERLAYS_EVENT, openSubscribePrompt } from "@/lib/subscribe-prompt";
import { loadSubscriptionMode } from "@/lib/subscriptionMode";

// the subscribe prompt only exists while the admin has subscriptions switched on
vi.mock("@/lib/store", () => ({ getSetting: async (k: string) => (k === "subscriptions_enabled" ? "true" : ""), saveSetting: async () => undefined }));

const settings = { price: 150, revealPrice: 150, plans: [{ id: "semester", label: "Semester pass (3 months)", price: 150, days: 90, download: true }, { id: "annual", label: "Annual pass (12 months)", price: 400, days: 365, download: true }] } as never;

function Page() {
  const [open, setOpen] = useState(true);
  useEffect(() => { const c = () => setOpen(false); window.addEventListener(CLOSE_OVERLAYS_EVENT, c); return () => window.removeEventListener(CLOSE_OVERLAYS_EVENT, c); }, []);
  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}><SheetContent><SheetTitle>AI</SheetTitle><SheetDescription>panel</SheetDescription></SheetContent></Sheet>
      <SubscribeModal settings={settings} onUnlocked={() => undefined} />
    </>
  );
}

describe("subscription prompt over the AI panel", () => {
  beforeAll(async () => { await loadSubscriptionMode(true); });
  it("closes the panel, releases the screen lock and shows the plans, clickable", async () => {
    render(<MemoryRouter><Page /></MemoryRouter>);
    expect(screen.getByText("panel")).toBeTruthy();
    await act(async () => { openSubscribePrompt("Subscribe to reveal answers."); await new Promise((r) => setTimeout(r, 400)); });
    // jsdom never finishes the close animation, so the panel may stay in the page; what matters is that it is told to close
    const panel = screen.queryByText("panel")?.closest("[role=dialog]");
    expect(!panel || panel.getAttribute("data-state") === "closed").toBe(true);
    const dialog = screen.getByRole("dialog");
    expect((dialog as HTMLElement).style.pointerEvents).toBe("auto");
    expect(document.body.style.pointerEvents).not.toBe("none");
    const annual = screen.getByText("KES 400").closest("button")!;
    expect(annual.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(annual);
    expect(annual.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Unlimited Ompath AI questions")).toBeTruthy();
  });
});
