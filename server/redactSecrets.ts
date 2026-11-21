/**
 * Removes API keys and bearer tokens from text that may be logged or returned.
 * Gemini client errors sometimes include the request URL, which carries `?key=`.
 */
export function redactSecrets(text: string): string {
  let out = text;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.length > 0) {
    out = out.split(geminiKey).join('[redacted]');
  }
  out = out
    .replace(/([?&](?:key|api_key|access_token)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\bAIza[0-9A-Za-z\-_]{10,}\b/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [redacted]');
  return out;
}
