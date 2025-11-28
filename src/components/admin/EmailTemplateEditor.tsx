import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Save, Eye, RefreshCw, Code, Eye as EyeIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

interface EmailTemplate {
  id: string;
  company_id: string;
  template_type: string;
  subject: string;
  content: string;
  created_at: string;
  updated_at: string;
}

const templateTypes = [
  {
    value: "customer_welcome",
    label: "Kunde velkomst",
    variables: ["{{customer_name}}", "{{company_name}}"],
  },
  {
    value: "user_approved",
    label: "Bruker godkjent",
    variables: ["{{user_name}}", "{{company_name}}"],
  },
  {
    value: "mission_confirmation",
    label: "Oppdragsbekreftelse",
    variables: ["{{mission_title}}", "{{mission_location}}", "{{mission_date}}", "{{mission_status}}", "{{company_name}}"],
  },
  {
    value: "document_reminder",
    label: "Dokumentpåminnelse",
    variables: ["{{document_title}}", "{{expiry_date}}", "{{company_name}}"],
  },
];

export const EmailTemplateEditor = () => {
  const { companyId } = useAuth();
  const isMobile = useIsMobile();
  const [selectedTemplateType, setSelectedTemplateType] = useState("customer_welcome");
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"visual" | "html">("visual");
  const quillRef = useRef<ReactQuill>(null);

  // Handle image upload to Supabase Storage
  const handleImageUpload = async () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        // Upload image to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        const filePath = `${companyId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('email-images')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('email-images')
          .getPublicUrl(filePath);

        // Read image dimensions
        const img = new Image();
        img.onload = () => {
          // Calculate scaled dimensions (max 560px width for email compatibility)
          const maxWidth = 560;
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          // Insert image with inline styles for email compatibility
          const quill = quillRef.current?.getEditor();
          if (quill) {
            const range = quill.getSelection(true);
            const imageHtml = `<img src="${publicUrl}" alt="Bilde" width="${width}" height="${height}" style="max-width: 100%; height: auto; display: block;" />`;
            quill.clipboard.dangerouslyPasteHTML(range.index, imageHtml);
            quill.setSelection(range.index + 1, 0);
          }

          toast.success("Bilde lastet opp");
        };

        img.onerror = () => {
          toast.error("Kunne ikke lese bildedimensjoner");
        };

        img.src = publicUrl;
      } catch (error) {
        console.error('Error uploading image:', error);
        toast.error("Kunne ikke laste opp bilde");
      }
    };
  };

  // Quill modules configuration
  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'align': [] }],
        ['link', 'image'],
        ['clean']
      ],
      handlers: {
        image: handleImageUpload
      }
    }
  }), [companyId]);

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'color', 'background',
    'list', 'bullet',
    'align',
    'link', 'image'
  ];

  useEffect(() => {
    fetchTemplate();
  }, [companyId, selectedTemplateType]);

  const fetchTemplate = async () => {
    if (!companyId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("company_id", companyId)
        .eq("template_type", selectedTemplateType)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setTemplate(data);
        setSubject(data.subject);
        setContent(data.content);
      } else {
        // No template found, reset to defaults
        setTemplate(null);
        setSubject("");
        setContent("");
      }
    } catch (error: any) {
      console.error("Error fetching template:", error);
      toast.error("Kunne ikke laste mal");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!companyId) {
      toast.error("Du må være logget inn");
      return;
    }

    setSaving(true);
    try {
      if (template) {
        // Update existing template
        const { error } = await supabase
          .from("email_templates")
          .update({
            subject,
            content,
          })
          .eq("id", template.id);

        if (error) throw error;
      } else {
        // Create new template
        const { error } = await supabase
          .from("email_templates")
          .insert({
            company_id: companyId,
            template_type: selectedTemplateType,
            subject,
            content,
          });

        if (error) throw error;
      }

      toast.success("Mal lagret");
      fetchTemplate();
    } catch (error: any) {
      console.error("Error saving template:", error);
      toast.error("Kunne ikke lagre mal: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (template) {
      setSubject(template.subject);
      setContent(template.content);
      toast.info("Endringer tilbakestilt");
    }
  };

  const getPreviewContent = () => {
    const currentTemplateType = templateTypes.find(t => t.value === selectedTemplateType);
    let previewContent = content;

    // Replace variables with sample data
    if (currentTemplateType) {
      previewContent = previewContent
        .replace(/\{\{customer_name\}\}/g, "Ola Nordmann")
        .replace(/\{\{user_name\}\}/g, "Kari Nordmann")
        .replace(/\{\{company_name\}\}/g, "Ditt Selskap")
        .replace(/\{\{mission_title\}\}/g, "Drone inspeksjon av vindmøller")
        .replace(/\{\{mission_location\}\}/g, "Oslo, Norge")
        .replace(/\{\{mission_date\}\}/g, "15. januar 2025 kl. 10:00")
        .replace(/\{\{mission_status\}\}/g, "Planlagt")
        .replace(/\{\{document_title\}\}/g, "Droneoperatørsertifikat")
        .replace(/\{\{expiry_date\}\}/g, "31. desember 2025");
    }

    return previewContent;
  };

  const wrapContentInEmailTemplate = (htmlContent: string) => {
    // Wrap the Quill editor content in a proper email template structure
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <style>
      body { 
        font-family: Arial, sans-serif; 
        line-height: 1.6; 
        color: #333; 
        margin: 0;
        padding: 0;
        background-color: #f4f4f4;
      }
      .container { 
        max-width: 600px; 
        margin: 20px auto; 
        background: white;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .content { 
        padding: 30px; 
      }
      .footer { 
        background: #f9f9f9;
        padding: 20px 30px;
        text-align: center; 
        font-size: 12px; 
        color: #888;
        border-top: 1px solid #eee;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="content">
        ${htmlContent}
      </div>
      <div class="footer">
        <p>Med vennlig hilsen,<br>{{company_name}}</p>
        <p style="font-size: 11px; color: #aaa;">Dette er en automatisk generert e-post. Vennligst ikke svar på denne e-posten.</p>
      </div>
    </div>
  </body>
</html>`;
  };

  const handleVisualEditorChange = (value: string) => {
    // When using visual editor, wrap content in email template
    const wrappedContent = wrapContentInEmailTemplate(value);
    setContent(wrappedContent);
  };

  const getVisualEditorContent = () => {
    // Extract content from between <div class="content"> tags for visual editor
    const match = content.match(/<div class="content">([\s\S]*?)<\/div>/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return content;
  };

  const currentTemplateType = templateTypes.find(t => t.value === selectedTemplateType);

  if (loading) {
    return (
      <GlassCard className="p-3 sm:p-6">
        <div className="flex items-center justify-center py-6 sm:py-8">
          <p className="text-sm sm:text-base text-muted-foreground">Laster mal...</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <>
      <GlassCard className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <h2 className="text-base sm:text-xl font-semibold">E-postmaler</h2>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button 
              variant="outline" 
              onClick={handleReset} 
              disabled={!template}
              size={isMobile ? "sm" : "default"}
              className={isMobile ? 'flex-1' : ''}
            >
              <RefreshCw className={`${isMobile ? 'h-3 w-3 mr-1' : 'h-4 w-4 mr-2'}`} />
              {isMobile ? "Tilbake" : "Tilbakestill"}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setPreviewOpen(true)}
              size={isMobile ? "sm" : "default"}
              className={isMobile ? 'flex-1' : ''}
            >
              <Eye className={`${isMobile ? 'h-3 w-3 mr-1' : 'h-4 w-4 mr-2'}`} />
              {isMobile ? "Vis" : "Forhåndsvis"}
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving}
              size={isMobile ? "sm" : "default"}
              className={isMobile ? 'flex-1' : ''}
            >
              <Save className={`${isMobile ? 'h-3 w-3 mr-1' : 'h-4 w-4 mr-2'}`} />
              {saving ? "Lagrer..." : "Lagre"}
            </Button>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <Label htmlFor="template-type" className="text-xs sm:text-sm">Maltype</Label>
            <Select value={selectedTemplateType} onValueChange={setSelectedTemplateType}>
              <SelectTrigger className={isMobile ? 'h-9 text-sm' : ''}>
                <SelectValue placeholder="Velg maltype" />
              </SelectTrigger>
              <SelectContent>
                {templateTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value} className="text-xs sm:text-sm">
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
            <h3 className="font-semibold text-xs sm:text-sm mb-2">Tilgjengelige variabler:</h3>
            <div className="space-y-1 text-xs sm:text-sm text-muted-foreground">
              {currentTemplateType?.variables.map((variable) => (
                <p key={variable}>
                  <code className="bg-white dark:bg-gray-800 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs">{variable}</code>
                </p>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject" className="text-xs sm:text-sm">E-post emne</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Skriv inn e-post emne..."
              className={isMobile ? 'h-9 text-sm' : ''}
            />
          </div>

          <Tabs value={editorMode} onValueChange={(v) => setEditorMode(v as "visual" | "html")}>
            <TabsList className={`grid w-full grid-cols-2 ${isMobile ? 'h-8' : 'max-w-md'}`}>
              <TabsTrigger value="visual" className={`flex items-center gap-1 sm:gap-2 ${isMobile ? 'text-xs' : ''}`}>
                <EyeIcon className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'}`} />
                {isMobile ? "Visuell" : "Visuell Editor"}
              </TabsTrigger>
              <TabsTrigger value="html" className={`flex items-center gap-1 sm:gap-2 ${isMobile ? 'text-xs' : ''}`}>
                <Code className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'}`} />
                {isMobile ? "HTML" : "HTML Kode"}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="visual" className="mt-3 sm:mt-4">
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">E-post innhold (Visuell editor)</Label>
                <div className="border rounded-lg overflow-hidden bg-white">
                  <ReactQuill
                    ref={quillRef}
                    theme="snow"
                    value={getVisualEditorContent()}
                    onChange={handleVisualEditorChange}
                    modules={modules}
                    formats={formats}
                    placeholder="Skriv inn e-postinnholdet her..."
                    style={{ minHeight: isMobile ? "300px" : "400px" }}
                  />
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Bruk verktøylinjen ovenfor for å formatere teksten. Du kan bruke variabler fra listen ovenfor i teksten.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="html" className="mt-3 sm:mt-4">
              <div className="space-y-2">
                <Label htmlFor="content" className="text-xs sm:text-sm">E-post innhold (HTML)</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Skriv inn HTML-innhold..."
                  rows={isMobile ? 15 : 20}
                  className={`font-mono ${isMobile ? 'text-xs' : 'text-sm'}`}
                />
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Du kan bruke HTML og inline CSS for å style e-posten.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </GlassCard>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className={`${isMobile ? 'max-w-[95vw] max-h-[85vh]' : 'max-w-3xl max-h-[90vh]'} overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Forhåndsvisning av e-post</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4">
            <div>
              <Label className="text-xs sm:text-sm text-muted-foreground">Maltype:</Label>
              <p className="font-semibold text-sm sm:text-base">{currentTemplateType?.label}</p>
            </div>
            <div>
              <Label className="text-xs sm:text-sm text-muted-foreground">Emne:</Label>
              <p className="font-semibold text-sm sm:text-base">{subject || "Ingen emne"}</p>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <div 
                dangerouslySetInnerHTML={{ __html: getPreviewContent() }}
                className={`bg-white ${isMobile ? 'text-sm' : ''}`}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
