import { useState, type ReactNode, type ElementType } from "react";
import { ExternalLink, Menu, PanelLeftClose, X } from "lucide-react";

export type AdminNavItem<T extends string = string> = { id: T; label: string; icon: ElementType };
export type AdminNavGroup<T extends string = string> = { label: string; items: AdminNavItem<T>[] };

type Props<T extends string> = {
  activeId: T;
  activeLabel: string;
  groups: AdminNavGroup<T>[];
  onSelect: (id: T) => void;
  onViewSite: () => void;
  children: ReactNode;
};

export default function AdminWorkspace<T extends string>({ activeId, activeLabel, groups, onSelect, onViewSite, children }: Props<T>) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const section = groups.find((group) => group.items.some((item) => item.id === activeId))?.label || "Workspace";

  const select = (id: T) => { setMobileOpen(false); onSelect(id); };

  const navigation = (isCompact = false) => groups.map((group) => (
    <div key={group.label} className="mb-5">
      {!isCompact && <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{group.label}</p>}
      <div className="space-y-1">
        {group.items.map((item) => (
          <button key={item.id} onClick={() => select(item.id)} title={isCompact ? item.label : undefined}
            className={`flex min-h-11 w-full items-center rounded-xl text-sm font-medium transition-all ${isCompact ? "justify-center px-2" : "gap-3 px-3"} ${activeId === item.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <item.icon className="h-4 w-4 shrink-0" />
            {!isCompact && <span className="truncate">{item.label}</span>}
          </button>
        ))}
      </div>
    </div>
  ));

  return (
    <div className="min-h-screen bg-secondary/20">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-3 px-3">
          <button onClick={() => setMobileOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card shadow-sm" aria-label="Open admin menu"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">OmpathStudy Admin</p><p className="truncate text-sm font-semibold">{activeLabel}</p></div>
          <button onClick={onViewSite} className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground">View site</button>
        </div>
      </header>

      {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden">
        <button className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} aria-label="Close admin menu" />
        <aside className="absolute inset-y-0 left-0 flex w-[88vw] max-w-[340px] flex-col border-r border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">OmpathStudy</p><h2 className="text-lg font-bold">Admin workspace</h2></div><button onClick={() => setMobileOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg bg-secondary"><X className="h-4 w-4" /></button></div>
          <nav className="flex-1 overflow-y-auto p-3">{navigation()}</nav>
        </aside>
      </div>}

      <div className="mx-auto flex w-full max-w-[1600px]">
        <aside className={`sticky top-0 hidden h-screen shrink-0 border-r border-border/70 bg-card/80 lg:flex lg:flex-col ${compact ? "w-[82px]" : "w-[260px]"} transition-[width] duration-200`}>
          <div className="flex h-20 items-center justify-between border-b border-border/70 px-4">
            {!compact && <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">OmpathStudy</p><p className="font-bold">Admin workspace</p></div>}
            <button onClick={() => setCompact((value) => !value)} className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-background text-muted-foreground">{compact ? <Menu className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}</button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">{navigation(compact)}</nav>
          <div className="border-t border-border/70 p-3"><button onClick={onViewSite} className={`flex min-h-10 w-full items-center rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary ${compact ? "justify-center" : "gap-3 px-3"}`}><ExternalLink className="h-4 w-4" />{!compact && "View public site"}</button></div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="border-b border-border/60 bg-background/70 px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
              <div className="min-w-0"><p className="mb-1 text-xs font-medium text-muted-foreground">Admin / {section}</p><h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{activeLabel}</h1><p className="mt-1 hidden text-sm text-muted-foreground sm:block">Manage content, learning tools, integrations and site operations.</p></div>
              <button onClick={onViewSite} className="hidden rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold shadow-sm hover:bg-secondary sm:block">View site</button>
            </div>
          </div>
          <div className="mx-auto max-w-6xl p-3 pb-24 sm:p-6 lg:p-8"><div className="rounded-2xl border border-border/70 bg-background p-3 shadow-sm sm:p-5 lg:p-6">{children}</div></div>
        </main>
      </div>
    </div>
  );
}
