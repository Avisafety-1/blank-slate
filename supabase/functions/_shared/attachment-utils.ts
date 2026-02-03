import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per attachment
const MAX_TOTAL_ATTACHMENTS_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB total

export interface EmailAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
  encoding: "binary";
}

export interface AttachmentResult {
  attachments: EmailAttachment[];
  skippedAttachments: string[];
  totalSizeBytes: number;
}

/**
 * Fetches attachments for an email template with size validation
 */
export async function getTemplateAttachments(
  templateId: string
): Promise<AttachmentResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const result: AttachmentResult = {
    attachments: [],
    skippedAttachments: [],
    totalSizeBytes: 0
  };

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
      return result;
    }

    if (!attachmentData || attachmentData.length === 0) {
      console.log(`No attachments found for template ${templateId}`);
      return result;
    }

    console.log(`Found ${attachmentData.length} attachment(s) for template ${templateId}`);

    // Download each file and create attachment with size validation
    for (const att of attachmentData) {
      const doc = att.documents as any;
      if (!doc?.fil_url) continue;

      const fileName = doc.fil_navn || doc.tittel || 'vedlegg';

      try {
        // Download file from storage with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout per file

        const { data: fileData, error: downloadError } = await supabase.storage
          .from('documents')
          .download(doc.fil_url);

        clearTimeout(timeoutId);

        if (downloadError) {
          console.error(`Error downloading file ${doc.fil_url}:`, downloadError);
          result.skippedAttachments.push(`${fileName} (nedlastingsfeil)`);
          continue;
        }

        if (fileData) {
          const arrayBuffer = await fileData.arrayBuffer();
          const fileSizeBytes = arrayBuffer.byteLength;
          const fileSizeMB = (fileSizeBytes / 1024 / 1024).toFixed(2);

          console.log(`Attachment ${fileName}: ${fileSizeMB} MB`);

          // Check individual file size
          if (fileSizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
            console.warn(`Skipping attachment ${fileName} - too large (${fileSizeMB} MB, max ${MAX_ATTACHMENT_SIZE_BYTES / 1024 / 1024} MB)`);
            result.skippedAttachments.push(`${fileName} (for stor: ${fileSizeMB} MB)`);
            continue;
          }

          // Check if adding this would exceed total limit
          if (result.totalSizeBytes + fileSizeBytes > MAX_TOTAL_ATTACHMENTS_SIZE_BYTES) {
            console.warn(`Skipping attachment ${fileName} - would exceed total size limit`);
            result.skippedAttachments.push(`${fileName} (totalgrense overskredet)`);
            continue;
          }

          result.attachments.push({
            filename: fileName,
            content: new Uint8Array(arrayBuffer),
            contentType: fileData.type || 'application/octet-stream',
            encoding: "binary" as const
          });
          result.totalSizeBytes += fileSizeBytes;
          console.log(`Added attachment: ${fileName} (${fileSizeMB} MB)`);
        }
      } catch (downloadErr: any) {
        if (downloadErr.name === 'AbortError') {
          console.error(`Timeout downloading attachment ${fileName}`);
          result.skippedAttachments.push(`${fileName} (timeout)`);
        } else {
          console.error(`Failed to download attachment ${doc.fil_url}:`, downloadErr);
          result.skippedAttachments.push(`${fileName} (feil)`);
        }
      }
    }

    const totalMB = (result.totalSizeBytes / 1024 / 1024).toFixed(2);
    console.log(`Fetched ${result.attachments.length} attachments (${totalMB} MB total) for template ${templateId}`);
    if (result.skippedAttachments.length > 0) {
      console.warn(`Skipped ${result.skippedAttachments.length} attachments: ${result.skippedAttachments.join(', ')}`);
    }

    return result;
  } catch (error) {
    console.error('Error in getTemplateAttachments:', error);
    return result;
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
