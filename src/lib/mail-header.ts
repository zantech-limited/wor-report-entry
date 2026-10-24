/** One-line header text. Strips CR/LF so a work-order number cannot add Bcc or Subject lines. */
export function safeMailHeader(value: string, max = 200) {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
