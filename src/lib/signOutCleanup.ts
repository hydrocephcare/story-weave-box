// Logging out must log out of everything personal: Ompath AI chats, reminders, plans, Review figures, bookmarks, the chosen university and year.
// Otherwise the next person on a shared phone or laptop would see the previous student's chats. The student's own copy is untouched: chats are
// kept on their account (and come back when they sign in again). Daily free-use counters stay, so signing out does not reset the free limits.
import { aiStore } from "@/lib/ompathAiStore";

const LOCAL_KEYS = [
  "ompath_ai_sessions_v2", "ompath_ai_active", "ompath_ai_deleted", "ompath_ai_cache_v1",
  "ompath_my_year", "ompath_university", "ompath_university_custom",
  "ompath_reminders_v1", "ompath_plans_v1", "ompath_review_v1", "ompath_bookmarks_v1", "ompath_missed_v1", "ompath_mistakes",
  "ompath_notif_dismissed", "ompath_notif_seen", "ompath_ai_fail_seen",
  ...[1, 2, 3, 4, 5, 6].map((y) => `ompath_group_y${y}`),
];
const SESSION_KEYS = ["ompath_ai_resume", "ompath_flow_reminder", "ompath_flow_plan", "ompath_ai_fail_sent"];

export function wipePersonalData() {
  aiStore.reset();
  try { LOCAL_KEYS.forEach((k) => localStorage.removeItem(k)); } catch { /* storage blocked */ }
  try { SESSION_KEYS.forEach((k) => sessionStorage.removeItem(k)); } catch { /* storage blocked */ }
  for (const e of ["ompath:university", "ompath:review", "ompath:signed-out"]) window.dispatchEvent(new Event(e));
}
