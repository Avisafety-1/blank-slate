// Shared JSON repair for AI responses (main assessment and SORA reassessment).
export const parseAiJson = (raw: string, finishReason?: string | null): any => {
  const content = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const candidate = content.substring(start, end + 1)
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/[\x00-\x1F\x7F]/g, '');
      try {
        return JSON.parse(candidate);
      } catch {
        // fall through
      }
    }
    console.error('Failed to parse AI response (finish_reason=' + finishReason + '):', content.slice(0, 2000));
    throw new Error('Invalid AI response format' + (finishReason === 'length' ? ' (truncated)' : ''));
  }
};
