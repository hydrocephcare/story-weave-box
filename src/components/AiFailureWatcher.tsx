import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { newAiFailureCount } from "@/lib/aiHealth";

/** Tells the admin, once per visit and then every ten minutes, when Ompath AI has failed for students since they last looked. Does nothing for everyone else. */
export default function AiFailureWatcher() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!isAdmin) return;
    let last = 0;
    const check = async () => {
      const n = await newAiFailureCount();
      if (n > 0 && n !== last) {
        last = n;
        toast({
          title: "Ompath AI had problems",
          description: `${n} time${n === 1 ? "" : "s"} it could not answer for students. They got a fallback; open AI health to see why.`,
          duration: 15000,
          action: <ToastAction altText="Open AI health" onClick={() => navigate("/admin#ai-health")}>Open</ToastAction>,
        });
      }
    };
    const first = window.setTimeout(() => void check(), 4000);
    const t = window.setInterval(() => void check(), 10 * 60_000);
    const seen = () => { last = 0; };
    window.addEventListener("ompath:ai-health", seen);
    return () => { window.clearTimeout(first); window.clearInterval(t); window.removeEventListener("ompath:ai-health", seen); };
  }, [isAdmin, navigate]);
  return null;
}
