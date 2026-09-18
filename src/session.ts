export type CallbackResult = "accepted" | "no-session" | "expired" | "wrong-state" | "wrong-vault";

export class ProbeSession {
  private pending: { state: string; vault: string; expires: number } | null = null;

  start(state: string, vault: string, now: number): void {
    this.pending = { state, vault, expires: now + 120_000 };
  }

  receive(state: string | undefined, vault: string | undefined, now: number): CallbackResult {
    const pending = this.pending;
    if (!pending) return "no-session";
    if (now >= pending.expires) {
      this.clear();
      return "expired";
    }
    if (vault !== pending.vault) return "wrong-vault";
    if (!state || state !== pending.state) return "wrong-state";
    this.clear();
    return "accepted";
  }

  clear(): void {
    this.pending = null;
  }
}
