export type User = {
  can_manage_referrals?: boolean;
  can_moderate: boolean;
  id: number;
  username: string;
  email: string;
  profile: {
    display_name: string;
    bio: string;
    avatar: string | null;
    avatar_scan?: { id: number; status: string } | null;
  };
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
  signal?: AbortSignal,
): Promise<T> {
  if (method !== "GET" && !csrfToken) await getSession();
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      signal,
      headers: {
        Accept: "application/json",
        ...(method !== "GET"
          ? { "Content-Type": "application/json", "X-CSRFToken": csrfToken }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    if (signal?.aborted)
      throw new DOMException("Request aborted", "AbortError");
    throw new ApiError(
      "network_error",
      "We couldn’t connect. Check your connection and try again.",
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (payload?.error?.code === "csrf_failed" && retry) {
      await getSession();
      return request<T>(path, method, body, false, signal);
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

export async function upload<T>(
  path: string,
  body: FormData,
  progress: (value: number) => void,
  signal?: AbortSignal,
  retry = true,
): Promise<T> {
  if (!csrfToken) await getSession();
  try {
    return await new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      if (signal?.aborted)
        return reject(new DOMException("Request aborted", "AbortError"));
      xhr.open("POST", `/api${path}`);
      xhr.responseType = "json";
      xhr.setRequestHeader("X-CSRFToken", csrfToken);
      const abort = () => xhr.abort();
      signal?.addEventListener("abort", abort, { once: true });
      const clean = () => signal?.removeEventListener("abort", abort);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          progress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        clean();
        const payload = xhr.response;
        if (
          xhr.status >= 200 &&
          xhr.status < 300 &&
          payload &&
          "data" in payload
        )
          resolve(payload.data);
        else
          reject(
            new ApiError(
              payload?.error?.code || "upload_failed",
              payload?.error?.message || "The upload failed. Please try again.",
              payload?.error?.fields || {},
              xhr.status,
            ),
          );
      };
      xhr.onerror = () => {
        clean();
        reject(
          new ApiError(
            "network_error",
            "We couldn’t connect. Please try again.",
          ),
        );
      };
      xhr.onabort = () => {
        clean();
        reject(new DOMException("Request aborted", "AbortError"));
      };
      xhr.send(body);
    });
  } catch (error) {
    if (retry && error instanceof ApiError && error.code === "csrf_failed") {
      await getSession();
      return upload(path, body, progress, signal, false);
    }
    throw error;
  }
}
