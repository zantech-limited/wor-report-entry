export async function deskApi<T = Record<string, unknown>>(
  url: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(
        data.error?.message ||
          data.error ||
          data.message ||
          "The request failed.",
      ),
      { status: response.status },
    );
  return data as T;
}
export function todayLocal() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Port_of_Spain",
  });
}
