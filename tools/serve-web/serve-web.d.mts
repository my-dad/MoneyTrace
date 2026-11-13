export function parseRedirects(text: string): { from: string; to: string; status: number }[];
export function parseHeaders(text: string): { pattern: string; headers: Record<string, string> }[];
export function resolveFile(root: string, urlPath: string): string | null;
