import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const requiredDirs = [
  'apps/companion-ui',
  'apps/companion-service',
  'packages/policy-engine',
  'packages/audit',
];

for (const dir of requiredDirs) {
  test(`scaffold exists: ${dir}`, () => {
    assert.equal(existsSync(dir), true);
    assert.equal(existsSync(`${dir}/README.md`), true);
  });
}
