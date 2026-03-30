/** OpenAI-compatible chat completions (DeepSeek, Moonshot, etc.) */

export const PAPER_PILL_SYSTEM_PROMPT = `You are the Oracle of the 'Paper Pill' soul pharmacy. The user will confess their current struggle, confusion, or thoughts. You must prescribe EXACTLY ONE book (classic literature, philosophy, or psychology) that provides the ultimate cure. You must respond strictly in valid JSON format without any markdown code blocks. DO NOT wrap the JSON in \`\`\`json.
JSON Schema:
{
"quote": "The single most piercing, hard-hitting, and profound sentence from the book.",
"book": "Book Title",
"author": "Author Name",
"reason": "Two short, cold, yet deeply empathetic sentences explaining why this specific book is the cure for their exact situation."
}`;

function extractJsonObject(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return unfenced.slice(start, end + 1);
}

function isValidPrescription(obj) {
  return (
    obj &&
    typeof obj.quote === "string" &&
    obj.quote.trim() &&
    typeof obj.book === "string" &&
    obj.book.trim() &&
    typeof obj.author === "string" &&
    obj.author.trim() &&
    typeof obj.reason === "string" &&
    obj.reason.trim()
  );
}

function parsePrescriptionFromContent(content) {
  const jsonStr = extractJsonObject(content);
  if (jsonStr) {
    return JSON.parse(jsonStr);
  }
  return JSON.parse(content.trim());
}

/**
 * @param {string} userText
 * @param {string} apiKey
 * @param {{ signal?: AbortSignal, apiUrl?: string, model?: string, rejectedTitles?: string[] }} [options]
 */
export async function fetchPaperPillPrescription(userText, apiKey, options = {}) {
  const {
    signal,
    apiUrl = "https://api.deepseek.com/v1/chat/completions",
    model = "deepseek-chat",
    rejectedTitles = [],
  } = options;

  if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
    throw new Error("Missing API key (check .env VITE_PAPER_PILL_API_KEY)");
  }

  const useProxy =
    import.meta.env.DEV && import.meta.env.VITE_PAPER_PILL_NO_PROXY !== "true";
  const requestUrl = useProxy ? "/__paperpill/openai" : apiUrl;

  const rejectionBlock =
    rejectedTitles.length > 0
      ? `\n\nDO NOT recommend any of the following books, as the user has already rejected them: [ ${rejectedTitles.join(", ")} ]. You MUST choose a completely different book.`
      : "";

  const res = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: PAPER_PILL_SYSTEM_PROMPT },
        { role: "user", content: userText + rejectionBlock },
      ],
      temperature: 0.9,
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let hint = errText || `HTTP ${res.status}`;
    try {
      const j = JSON.parse(errText);
      if (j?.error?.message) hint = `${res.status}: ${j.error.message}`;
    } catch {
      /* keep raw */
    }
    throw new Error(hint);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(
      `No message content (got ${typeof content}). Raw keys: ${Object.keys(data || {}).join(",")}`
    );
  }

  let parsed;
  try {
    parsed = parsePrescriptionFromContent(content);
  } catch (e) {
    const snip = content.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(
      `JSON parse failed: ${e.message}. Model snippet: ${snip}${content.length > 160 ? "…" : ""}`
    );
  }

  if (!isValidPrescription(parsed)) {
    throw new Error("Invalid prescription shape (need quote, book, author, reason strings)");
  }

  return {
    quote: parsed.quote.trim(),
    book: parsed.book.trim(),
    author: parsed.author.trim(),
    reason: parsed.reason.trim(),
  };
}
