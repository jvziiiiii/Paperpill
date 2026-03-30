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

/**
 * @param {string} userText
 * @param {{ signal?: AbortSignal, rejectedTitles?: string[] }} [options]
 */
export async function fetchPaperPillPrescription(userText, options = {}) {
  const { signal, rejectedTitles = [] } = options;
  const res = await fetch("/.netlify/functions/oracle", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userText,
      rejectedTitles,
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

  const parsed = await res.json();

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
