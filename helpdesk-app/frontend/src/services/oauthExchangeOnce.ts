/** One token exchange per auth `code` (Google codes are single-use). Survives React StrictMode double-mount. */
export type OAuthExchangeResult = { ok: boolean; error?: string };

const inflightByCode = new Map<string, Promise<OAuthExchangeResult>>();

export function oauthExchangeOnce(
  code: string,
  run: () => Promise<OAuthExchangeResult>
): Promise<OAuthExchangeResult> {
  const existing = inflightByCode.get(code);
  if (existing) return existing;
  const p = run().finally(() => {
    inflightByCode.delete(code);
  });
  inflightByCode.set(code, p);
  return p;
}
