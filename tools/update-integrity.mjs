import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const folders = ['.', 'paginas', 'css', 'js', 'js/core', 'assets'];
const files = folders.flatMap((folder) => readdirSync(folder)
  .filter((file) => /\.(?:html|htm|css|js|png)$/.test(file))
  .map((file) => folder === '.' ? file : join(folder, file))).sort();
const lines = [
  'REGISTRO DE INTEGRIDADE DA VERSAO 2.1',
  'Autor e titular declarado: Carlos Antonio de Oliveira Piquet',
  'Algoritmo: SHA-256',
  'Gerar novamente com: node tools/update-integrity.mjs',
  '',
];
for (const file of files) {
  lines.push(file.replaceAll('\\', '/'), createHash('sha256').update(readFileSync(file)).digest('hex'), '');
}
writeFileSync('REGISTRO_DE_VERSAO.txt', lines.join('\n'), 'utf8');
console.log(`${files.length} arquivos registrados.`);
