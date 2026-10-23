import { readJsonResponse } from "./response-json";
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
  const data = await readJsonResponse(response);
  return data as T;
}
export function todayLocal() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Port_of_Spain",
  });
}
