import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, VideoOff } from "lucide-react";

export type WhepStatus = "connecting" | "playing" | "error" | "gone";

interface WhepPlayerProps {
  /** Henter en fersk WHEP-URL. Kalles på nytt ved hver gjenoppkobling. */
  getWhepUrl: () => Promise<string | null>;
  onStatusChange?: (status: WhepStatus) => void;
  className?: string;
}

const MAX_BACKOFF_MS = 15000;

/**
 * Minimal WHEP-klient (WebRTC-HTTP Egress Protocol) mot MediaMTX.
 * Kobler til på nytt med eksponentiell backoff når strømmen faller ut.
 */
export function WhepPlayer({ getWhepUrl, onStatusChange, className }: WhepPlayerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const stoppedRef = useRef(false);
  const [status, setStatus] = useState<WhepStatus>("connecting");

  const updateStatus = useCallback(
    (next: WhepStatus) => {
      setStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const connect = useCallback(async () => {
    if (stoppedRef.current) return;
    cleanup();
    updateStatus("connecting");

    let url: string | null = null;
    try {
      url = await getWhepUrl();
    } catch {
      url = null;
    }
    if (stoppedRef.current) return;
    if (!url) {
      updateStatus("gone");
      scheduleRetry();
      return;
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    pc.ontrack = (event) => {
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        void videoRef.current.play().catch(() => undefined);
      }
    };

    pc.onconnectionstatechange = () => {
      if (stoppedRef.current) return;
      if (pc.connectionState === "connected") {
        attemptRef.current = 0;
        updateStatus("playing");
      } else if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected" ||
        pc.connectionState === "closed"
      ) {
        updateStatus("error");
        scheduleRetry();
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp ?? "",
      });
      if (!response.ok) {
        updateStatus(response.status === 404 ? "gone" : "error");
        scheduleRetry();
        return;
      }
      const answer = await response.text();
      if (stoppedRef.current) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch {
      updateStatus("error");
      scheduleRetry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanup, getWhepUrl, updateStatus]);

  const scheduleRetry = useCallback(() => {
    if (stoppedRef.current) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    attemptRef.current += 1;
    const delay = Math.min(1000 * 2 ** (attemptRef.current - 1), MAX_BACKOFF_MS);
    timerRef.current = window.setTimeout(() => {
      void connect();
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]);

  useEffect(() => {
    stoppedRef.current = false;
    void connect();
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      cleanup();
    };
  }, [connect, cleanup]);

  return (
    <div className={`relative w-full overflow-hidden rounded-lg bg-black ${className ?? ""}`}>
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        autoPlay
        playsInline
        muted
        controls={false}
      />
      {status !== "playing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-sm text-primary-foreground">
          {status === "gone" ? (
            <>
              <VideoOff className="h-6 w-6" />
              <span>{t("liveVideo.noStream")}</span>
            </>
          ) : (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>
                {status === "error" ? t("liveVideo.reconnecting") : t("liveVideo.connecting")}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default WhepPlayer;
