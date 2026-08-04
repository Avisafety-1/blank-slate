import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { downloadAttachment, type MessageAttachment } from "./hooks/useMessageAttachments";

interface AttachmentLightboxProps {
  images: MessageAttachment[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * In-app image viewer for message attachments. Opens above the message dialog
 * (never a new tab) so the thread stays open behind it.
 */
export const AttachmentLightbox = ({ images, index, onIndexChange, onClose }: AttachmentLightboxProps) => {
  const { t } = useTranslation();
  const touchStartX = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // Stop Radix (Sheet/Dialog) from treating clicks inside the lightbox as
  // "outside" interactions, which would close the underlying message thread.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    const events = ["pointerdown", "mousedown", "touchstart", "click", "focusin"];
    events.forEach((ev) => el.addEventListener(ev, stop));
    return () => events.forEach((ev) => el.removeEventListener(ev, stop));
  }, [index]);

  useEffect(() => setMounted(true), []);

  const open = index !== null && index >= 0 && index < images.length;
  const current = open ? images[index] : null;

  const goPrev = useCallback(() => {
    if (index === null || images.length < 2) return;
    onIndexChange((index - 1 + images.length) % images.length);
  }, [index, images.length, onIndexChange]);

  const goNext = useCallback(() => {
    if (index === null || images.length < 2) return;
    onIndexChange((index + 1) % images.length);
  }, [index, images.length, onIndexChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowLeft") {
        goPrev();
      } else if (e.key === "ArrowRight") {
        goNext();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, goPrev, goNext]);

  if (!mounted || !open || !current) return null;

  const handleDownload = () => {
    downloadAttachment(current.storage_path, current.file_name).catch(() =>
      toast.error(t("inbox.attachments.downloadFailed", "Kunne ikke åpne vedlegget")),
    );
  };

  return createPortal(
    <div
      ref={rootRef}
      className="fixed inset-0 z-[2000] flex flex-col bg-background/95 backdrop-blur-sm"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start === null) return;
        const delta = (e.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(delta) > 50) {
          if (delta > 0) goPrev();
          else goNext();
        }
      }}
    >
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-background/80"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate text-sm font-medium">{current.file_name}</span>
        <div className="flex items-center gap-1 shrink-0">
          {images.length > 1 && (
            <span className="text-xs text-muted-foreground mr-1">
              {(index ?? 0) + 1} / {images.length}
            </span>
          )}
          <button
            type="button"
            onClick={handleDownload}
            aria-label={t("inbox.attachments.download", "Last ned")}
            className="p-2 rounded-md hover:bg-muted"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("inbox.attachments.closePreview", "Lukk forhåndsvisning")}
            className="p-2 rounded-md hover:bg-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden p-4">
        {images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            aria-label={t("inbox.attachments.previousImage", "Forrige bilde")}
            className="absolute left-2 z-10 p-2 rounded-full border border-border bg-background/80 hover:bg-muted"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {current.url ? (
          <img
            src={current.url}
            alt={current.file_name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full object-contain rounded-md"
          />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            className="text-sm underline"
          >
            {t("inbox.attachments.download", "Last ned")}
          </button>
        )}

        {images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            aria-label={t("inbox.attachments.nextImage", "Neste bilde")}
            className="absolute right-2 z-10 p-2 rounded-full border border-border bg-background/80 hover:bg-muted"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
};
