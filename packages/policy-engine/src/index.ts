export type RiskLevel = 'low' | 'medium' | 'high';

export type PolicyRule = {
  action: string;
  riskLevel: RiskLevel;
  allowed: boolean;
  requiresApproval: boolean;
  timeoutMs: number;
};

export type PolicyInput = {
  action: string;
  riskLevel: RiskLevel;
};

export type PolicyDecision = 'allow' | 'deny' | 'approval_required';

export type PolicyResult = {
  decision: PolicyDecision;
  rule?: PolicyRule;
};

export function evaluatePolicy(rules: PolicyRule[], input: PolicyInput): PolicyResult {
  const match = rules.find((rule) => rule.action === input.action && rule.riskLevel === input.riskLevel);

  if (!match) {
    return { decision: 'deny' };
  }

  if (!match.allowed) {
    return { decision: 'deny', rule: match };
  }

  if (match.requiresApproval) {
    return { decision: 'approval_required', rule: match };
  }

  return { decision: 'allow', rule: match };
}
