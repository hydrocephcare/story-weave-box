import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Square, Volume2, SkipForward, SkipBack } from "lucide-react";

interface Props {
  content: string;
  title: string;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\|.*\|$/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/⭐/g, "")
    .replace(/→/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitIntoChunks(text: string, maxLen = 180): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).length > maxLen && buf) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf = buf ? buf + " " + s : s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

export default function BlogAudioPlayer({ content, title }: Props) {
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const chunksRef = useRef<string[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    const plain = stripMarkdown(content);
    chunksRef.current = splitIntoChunks(plain);
  }, [content]);

  const speakChunk = useCallback((idx: number) => {
    if (idx >= chunksRef.current.length || stoppedRef.current) {
      setPlaying(false);
      setPaused(false);
      setChunkIndex(0);
      return;
    }
    setChunkIndex(idx);

    const u = new SpeechSynthesisUtterance(chunksRef.current[idx]);
    u.rate = speed;
    u.onend = () => {
      if (!stoppedRef.current) speakChunk(idx + 1);
    };
    u.onerror = () => {
      if (!stoppedRef.current) speakChunk(idx + 1);
    };
    utteranceRef.current = u;
    speechSynthesis.speak(u);

    // Auto-scroll: estimate position based on chunk index
    const progress = idx / chunksRef.current.length;
    const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: totalHeight * progress, behavior: "smooth" });
  }, [speed]);

  const handlePlay = () => {
    if (!("speechSynthesis" in window)) return;
    if (paused) {
      speechSynthesis.resume();
      setPaused(false);
      return;
    }
    stoppedRef.current = false;
    setPlaying(true);
    speakChunk(chunkIndex);
  };

  const handlePause = () => {
    speechSynthesis.pause();
    setPaused(true);
  };

  const handleStop = () => {
    stoppedRef.current = true;
    speechSynthesis.cancel();
    setPlaying(false);
    setPaused(false);
    setChunkIndex(0);
  };

  const handleSkipForward = () => {
    speechSynthesis.cancel();
    stoppedRef.current = false;
    const next = Math.min(chunkIndex + 3, chunksRef.current.length - 1);
    speakChunk(next);
  };

  const handleSkipBack = () => {
    speechSynthesis.cancel();
    stoppedRef.current = false;
    const prev = Math.max(chunkIndex - 3, 0);
    speakChunk(prev);
  };

  const cycleSpeed = () => {
    const speeds = [0.75, 1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    if (playing && !paused) {
      speechSynthesis.cancel();
      stoppedRef.current = false;
      // Re-speak current chunk at new speed (speakChunk uses updated speed via ref)
      setTimeout(() => speakChunk(chunkIndex), 50);
    }
  };

  useEffect(() => {
    return () => { speechSynthesis.cancel(); };
  }, []);

  if (!("speechSynthesis" in window)) return null;

  const progress = chunksRef.current.length > 0
    ? Math.round((chunkIndex / chunksRef.current.length) * 100)
    : 0;

  return (
    <div className="sticky top-[57px] z-40 mb-6">
      <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-sm p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground hidden sm:inline">Listen</span>

          <div className="flex items-center gap-1 ml-auto">
            <button onClick={handleSkipBack} disabled={!playing}
              className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground disabled:opacity-30 transition-colors">
              <SkipBack className="h-3.5 w-3.5" />
            </button>

            {!playing || paused ? (
              <button onClick={handlePlay}
                className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                <Play className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={handlePause}
                className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                <Pause className="h-4 w-4" />
              </button>
            )}

            <button onClick={handleSkipForward} disabled={!playing}
              className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground disabled:opacity-30 transition-colors">
              <SkipForward className="h-3.5 w-3.5" />
            </button>

            {playing && (
              <button onClick={handleStop}
                className="p-1.5 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                <Square className="h-3.5 w-3.5" />
              </button>
            )}

            <button onClick={cycleSpeed}
              className="px-2 py-1 rounded-full text-[10px] font-bold text-muted-foreground hover:bg-secondary transition-colors">
              {speed}x
            </button>
          </div>
        </div>

        {playing && (
          <div className="mt-2 h-1 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
