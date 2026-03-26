import Groq from "groq-sdk";

export function createGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is required");
  return new Groq({ apiKey });
}

export async function chatJson(
  client: Groq,
  system: string,
  user: string,
  model?: string,
): Promise<string> {
  const m = model ?? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  const res = await client.chat.completions.create({
    model: m,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    max_tokens: 2048,
  });
  const t = res.choices[0]?.message?.content?.trim();
  if (!t) throw new Error("Empty LLM response");
  return t;
}

export function extractJsonObject(text: string): Record<string, unknown> {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object in LLM output");
  return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
}
