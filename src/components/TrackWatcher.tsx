import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getTrack, setTrack, trackFromCourse } from "@/lib/courseTrack";

/**
 * Keeps the site on the right track. A signed-in student's profile course decides (BDS or dental diplomas go to the dental section, everything else is
 * MBChB). A guest who opens a dental page is a dental visitor from then on. A dental student who lands on the home page is taken to the dental home.
 */
export default function TrackWatcher() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    let on = true;
    if (user) {
      void (async () => {
        try {
          const { data } = await (supabase as any).from("profiles").select("course").eq("user_id", user.id).maybeSingle();
          if (on && data?.course) setTrack(trackFromCourse(data.course));
          else if (on && /^\/dental(\/|$)/.test(pathname) && !data?.course) setTrack("dental");
        } catch { /* keep what is known */ }
      })();
    } else if (/^\/dental(\/|$)/.test(pathname)) setTrack("dental");
    else if (pathname === "/") setTrack("medicine"); // a guest on the home page sees both courses and picks
    return () => { on = false; };
  }, [user?.id, loading, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const go = () => { if (pathname === "/" && user && getTrack() === "dental") navigate("/dental", { replace: true }); };
    go();
    window.addEventListener("ompath:track", go);
    return () => window.removeEventListener("ompath:track", go);
  }, [pathname, navigate, user?.id]);

  return null;
}
