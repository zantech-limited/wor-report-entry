/** Platform upload errors can be plain text rather than application JSON. */
export async function readJsonResponse(response: Response) {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
    if (!body || typeof body !== "object") throw new Error("Invalid JSON response.");
  } catch {
    throw Object.assign(
      new Error(
        response.status === 413
          ? "The upload is too large for this server. Refresh the page and retry using the updated backup uploader."
          : `The server returned an unexpected response (${response.status}). Please retry.`,
      ),
      { status: response.status },
    );
  }
  if (!response.ok)
    throw Object.assign(
      new Error(
        body?.error?.message ||
          body?.error ||
          body?.message ||
          "The operation could not be completed.",
      ),
      { status: response.status },
    );
  return body;
}
