import { useEffect, useRef } from "react";

interface Props {
  videoId: string;
  start?: number | null;
  end?: number | null;
  autoplay?: boolean;
  onEnd?: () => void;
  className?: string;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
    __ytApiPromise?: Promise<void>;
  }
}

const loadYouTubeApi = (): Promise<void> => {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (window.__ytApiPromise) return window.__ytApiPromise;

  window.__ytApiPromise = new Promise<void>((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
  });
  return window.__ytApiPromise;
};

export const YouTubeClipPlayer = ({
  videoId,
  start,
  end,
  autoplay = false,
  onEnd,
  className,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<number | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    endedRef.current = false;

    const init = async () => {
      await loadYouTubeApi();
      if (cancelled || !containerRef.current) return;

      // Clear container in case of re-init
      containerRef.current.innerHTML = "";
      const div = document.createElement("div");
      containerRef.current.appendChild(div);

      const playerVars: any = {
        autoplay: autoplay ? 1 : 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
      };
      if (typeof start === "number" && start > 0) playerVars.start = Math.floor(start);
      if (typeof end === "number" && end > 0) playerVars.end = Math.floor(end);

      playerRef.current = new window.YT.Player(div, {
        videoId,
        playerVars,
        events: {
          onReady: (e: any) => {
            if (autoplay) {
              try {
                e.target.playVideo();
              } catch {}
            }
          },
          onStateChange: (e: any) => {
            // 0 = ended
            if (e.data === 0 && !endedRef.current) {
              endedRef.current = true;
              onEnd?.();
            }
          },
        },
      });

      // Hard-stop poller — pause when reaching end time
      if (typeof end === "number" && end > 0) {
        intervalRef.current = window.setInterval(() => {
          const p = playerRef.current;
          if (!p || typeof p.getCurrentTime !== "function") return;
          try {
            const t = p.getCurrentTime();
            if (t >= end && !endedRef.current) {
              p.pauseVideo();
              endedRef.current = true;
              onEnd?.();
            }
          } catch {}
        }, 250);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      try {
        playerRef.current?.destroy?.();
      } catch {}
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, start, end, autoplay]);

  return (
    <div className={className ?? "relative w-full aspect-video rounded-lg overflow-hidden bg-black"}>
      <div ref={containerRef} className="absolute inset-0 [&>*]:w-full [&>*]:h-full" />
    </div>
  );
};

export const parseYouTubeId = (url: string): string | null => {
  if (!url) return null;
  const trimmed = url.trim();
  // Already an ID (11 chars)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return u.pathname.slice(1).split("/")[0] || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);
      // /shorts/<id>, /embed/<id>, /v/<id>, /live/<id>
      if (parts.length >= 2 && ["shorts", "embed", "v", "live"].includes(parts[0])) {
        return parts[1];
      }
    }
  } catch {}
  return null;
};

export const parseTimeInput = (value: string): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  // MM:SS or HH:MM:SS
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
};

export const formatSeconds = (s: number | null | undefined): string => {
  if (s == null || isNaN(s)) return "";
  const total = Math.max(0, Math.floor(s));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
};
