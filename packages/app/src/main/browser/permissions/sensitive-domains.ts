/**
 * Heuristic regex matching hosts that look sensitive (banking, login, auth).
 * When a `goto` lands on such a host we automatically switch ControlMode to
 * `user` so the user (not the agent) drives the credential flow.
 */
const SENSITIVE_PATTERN = /(^|\.)(bank|login|signin|auth|password|account|verify|secure)\b/i;

export class SensitiveDomainMatcher {
  isSensitive(host: string): boolean {
    return SENSITIVE_PATTERN.test(host);
  }
}