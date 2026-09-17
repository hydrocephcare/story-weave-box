import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { takePurchaseIntent } from "@/lib/purchase-intent";
import { openSubscribePrompt } from "@/lib/subscribe-prompt";

/**
 * After Google sign-in the browser lands back on the site origin. If the reader
 * was in the middle of subscribing, send them back to the page they were on and
 * pop the payment sheet open so they can finish.
 */
export default function PurchaseResume() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (loading || !user || done.current) return;
    const intent = takePurchaseIntent();
    if (!intent) return;
    done.current = true;

    const current = `${window.location.pathname}${window.location.search}`;
    if (intent.path !== current) navigate(intent.path);
    window.setTimeout(
      () => openSubscribePrompt("You're signed in. Finish your payment to unlock every answer key and PDF handout."),
      intent.path !== current ? 700 : 250,
    );
  }, [user, loading, navigate]);

  return null;
}
