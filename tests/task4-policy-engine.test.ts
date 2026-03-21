import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePolicy, type PolicyRule } from '../packages/policy-engine/src/index.ts';

const policy: PolicyRule[] = [
  { action: 'read_status', riskLevel: 'low', allowed: true, requiresApproval: false, timeoutMs: 1_000 },
  { action: 'delete_system32', riskLevel: 'high', allowed: false, requiresApproval: false, timeoutMs: 100 },
  { action: 'ui_click', riskLevel: 'medium', allowed: true, requiresApproval: true, timeoutMs: 5_000 },
];

test('allowed low-risk action passes', () => {
  const result = evaluatePolicy(policy, { action: 'read_status', riskLevel: 'low' });
  assert.equal(result.decision, 'allow');
});

test('blocked high-risk action denied', () => {
  const result = evaluatePolicy(policy, { action: 'delete_system32', riskLevel: 'high' });
  assert.equal(result.decision, 'deny');
});

test('approval-required action flagged', () => {
  const result = evaluatePolicy(policy, { action: 'ui_click', riskLevel: 'medium' });
  assert.equal(result.decision, 'approval_required');
});
