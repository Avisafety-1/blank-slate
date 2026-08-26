import { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { X, Undo2, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

interface SignatureDrawerDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (url: string) => void;
  /** When false, the drawn signature is not written to the user's profile */
  persistToProfile?: boolean;
}

export function SignatureDrawerDialog({ open, onClose, onSave, persistToProfile = true }: SignatureDrawerDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // Logical (CSS) canvas size — on mobile this is rotated (w=container height, h=container width)
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const saveToHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory(prev => [...prev, imageData]);
  }, []);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // On mobile we rotate the canvas -90deg, so swap dimensions so it fills
    // the available area after rotation.
    const cssW = isMobile ? rect.height : rect.width;
    const cssH = isMobile ? rect.width : rect.height;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    setCanvasSize({ w: cssW, h: cssH });
    setHistory([]);
  }, [isMobile]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(initCanvas, 50);
    const onResize = () => initCanvas();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [open, initCanvas]);

  const getCoordinates = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    if (isMobile) {
      // Canvas is visually rotated -90deg (CSS = counter-clockwise).
      // After CCW rotation: canvas (0,0) sits at screen (rect.left, rect.bottom).
      //   canvas_x grows upward on screen  → canvas_x = rect.bottom - clientY
      //   canvas_y grows rightward on screen → canvas_y = clientX - rect.left
      return {
        x: rect.bottom - clientY,
        y: clientX - rect.left,
      };
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    saveToHistory();
    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const newHistory = [...history];
    const lastState = newHistory.pop();
    if (lastState) {
      // putImageData uses device pixels — reset transform first, then restore dpr scale.
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.putImageData(lastState, 0, 0);
      ctx.scale(dpr, dpr);
    } else {
      initCanvas();
    }
    setHistory(newHistory);
  };

  const handleClear = () => {
    initCanvas();
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !user) return;

    setIsSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );

      if (!blob) {
        throw new Error("Kunne ikke konvertere signatur til bilde");
      }

      const fileName = `${user.id}/signature_${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("signatures")
        .upload(fileName, blob, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from("signatures")
        .getPublicUrl(fileName);

      if (persistToProfile) {
        const { error: updateError } = await (supabase as any)
          .from("profiles")
          .update({ signature_url: urlData.publicUrl })
          .eq("id", user.id);

        if (updateError) {
          throw updateError;
        }
      }

      toast.success("Signatur lagret");
      onSave(urlData.publicUrl);
      onClose();
    } catch (error: any) {
      console.error("Error saving signature:", error);
      toast.error("Kunne ikke lagre signatur: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 z-[2000] bg-background flex flex-col"
      style={{
        height: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        overscrollBehavior: "contain",
        pointerEvents: "auto",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-background p-4 flex-shrink-0">
        <h2 className="font-semibold text-lg">Tegn signatur</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {isMobile && (
        <div className="px-4 pt-1 pb-1 text-center text-xs text-muted-foreground flex-shrink-0">
          Tegn signaturen din sidelengs
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 p-2 sm:p-4 bg-muted relative overflow-hidden"
      >
        {isMobile ? (
          <div
            className="absolute"
            style={{
              width: canvasSize.w,
              height: canvasSize.h,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%) rotate(-90deg)",
              transformOrigin: "center center",
            }}
          >
            <canvas
              ref={canvasRef}
              className="rounded-lg border-2 border-dashed border-muted-foreground/30 touch-none cursor-crosshair bg-white"
              style={{ width: "100%", height: "100%", display: "block" }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full h-full rounded-lg border-2 border-dashed border-muted-foreground/30 touch-none cursor-crosshair bg-white"
            style={{ width: canvasSize.w || "100%", height: canvasSize.h || "100%" }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border bg-background p-3 sm:p-4 flex-shrink-0">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Tøm</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={history.length === 0}
          >
            <Undo2 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Angre</span>
          </Button>
        </div>
        <Button onClick={handleSave} disabled={isSaving} size="sm">
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Lagrer..." : "Lagre"}
        </Button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
