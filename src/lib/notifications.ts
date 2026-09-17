// Web-safe notification compatibility layer.
// Native notification UI and Android LocalNotifications stay mobile-only.

export type NotificationType = "exam" | "update" | "note" | "general";
export type NotificationPriority = "normal" | "urgent";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  study_year?: number | null;
  action_url?: string | null;
  created_at: string;
  expires_at?: string | null;
}

export interface MobileNotificationPrefs {
  pushEnabled: boolean;
  soundEnabled: boolean;
  bannerEnabled: boolean;
}

const DEFAULT_PREFS: MobileNotificationPrefs = {
  pushEnabled: false,
  soundEnabled: false,
  bannerEnabled: false,
};

export function getMobileNotificationPrefs(): MobileNotificationPrefs {
  return { ...DEFAULT_PREFS };
}

export function saveMobileNotificationPrefs(
  prefs: Partial<MobileNotificationPrefs>,
): MobileNotificationPrefs {
  return { ...DEFAULT_PREFS, ...prefs };
}

export async function checkNotificationPermission(): Promise<"granted"> {
  return "granted";
}

export async function requestNotificationPermission(): Promise<boolean> {
  return true;
}

export function subscribeToNotifications(
  _listener: (notifications: AppNotification[]) => void,
): () => void {
  return () => {};
}

export function subscribeToBanner(
  _listener: (notification: AppNotification) => void,
): () => void {
  return () => {};
}

export function getCachedNotifications(): AppNotification[] {
  return [];
}

export function getReadNotificationIds(): Set<string> {
  return new Set<string>();
}

export async function fetchUserNotifications(): Promise<AppNotification[]> {
  return [];
}

export async function fetchAdminBroadcasts(): Promise<AppNotification[]> {
  return [];
}

export const fetchBroadcastNotifications = fetchUserNotifications;

export async function publishBroadcastNotification(
  input: Omit<AppNotification, "id" | "created_at">,
): Promise<AppNotification> {
  return {
    ...input,
    id: "web-notification",
    created_at: new Date().toISOString(),
  };
}

export async function deleteBroadcastNotification(_id: string): Promise<void> {}

export async function updateBroadcastNotification(
  id: string,
  updates: Partial<Omit<AppNotification, "id" | "created_at">>,
): Promise<AppNotification> {
  return {
    id,
    title: updates.title || "Ompath Study",
    message: updates.message || "",
    type: updates.type || "general",
    priority: updates.priority || "normal",
    study_year: updates.study_year ?? null,
    action_url: updates.action_url ?? null,
    expires_at: updates.expires_at ?? null,
    created_at: new Date().toISOString(),
  };
}

export function markNotificationAsRead(_id: string): void {}
export function markAllNotificationsAsRead(): void {}
export async function startNotificationRealtime(): Promise<() => void> { return () => {}; }
export async function checkForNewNotifications(): Promise<void> {}
export async function triggerNativeNotification(_notification: AppNotification): Promise<void> {}
export function setupNativeNotificationListener(_onNavigate: (url: string) => void): () => void { return () => {}; }
