/* eslint-env node */
/* eslint-env node */
const DEEPSEEK_API_URL =
  process.env.PAPER_PILL_API_URL || "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = process.env.PAPER_PILL_API_MODEL || "deepseek-chat";

const PAPER_PILL_SYSTEM_PROMPT = `You are the Oracle of the 'Paper Pill' soul pharmacy. The user will confess their current struggle, confusion, or thoughts. You must prescribe EXACTLY ONE book (classic literature, philosophy, or psychology) that provides the ultimate cure. You must respond strictly in valid JSON format without any markdown code blocks. DO NOT wrap the JSON in \`\`\`json.
JSON Schema:
{
"quote": "The single most piercing, hard-hitting, and profound sentence from the book.",
"book": "Book Title",
"author": "Author Name",
"reason": "Two short, cold, yet deeply empathetic sentences explaining why this specific book is the cure for their exact situation."
}`;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

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

function parsePrescriptionFromContent(content) {
  const jsonStr = extractJsonObject(content);
  if (jsonStr) return JSON.parse(jsonStr);
  return JSON.parse(content.trim());
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

export const handler = async (event) => {
  const headers = corsHeaders();

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  const apiKey = (process.env.PAPER_PILL_API_KEY || "").trim();
  if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Missing PAPER_PILL_API_KEY on server" }),
    };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const userText = String(payload.userText || "").trim();
    const rejectedTitles = Array.isArray(payload.rejectedTitles)
      ? payload.rejectedTitles.filter((v) => typeof v === "string" && v.trim())
      : [];

    if (!userText) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing userText" }),
      };
    }

    const rejectionBlock =
      rejectedTitles.length > 0
        ? `\n\nDO NOT recommend any of the following books, as the user has already rejected them: [ ${rejectedTitles.join(", ")} ]. You MUST choose a completely different book.`
        : "";

    const upstream = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: PAPER_PILL_SYSTEM_PROMPT },
          { role: "user", content: userText + rejectionBlock },
        ],
        temperature: 0.9,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return {
        statusCode: upstream.status,
        headers,
        body: JSON.stringify({
          error: errText || `Upstream HTTP ${upstream.status}`,
        }),
      };
    }

    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "No message content from upstream model" }),
      };
    }

    let parsed;
    try {
      parsed = parsePrescriptionFromContent(content);
    } catch (e) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: `JSON parse failed: ${e.message}` }),
      };
    }

    if (!isValidPrescription(parsed)) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Invalid prescription shape from upstream model" }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        quote: parsed.quote.trim(),
        book: parsed.book.trim(),
        author: parsed.author.trim(),
        reason: parsed.reason.trim(),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String(err?.message || err) }),
    };
  }
};
