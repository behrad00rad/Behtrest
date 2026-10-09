export type User = {
  id: number;
  username: string;
  email: string;
  profile: { display_name: string; bio: string };
};
export type Session = { user: User | null; csrfToken: string };

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public fields: Record<string, string[]> = {},
    public status = 400,
  ) {
    super(message);
  }
}

let csrfToken = "";
let sessionRequest: Promise<Session> | null = null;

export async function getSession(): Promise<Session> {
  if (!sessionRequest) {
    sessionRequest = request<Session>("/auth/session/").finally(() => {
      sessionRequest = null;
    });
  }
  return sessionRequest;
}

export async function request<T>(
  path: string,
  method = "GET",
  body?: Record<string, unknown>,
  retry = true,
): Promise<T> {
  if (method !== "GET" && !csrfToken) await getSession();
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(method !== "GET"
          ? { "Content-Type": "application/json", "X-CSRFToken": csrfToken }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(
      "network_error",
      "We couldn’t connect. Check your connection and try again.",
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (payload?.error?.code === "csrf_failed" && retry) {
      await getSession();
      return request<T>(path, method, body, false);
    }
    const error = payload?.error;
    throw new ApiError(
      error?.code || "request_failed",
      error?.message || "Something went wrong. Please try again.",
      error?.fields || {},
      response.status,
    );
  }
  if (!payload || !("data" in payload))
    throw new ApiError(
      "invalid_response",
      "We received an unexpected response. Please try again.",
    );
  if (payload.data?.csrfToken) csrfToken = payload.data.csrfToken;
  return payload.data as T;
}
