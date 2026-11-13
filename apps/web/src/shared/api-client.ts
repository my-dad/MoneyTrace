/**
 * Calls the backend's `/api` (CR-010). A refusal becomes an error whose `code` keeps the
 * `functions/<code>` shape the screens already read (`useAction`'s `refused`).
 */
export type ApiCall = (command: string, data: unknown) => Promise<unknown>;

export class ApiError extends Error {
  readonly code: string;
  constructor(wireCode: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = `functions/${wireCode}`;
  }
}

export function createApiCall(options: {
  url: string;
  anonKey: string;
  accessToken: () => Promise<string | null>;
  fetchImpl: typeof fetch;
}): ApiCall {
  return async (command, data) => {
    const token = await options.accessToken();
    if (token === null) throw new ApiError("unauthenticated", "unauthenticated");
    let res: Response;
    try {
      res = await options.fetchImpl(options.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}`, apikey: options.anonKey },
        body: JSON.stringify({ command, data }),
      });
    } catch {
      throw new ApiError("unavailable", "network");
    }
    let body: { result?: unknown; error?: { code?: unknown; message?: unknown } } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // A non-JSON reply (a gateway page) is reported by status below.
    }
    if (res.ok && body.result !== undefined) return body.result;
    const code = typeof body.error?.code === "string" ? body.error.code : res.status >= 500 ? "internal" : "unknown";
    const message = typeof body.error?.message === "string" ? body.error.message : `http ${String(res.status)}`;
    throw new ApiError(code, message);
  };
}
