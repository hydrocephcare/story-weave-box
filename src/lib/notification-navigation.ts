// Web-safe compatibility layer. Native notification navigation remains mobile-only.

export function openNotificationAction(actionUrl?: string | null): void {
  if (!actionUrl) return;
  if (/^https?:\/\//i.test(actionUrl)) {
    window.location.assign(actionUrl);
    return;
  }
  window.location.assign(actionUrl.startsWith("/") ? actionUrl : `/${actionUrl}`);
}
