import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Save, Undo2, PenTool } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface SignaturePadProps {
  onSave?: (signatureUrl: string) => void;
  existingSignatureUrl?: string | null;
  className?: string;
}

export const SignaturePad = ({ onSave, existingSignatureUrl, className }: SignaturePadProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [existingUrl, setExistingUrl] = useState<string | null>(existingSignatureUrl || null);
  const historyRef = useRef<ImageData[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Set drawing styles
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Fill with white background
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  useEffect(() => {
    setExistingUrl(existingSignatureUrl || null);
  }, [existingSignatureUrl]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }

    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current.push(imageData);
    // Limit history to last 20 states
    if (historyRef.current.length > 20) {
      historyRef.current.shift();
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    saveState();
    setIsDrawing(true);
    setHasSignature(true);
    setExistingUrl(null);

    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();

    const coords = getCoordinates(e);
    if (!coords) return;

    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.closePath();
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasSignature(false);
    setExistingUrl(null);
    historyRef.current = [];
  };

  const undo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (historyRef.current.length > 0) {
      const previousState = historyRef.current.pop();
      if (previousState) {
        ctx.putImageData(previousState, 0, 0);
      }
    } else {
      // If no history, clear the canvas
      clearCanvas();
    }
  };

  const handleSave = async () => {
    if (!user || !canvasRef.current) return;

    setIsSaving(true);
    try {
      const canvas = canvasRef.current;
      
      // Convert canvas to blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });

      if (!blob) throw new Error("Failed to create image");

      const fileName = `${user.id}/signature_${Date.now()}.png`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("signatures")
        .upload(fileName, blob, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("signatures")
        .getPublicUrl(fileName);

      const signatureUrl = urlData.publicUrl;

      // Update profile with signature URL
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ signature_url: signatureUrl } as any)
        .eq("id", user.id);

      if (updateError) throw updateError;

      setExistingUrl(signatureUrl);
      onSave?.(signatureUrl);
      toast.success(t("profile.signatureSaved") || "Signatur lagret");
    } catch (error) {
      console.error("Error saving signature:", error);
      toast.error(t("profile.signatureSaveError") || "Kunne ikke lagre signatur");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={className}>
      <div className="space-y-3">
        {existingUrl ? (
          <div className="space-y-2">
            <div className="border rounded-lg p-4 bg-white">
              <img
                src={existingUrl}
                alt="Signatur"
                className="max-h-24 mx-auto"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={clearCanvas}
              className="w-full"
            >
              <PenTool className="h-4 w-4 mr-2" />
              {t("profile.drawNewSignature") || "Tegn ny signatur"}
            </Button>
          </div>
        ) : (
          <>
            <div className="border rounded-lg bg-white overflow-hidden touch-none">
              <canvas
                ref={canvasRef}
                className="w-full h-32 cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={undo}
                disabled={!hasSignature}
                className="flex-1"
              >
                <Undo2 className="h-4 w-4 mr-1" />
                {t("actions.undo") || "Angre"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearCanvas}
                disabled={!hasSignature}
                className="flex-1"
              >
                <Eraser className="h-4 w-4 mr-1" />
                {t("actions.clear") || "Fjern"}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasSignature || isSaving}
                className="flex-1"
              >
                <Save className="h-4 w-4 mr-1" />
                {isSaving ? (t("common.saving") || "Lagrer...") : (t("actions.save") || "Lagre")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
