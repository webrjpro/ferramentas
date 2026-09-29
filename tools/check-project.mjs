import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const pages = [
  ['index.html', 'js/core/pdf.js', 'js/app.js'],
  ['paginas/conversor.html', 'js/core/conversor.js', 'js/conversor.js'],
  ['paginas/docalunos.html', 'js/core/documentos.js', 'js/docalunos.js'],
  ['paginas/extratordeqr.html', 'js/core/qr.js', 'js/extratordeqr.js'],
  ['paginas/gerador-presenca.html', 'js/core/presenca.js', 'js/gerador-presenca.js'],
];
const forbidden = new Set(['.csv', '.xlsx', '.xls', '.xlsm', '.pdf', '.zip', '.docx']);
const failures = [];
const pathOf = (name) => new URL(name, root);

function checkLocalLinks(page) {
  const pageUrl = pathOf(page);
  const html = readFileSync(pageUrl, 'utf8');
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const target = match[1].split('?')[0];
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    if (!existsSync(new URL(target, pageUrl))) failures.push(`${page}: arquivo local ausente: ${target}`);
  }
}

for (const [page, core, controller] of pages) {
  const pageUrl = pathOf(page);
  const html = readFileSync(pageUrl, 'utf8');
  checkLocalLinks(page);
  const scriptPaths = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
    .map((match) => match[1].split('?')[0])
    .filter((target) => !/^https?:/.test(target))
    .map((target) => fileURLToPath(new URL(target, pageUrl)));
  if (scriptPaths.indexOf(fileURLToPath(pathOf(core))) < 0 ||
      scriptPaths.indexOf(fileURLToPath(pathOf(controller))) <= scriptPaths.indexOf(fileURLToPath(pathOf(core)))) {
    failures.push(`${page}: carregue ${core} antes de ${controller}`);
  }
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const js = readFileSync(pathOf(controller), 'utf8');
  for (const match of js.matchAll(/getElementById\("([^"]+)"\)/g)) {
    if (!ids.has(match[1])) failures.push(`${controller}: ID ausente em ${page}: ${match[1]}`);
  }
}
for (const page of ['paginas/termos.html', 'paginas/docalunos.htm']) checkLocalLinks(page);

for (const page of [...pages.map(([name]) => name), 'paginas/termos.html']) {
  const html = readFileSync(pathOf(page), 'utf8');
  const prefix = page === 'index.html' ? './' : '../';
  for (const asset of ['css/theme.css', 'js/preferences.js', 'js/theme.js']) {
    if (!html.includes(`${prefix}${asset}`)) failures.push(`${page}: tema compartilhado ausente: ${asset}`);
  }
  if (html.indexOf(`${prefix}js/preferences.js`) > html.indexOf(`${prefix}js/theme.js`)) {
    failures.push(`${page}: carregue preferencias.js antes de theme.js`);
  }
}

function inspect(folder = '') {
  for (const entry of readdirSync(pathOf(folder), { withFileTypes: true })) {
    const relative = join(folder, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if (!['.git', 'node_modules', 'coverage'].includes(entry.name)) inspect(`${relative}/`);
      continue;
    }
    if (forbidden.has(extname(entry.name).toLowerCase())) failures.push(`Arquivo de dados no projeto: ${relative}`);
    if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      const result = spawnSync(process.execPath, ['--check', fileURLToPath(pathOf(relative))], { encoding: 'utf8' });
      if (result.status !== 0) failures.push(`${relative}: ${result.stderr.trim()}`);
    }
  }
}
inspect();

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Estrutura, scripts e proteção contra arquivos de dados: OK');
}
