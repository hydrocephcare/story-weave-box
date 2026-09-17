import { useEffect, useState } from "react";
import { Download, Smartphone, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateMetaTags } from "@/lib/seo";

const APK_URL = "https://github.com/2023mkumbchb-source/ompathstudy-mobile/releases/latest/download/OmpathStudy.apk";
const RELEASES_API = "https://api.github.com/repos/2023mkumbchb-source/ompathstudy-mobile/releases/latest";

export default function AppDownload() {
  const [started, setStarted] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [version, setVersion] = useState("Checking latest version…");
  const [releaseDate, setReleaseDate] = useState("");

  useEffect(() => {
    setIsAndroid(/Android/i.test(navigator.userAgent));
    updateMetaTags({
      title: "Download OmpathStudy Android App",
      description: "Download the latest OmpathStudy Android application directly from the official release.",
      url: "https://www.ompathstudy.com/download-app",
    });

    const loadLatestRelease = async () => {
      try {
        const response = await fetch(RELEASES_API, {
          headers: { Accept: "application/vnd.github+json" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`GitHub release lookup failed: ${response.status}`);
        const release = await response.json();
        const tag = typeof release.tag_name === "string" ? release.tag_name : "";
        const cleanVersion = tag.replace(/-apk$/i, "").replace(/^v/i, "");
        if (cleanVersion) setVersion(`v${cleanVersion}`);
        if (typeof release.published_at === "string") {
          setReleaseDate(
            new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
              new Date(release.published_at),
            ),
          );
        }
      } catch {
        setVersion("Latest release available");
      }
    };

    void loadLatestRelease();
  }, []);

  const downloadApk = () => {
    setStarted(true);
    const link = document.createElement("a");
    link.href = APK_URL;
    link.download = "OmpathStudy.apk";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-5 py-14">
      <div className="w-full rounded-3xl border border-border bg-card p-7 text-center shadow-sm sm:p-10">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Smartphone className="h-10 w-10" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-primary">OmpathStudy Android App</p>
        <h1 className="mt-2 font-serif text-3xl font-bold text-foreground sm:text-4xl">Download the latest app</h1>

        <div className="mx-auto mt-5 flex max-w-xl flex-wrap items-center justify-center gap-2">
          <span className="rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-bold text-primary">
            Latest version: {version}
          </span>
          {releaseDate && (
            <span className="rounded-full border border-border bg-muted px-4 py-2 text-sm text-muted-foreground">
              Released {releaseDate}
            </span>
          )}
        </div>

        <p className="mx-auto mt-4 max-w-xl text-muted-foreground leading-relaxed">
          This download always points to the latest Android APK published by OmpathStudy. When a new version is released, this same website button automatically downloads the new version.
        </p>

        <div className="mt-7 flex flex-col items-center gap-3">
          <Button size="lg" onClick={downloadApk} className="gap-2 px-7">
            <Download className="h-5 w-5" />
            Download OmpathStudy APK
          </Button>
          {started && (
            <p className="flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4" /> Download started. Open the downloaded APK to install it.
            </p>
          )}
        </div>

        {isAndroid && (
          <div className="mx-auto mt-7 max-w-xl rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-left text-sm text-muted-foreground">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold text-foreground">After the download</p>
                <p className="mt-1 leading-relaxed">
                  Tap the downloaded OmpathStudy.apk file and Android will open its normal installation screen. If Android asks for permission to install apps from this browser, allow it for this installation and continue.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mx-auto mt-7 flex max-w-xl items-center justify-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Version information is read directly from the latest official GitHub release.</span>
        </div>
      </div>
    </section>
  );
}
