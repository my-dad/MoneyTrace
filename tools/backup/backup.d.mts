export type DrillReport = {
  ok: boolean;
  counts: Record<string, number>;
  mismatches: string[];
  problems: { problem: string; subject: string }[];
};
export function keygen(): Promise<{ identity: string; recipient: string }>;
export function encrypt(recipient: string, bytes: Uint8Array): Promise<Uint8Array>;
export function decrypt(identity: string, bytes: Uint8Array): Promise<string>;
export function drill(dumpSql: string, manifest: Record<string, number>): Promise<DrillReport>;
