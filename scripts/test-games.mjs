import { resolve } from 'node:path';
import { selectTests } from './test-selection.mjs';
import { loadWorkspacePlan } from './workspace-policy.mjs';
import { runWorkspaces } from './run-workspaces.mjs';

const { plan, tests } = loadWorkspacePlan(resolve(import.meta.dirname, '..'));
const profile = process.argv[2] ?? 'default';
const files = selectTests(tests, profile);
if (plan.phase !== 'full') throw Error('Root tests require full workspace coverage. Use scoped pilot tasks or run npm run workspaces:sync.');
console.log(`Test profile: ${profile}; ${files.length} files, each owned by exactly one workspace.`);
runWorkspaces('test');
