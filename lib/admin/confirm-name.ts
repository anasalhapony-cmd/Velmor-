/**
 * Typed-name confirmation for destructive actions.
 *
 * Mirrors the comparison inside the SQL function admin_delete_product
 * (trim, collapse whitespace runs to one space, lower-case). The client uses it
 * only to enable the red button; the DATABASE repeats the check and is the
 * authority — a tampered client can't skip it.
 */
export function normalizeConfirmName(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** True when `typed` names the perfume (any of its accepted names). */
export function confirmNameMatches(typed: string, ...accepted: (string | null | undefined)[]): boolean {
  const t = normalizeConfirmName(typed);
  if (!t) return false;
  return accepted.some((a) => {
    const n = normalizeConfirmName(a);
    return n !== '' && n === t;
  });
}
