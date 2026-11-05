/**
 * Builds the committed package files a module installs: types/ from src/types.ts (tsconfig.types.json), and
 * runtime.js from src/runtime.ts. Browsers never read runtime.js, since the import map serves the copy
 * webpack.shared.config.js builds; it is for tools that resolve the package in Node, such as a module's tests.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const outDir = path.join(import.meta.dirname, 'types');

fs.rmSync(outDir, { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', path.join(import.meta.dirname, 'tsconfig.types.json')], {
  stdio: 'inherit',
});

const source = fs.readFileSync(path.join(import.meta.dirname, 'src/runtime.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
});
fs.writeFileSync(path.join(import.meta.dirname, 'runtime.js'), outputText);
