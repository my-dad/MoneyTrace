export function inlineScriptHashes(html: string): string[];
export function buildCsp(options: { hashes: string[]; supabaseUrl: string | undefined }): string;
export function writeCsp(outDir: string, env: Record<string, string | undefined>): { pages: number; hashes: number };
