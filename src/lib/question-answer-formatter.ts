/**
 * Shared formatter for client-defined custom-question answers.
 *
 * Used across Ring Builder, Grillz Builder and Custom Enquiry to produce a
 * consistent display string for emails, lead notifications, and the thank-you
 * page summary card. Returns `null` when there is nothing to display so callers
 * can skip empty entries.
 */
export function formatQuestionAnswer(
  questionType: string | undefined,
  answer: any,
  text?: string | null,
  fileUrl?: string | null,
): string | null {
  // File uploads — prefer explicit fileUrl, fall back to answer if it looks like a URL/array.
  if (questionType === 'file') {
    if (fileUrl) return fileUrl;
    if (Array.isArray(answer)) {
      const joined = answer.filter(Boolean).join(', ');
      return joined || null;
    }
    if (typeof answer === 'string' && answer.trim()) return answer.trim();
    return null;
  }

  // Yes / No (accept boolean OR "Yes"/"No" string from wizard inputs)
  if (questionType === 'yes_no' || typeof answer === 'boolean') {
    const isYes = answer === true || (typeof answer === 'string' && answer.toLowerCase() === 'yes');
    const isNo = answer === false || (typeof answer === 'string' && answer.toLowerCase() === 'no');
    if (isYes) return text && text.trim() ? `Yes — ${text.trim()}` : 'Yes';
    if (isNo) return 'No';
    return null;
  }

  // Arrays (multi-select)
  if (Array.isArray(answer)) {
    const joined = answer.filter(v => v !== null && v !== undefined && v !== '').map(String).join(', ');
    return joined || null;
  }

  // Empty
  if (answer === null || answer === undefined || answer === '') {
    if (text && text.trim()) return text.trim();
    return null;
  }

  const base = typeof answer === 'object' ? JSON.stringify(answer) : String(answer);
  if (text && text.trim() && text.trim() !== base) return `${base} — ${text.trim()}`;
  return base;
}

export interface QuestionLike {
  question_key: string;
  question_text: string;
  question_type?: string;
}

export interface SummaryItem {
  label: string;
  value: string;
}

/**
 * Builds an ordered list of `{label, value}` items for the questions a client
 * has configured, drawing from the live answer/text/file-url maps.
 */
export function buildQuestionSummaryItems(
  questions: QuestionLike[],
  questionAnswers: Record<string, any>,
  questionTexts: Record<string, string> = {},
  questionFileUrls: Record<string, string> = {},
): SummaryItem[] {
  const out: SummaryItem[] = [];
  for (const q of questions) {
    const formatted = formatQuestionAnswer(
      q.question_type,
      questionAnswers?.[q.question_key],
      questionTexts?.[q.question_key],
      questionFileUrls?.[q.question_key],
    );
    if (formatted) out.push({ label: q.question_text, value: formatted });
  }
  return out;
}
