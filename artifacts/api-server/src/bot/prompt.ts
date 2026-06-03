/**
 * Prompt processing — "maximize completion" policy.
 *
 * Pipeline for every request:
 *   1. enhance()   — add quality descriptors
 *   2. generate()  — send to DeepAI
 *   3. if content block → adapt() → retry once silently
 *   4. only surface an error to the user when all attempts fail
 *
 * We never add our own content filters.
 * We only react to blocks that DeepAI itself returns.
 */

const QUALITY_SUFFIX =
  ", highly detailed, sharp focus, professional quality, vivid colors";

const HAS_QUALITY_RE =
  /\b(detailed|realistic|hd|4k|high.?quality|professional|sharp|vivid)\b/i;

/**
 * Step 1 — enhance a raw prompt for best output without changing intent.
 */
export function enhancePrompt(raw: string): string {
  const t = raw.trim();
  return t && !HAS_QUALITY_RE.test(t) ? `${t}${QUALITY_SUFFIX}` : t;
}

/**
 * Step 3 — called only when DeepAI returns a content block.
 * Removes or replaces the narrowest possible set of problematic tokens,
 * then re-enhances, so the user's original intent is preserved as much as possible.
 */
export function adaptPrompt(raw: string): string {
  let text = raw.trim();

  // Replace overly graphic violence descriptors with artistic equivalents
  text = text
    .replace(/\b(gore|gory|brutal|mutilat\w*|decapitat\w*|dismember\w*)\b/gi, "dramatic scene")
    .replace(/\b(blood(?:bath|shed)?|bleeding)\b/gi, "dramatic lighting")
    .replace(/\b(explicit|nude|naked|nsfw|pornograph\w*|erotic\w*)\b/gi, "artistic")
    .replace(/\b(kill(?:ing)?|murder|slaughter)\b/gi, "conflict")
    .replace(/\b(weapon|gun|knife|sword)\b/gi, "object")
    .replace(/\b(terrorist|extremist|jihadist)\b/gi, "figure")
    .replace(/\b(drug|cocaine|heroin|methamphetamine)\b/gi, "substance")
    .trim();

  // Re-enhance after adaptation
  return enhancePrompt(text);
}

/** Detect if a DeepAI error is a content-policy block (worth retrying with adaptation). */
export function isContentBlock(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("content") ||
    m.includes("policy") ||
    m.includes("nsfw") ||
    m.includes("not allowed") ||
    m.includes("prohibited") ||
    m.includes("unsafe") ||
    m.includes("rejected")
  );
}

/** Detect transient errors worth retrying as-is. */
export function isTransient(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("500") ||
    m.includes("server error") ||
    m.includes("timeout") ||
    m.includes("econnreset") ||
    m.includes("network") ||
    m.includes("output_url") ||
    m.includes("no output")
  );
}

/**
 * Final user-facing error message — shown only when all attempts fail.
 * Short, friendly, actionable. No lectures.
 */
export function friendlyError(err: unknown): { message: string; canRetry: boolean } {
  if (!(err instanceof Error)) {
    return { message: "⚠️ حدث خطأ غير متوقع. أعد المحاولة.", canRetry: true };
  }

  const m = err.message.toLowerCase();

  if (m.includes("401") || m.includes("unauthorized") || m.includes("api-key") || m.includes("api key")) {
    return { message: "⚙️ مشكلة في مفتاح DeepAI — يرجى مراجعة الإعدادات.", canRetry: false };
  }

  if (m.includes("429") || m.includes("rate limit") || m.includes("too many")) {
    return { message: "⏳ تجاوزنا الحد المسموح مؤقتاً. انتظر دقيقة ثم أعد الإرسال.", canRetry: true };
  }

  if (isContentBlock(err)) {
    return {
      message: "🔄 لم أتمكن من إيجاد صيغة مقبولة لهذا الطلب. جرب وصفاً مختلفاً قليلاً.",
      canRetry: false,
    };
  }

  if (isTransient(err)) {
    return { message: "🌐 مشكلة مؤقتة. أعد الإرسال بعد لحظة.", canRetry: true };
  }

  return { message: "⚠️ حدث خطأ. أعد المحاولة أو عدّل الوصف.", canRetry: true };
}
