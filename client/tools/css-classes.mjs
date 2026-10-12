#!/usr/bin/env node
/**
 * Dead-class check for the Piral packages' CSS (patterns package, shell and pilets). Fails when
 * - a class has a rule but nothing emits it: no string in the packages' non-test TypeScript, no PHP class or
 *   template in the module, and no backticked name in PILET-API.md
 * - the TypeScript emits a class of a styled block (one with any rule) that has no rule itself
 * - an allowlist entry is stale: its class is now styled and emitted, or appears nowhere
 *
 * Template literals count by family: `admin-button--${variant}` emits admin-button--primary when 'primary' is
 * a string literal in the same package, which is where its type union lives. Classes emitted only by
 * vendor code, legacy markup or tests go in css-classes-allowlist.json, each with its reason.
 * Run from the module root: node client/tools/css-classes.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const allowlistPath = 'client/tools/css-classes-allowlist.json';
const allowlist = JSON.parse(readFileSync(join(root, allowlistPath), 'utf8'));

const walk = (dir, test) => {
  let out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out = out.concat(walk(path, test));
    else if (test(path)) out.push(path);
  }
  return out;
};

const pilets = readdirSync(join(root, 'client/pilets')).filter((name) => statSync(join(root, 'client/pilets', name)).isDirectory());
const packages = [
  { name: 'patterns', dir: 'client/patterns/src' },
  { name: 'shell', dir: 'client/shell/src' },
  ...pilets.map((name) => ({ name, dir: `client/pilets/${name}/src` })),
];

const classPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const blockOf = (name) => name.split(/__|--/)[0];
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

// Classes in rule selectors, with where each is styled
const styled = new Map();
for (const pkg of packages) {
  for (const file of walk(join(root, pkg.dir), (path) => path.endsWith('.css'))) {
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
    const prelude = /([^{};]*)\{/g;
    for (let match; (match = prelude.exec(text)); ) {
      const selector = match[1].trim();
      if (!selector || selector.startsWith('@')) continue;
      for (const [, name] of selector.matchAll(/\.([a-z][\w-]*)/g)) {
        if (!styled.has(name)) styled.set(name, `${relative(root, file)}:${lineAt(text, match.index + match[0].length - match[1].trimStart().length - 1)}`);
      }
    }
  }
}

// Strings in each package's non-test TypeScript: whole literals, and template literals as families
const emitted = new Set();
const families = [];
const isTest = (path) => /\.test\.tsx?$|\/test\//.test(path);
for (const pkg of packages) {
  const literals = new Set();
  const templates = [];
  for (const file of walk(join(root, pkg.dir), (path) => /\.tsx?$/.test(path) && !path.endsWith('.d.ts') && !isTest(path))) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) literals.add(node.text);
      else if (ts.isTemplateExpression(node)) {
        templates.push([node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('\u0000'));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const text of [...literals, ...templates]) {
    for (const word of text.split(/\s+/)) {
      if (!word.includes('\u0000')) {
        if (classPattern.test(word)) emitted.add(word);
        continue;
      }
      const parts = word.split('\u0000');
      if (!/^[a-z][a-z0-9-]*(?:__|--|-)$/.test(parts[0]) || parts[0].length < 4) continue;
      const escaped = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      families.push({ pattern: new RegExp(`^${escaped.join('([a-z0-9-]+)')}$`), literals, source: pkg.dir });
    }
  }
}

// PHP classes and templates in the module, and the classes PILET-API.md documents for pilets
const documented = new Set();
for (const file of [...walk(join(root, 'code'), (path) => path.endsWith('.php')), ...walk(join(root, 'templates'), (path) => path.endsWith('.ss'))]) {
  for (const [name] of readFileSync(file, 'utf8').matchAll(/[a-z][a-z0-9_-]*/g)) documented.add(name);
}
for (const [, name] of readFileSync(join(root, 'client/shell/PILET-API.md'), 'utf8').matchAll(/`([a-z][a-z0-9_-]*)`/g)) documented.add(name);

const familyEmits = (name) =>
  families.some(({ pattern, literals }) => {
    const match = name.match(pattern);
    return match && match.slice(1).every((value) => literals.has(value));
  });
const hasEmitter = (name) => emitted.has(name) || documented.has(name) || familyEmits(name);
const styledBlocks = new Set([...styled.keys()].map(blockOf));

const problems = [];
for (const [name, where] of styled) {
  if (!hasEmitter(name) && !(name in allowlist)) problems.push(`${where}  .${name} has a rule but nothing emits it`);
}
for (const name of emitted) {
  if (styledBlocks.has(blockOf(name)) && !styled.has(name) && !(name in allowlist)) {
    problems.push(`${name} is emitted with no rule; style it, drop it, or allowlist it with a reason`);
  }
}
for (const name of Object.keys(allowlist)) {
  const stale = (styled.has(name) && hasEmitter(name)) || (!styled.has(name) && !emitted.has(name) && !documented.has(name));
  if (stale) problems.push(`${allowlistPath}: ${name} is no longer needed`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} class problem(s)`);
  process.exit(1);
}
console.log(`${styled.size} styled classes, all emitted; ${Object.keys(allowlist).length} allowlisted`);
