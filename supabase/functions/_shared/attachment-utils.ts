import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface EmailAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
  encoding: "binary";
}

/**
 * Fetches attachments for an email template
 */
export async function getTemplateAttachments(
  templateId: string
): Promise<EmailAttachment[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const attachments: EmailAttachment[] = [];

  try {
    // Get template attachments with document info
    const { data: attachmentData, error: attachmentError } = await supabase
      .from('email_template_attachments')
      .select(`
        document_id,
        documents:document_id (
          id,
          tittel,
          fil_url,
          fil_navn
        )
      `)
      .eq('template_id', templateId);

    if (attachmentError) {
      console.error('Error fetching template attachments:', attachmentError);
      return attachments;
    }

    if (!attachmentData || attachmentData.length === 0) {
      return attachments;
    }

    // Download each file and create attachment
    for (const att of attachmentData) {
      const doc = att.documents as any;
      if (!doc?.fil_url) continue;

      try {
        // Download file from storage
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('documents')
          .download(doc.fil_url);

        if (downloadError) {
          console.error(`Error downloading file ${doc.fil_url}:`, downloadError);
          continue;
        }

        if (fileData) {
          const arrayBuffer = await fileData.arrayBuffer();
          attachments.push({
            filename: doc.fil_navn || doc.tittel || 'vedlegg',
            content: new Uint8Array(arrayBuffer),
            contentType: fileData.type || 'application/octet-stream',
            encoding: "binary" as const
          });
          console.log(`Added attachment: ${doc.fil_navn || doc.tittel}`);
        }
      } catch (downloadErr) {
        console.error(`Failed to download attachment ${doc.fil_url}:`, downloadErr);
      }
    }

    console.log(`Fetched ${attachments.length} attachments for template ${templateId}`);
    return attachments;
  } catch (error) {
    console.error('Error in getTemplateAttachments:', error);
    return attachments;
  }
}

/**
 * Gets template ID by company and type
 */
export async function getTemplateId(
  companyId: string,
  templateType: string
): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('email_templates')
    .select('id')
    .eq('company_id', companyId)
    .eq('template_type', templateType)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.id;
}
