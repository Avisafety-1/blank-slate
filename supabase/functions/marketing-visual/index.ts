import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AVISAFE_BRAND_RULES = `You are generating a marketing visual for AviSafe, a professional drone operations and aviation safety SaaS platform.

VISUAL BRAND RULES:
- Use a neutral aviation-style color palette: navy (#1a2332), slate grays, white, with subtle blue accents
- Clean, minimalistic SaaS design — think Figma, Linear, or Notion marketing materials
- Professional B2B aesthetic appropriate for aviation/drone industry
- IMPORTANT: You are provided with the official AviSafe logo as a reference image. You MUST reproduce it exactly as shown — do NOT invent, redesign, or approximate the logo. Place the exact AviSafe logo (as seen in the reference image) in the bottom-right or top-left corner of the visual. The logo should be small, clean, and clearly legible.
- Modern, sharp typography — no playful or rounded fonts

STRICTLY AVOID:
- Cartoon or illustrated drone graphics
- Bright influencer-style marketing aesthetics
- Unrealistic or toy-like drones
- Flashy gradients, neon colors, or party aesthetics
- Stock photo clichés (handshakes, generic offices)
- Busy or cluttered layouts
- Making up your own version of the AviSafe logo — always use the provided reference exactly`;

function buildSafetyGraphicPrompt(params: { title: string; subtitle?: string; template: string; format: string }) {
  const aspect = params.format === "1200x628" ? "landscape 16:9" : "square 1:1";
  return `${AVISAFE_BRAND_RULES}

Generate a clean, professional safety infographic for a LinkedIn post (${aspect} aspect ratio).

Topic: ${params.title}
${params.subtitle ? `Subtitle: ${params.subtitle}` : ""}
Template style: ${params.template}

The visual should:
- Show the safety concept clearly with clean icons or diagrams
- Use the AviSafe navy/slate color palette
- Include the title text "${params.title}" prominently
${params.subtitle ? `- Include subtitle "${params.subtitle}" in smaller text` : ""}
- Have "AviSafe" branding in a corner
- Look like it was designed by a professional SaaS marketing team
- Be suitable for a LinkedIn post by a serious aviation software company`;
}

function buildProductMockupPrompt(params: { title: string; subtitle?: string; template: string; format: string }) {
  const aspect = params.format === "1200x628" ? "landscape 16:9" : "square 1:1";
  return `${AVISAFE_BRAND_RULES}

Generate a professional product mockup image for a LinkedIn post (${aspect} aspect ratio).

Subject: ${params.title}
${params.subtitle ? `Context: ${params.subtitle}` : ""}
Template style: ${params.template}

The visual should show:
- A realistic device (laptop, tablet, or phone) displaying what looks like a professional aviation/drone operations dashboard
- The dashboard should have map elements, data panels, and clean UI components typical of a SaaS platform
- Clean background — either a subtle gradient, a minimal office/field setting, or solid
- Title text "${params.title}" overlaid in clean typography
${params.subtitle ? `- Subtitle "${params.subtitle}" below the title` : ""}
- "AviSafe" branding visible
- Professional, aspirational, but realistic — like a Stripe or Linear product page`;
}

function buildScreenshotLayoutPrompt(params: { title: string; subtitle?: string; template: string; format: string; screenshotDescription?: string }) {
  const aspect = params.format === "1200x628" ? "landscape 16:9" : "square 1:1";
  return `${AVISAFE_BRAND_RULES}

Generate a professional marketing layout image for a LinkedIn post (${aspect} aspect ratio).

This should look like a polished SaaS feature highlight:
- Title: "${params.title}"
${params.subtitle ? `- Subtitle: "${params.subtitle}"` : ""}
- Template style: ${params.template}
${params.screenshotDescription ? `- The main visual area should depict: ${params.screenshotDescription}` : "- The main visual area should show a clean aviation/drone operations dashboard UI"}

Layout:
- Clean card-style or floating device layout
- Title text prominent at top or left
- Main visual (dashboard/map UI) as the hero element
- "AviSafe" branding in corner
- Subtle background — navy gradient or clean white
- Professional spacing and alignment`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    // Create user-scoped client for auth check
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { type, title, subtitle, template, format, screenshotUrl, companyId, draftId } = body;

    // Build prompt based on type
    let prompt: string;
    const params = { title: title || "AviSafe", subtitle, template: template || "feature_highlight", format: format || "1200x1200" };

    switch (type) {
      case "safety_graphic":
        prompt = buildSafetyGraphicPrompt(params);
        break;
      case "product_mockup":
        prompt = buildProductMockupPrompt(params);
        break;
      case "screenshot_layout":
        prompt = buildScreenshotLayoutPrompt({ ...params, screenshotDescription: subtitle });
        break;
      default:
        throw new Error(`Unknown visual type: ${type}`);
    }

    // Call Gemini image generation
    const messages: any[] = [{ role: "user", content: prompt }];

    // If screenshot URL provided, include it as image input for editing
    if (screenshotUrl && type === "screenshot_layout") {
      messages[0] = {
        role: "user",
        content: [
          { type: "text", text: prompt + "\n\nUse the provided screenshot as the main UI visual in the layout. Frame it professionally within the marketing layout." },
          { type: "image_url", image_url: { url: screenshotUrl } },
        ],
      };
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages,
        modalities: ["image", "text"],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Prøv igjen om litt." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Ingen flere AI-kreditter. Fyll på i Lovable-innstillingene." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error(`AI generation failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      throw new Error("No image returned from AI");
    }

    // Extract base64 data and upload to storage
    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) throw new Error("Invalid image data format");

    const imageExt = base64Match[1];
    const base64Content = base64Match[2];
    const imageBytes = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const fileName = `${companyId}/${crypto.randomUUID()}.${imageExt}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("marketing-media")
      .upload(fileName, imageBytes, { contentType: `image/${imageExt}`, upsert: false });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("marketing-media")
      .getPublicUrl(fileName);

    const fileUrl = publicUrlData.publicUrl;

    // Save to marketing_media table
    const { data: mediaRow, error: insertError } = await supabaseAdmin
      .from("marketing_media")
      .insert({
        company_id: companyId,
        draft_id: draftId || null,
        created_by: user.id,
        media_type: type === "safety_graphic" ? "graphic" : "image",
        layout_template: template || null,
        source_type: screenshotUrl ? "screenshot" : "ai",
        file_url: fileUrl,
        title: title || null,
        subtitle: subtitle || null,
        image_format: format || "1200x1200",
        metadata: { type, template, prompt: prompt.substring(0, 200) },
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error(`Failed to save media: ${insertError.message}`);
    }

    return new Response(JSON.stringify({ media: mediaRow }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("marketing-visual error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
