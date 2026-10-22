/** Platform upload errors can be plain text rather than application JSON. */
export async function readJsonResponse(response: Response) {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      response.status === 413
        ? "The upload is too large for this server. Refresh the page and retry using the updated backup uploader."
        : `The server returned an unexpected response (${response.status}). Please retry.`,
    );
  }
  if (!response.ok)
    throw new Error(
      body.error?.message ||
        body.error ||
        "The operation could not be completed.",
    );
  return body;
}
