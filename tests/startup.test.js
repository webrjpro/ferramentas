const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function fakeElement() {
  return {
    value: '', files: [], src: '', disabled: false, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, append() {}, appendChild() {}, replaceChildren() {}, click() {}, remove() {},
    setAttribute() {}, querySelector() { return fakeElement(); },
    scrollIntoView() {},
  };
}

test('ZIP de presença contém somente instruções e CSVs de sessões', async () => {
  const entries = [];
  let onReady;
  class FakeZip {
    file(path, content) { entries.push({ path, content }); return this; }
    async generateAsync() { return new Blob(['zip fictício']); }
  }
  const document = {
    getElementById: fakeElement, querySelector: fakeElement,
    querySelectorAll() { return []; }, createElement: fakeElement,
    body: fakeElement(), addEventListener(name, callback) { if (name === 'DOMContentLoaded') onReady = callback; },
  };
  const window = { JSZip: FakeZip, setTimeout() {}, addEventListener() {} };
  const context = vm.createContext({ document, window, Blob, URL: {
    createObjectURL() { return 'blob:teste'; }, revokeObjectURL() {},
  }, console, setTimeout() {} });
  for (const file of ['js/core/presenca.js', 'js/gerador-presenca.js']) {
    let source = readFileSync(join(__dirname, '..', file), 'utf8');
    if (file.endsWith('gerador-presenca.js')) {
      source = source.replace(/\}\)\(\);\s*$/, 'globalThis.qa = { state, generateZip };})();');
    }
    vm.runInContext(source, context, { filename: file });
  }
  onReady();
  const module = {
    id: 'modulo-1', title: 'Módulo fictício',
    sessions: [{ date: vm.runInContext("new Date('2026-10-05T00:00:00Z')", context),
      dateDisplay: '05/10/2026', lesson: 'Aula 1', from: '13:40', to: '16:10' }],
  };
  context.qa.state.parsed = { modules: [module], settings: { delimiter: ';', groupName: '', courseShortname: '' } };
  context.qa.state.selectedModuleIds.add(module.id);
  await context.qa.generateZip();
  assert.deepEqual(entries.map((entry) => entry.path), [
    'LEIA-ME.txt', '01_Módulo fictício/IMPORTAR_SESSOES_NO_MOODLE.csv',
  ]);
  assert.match(entries[1].content, /2026-10-05/);
});

function boot(core, controller) {
  let onReady;
  const errors = [];
  const document = {
    getElementById: fakeElement,
    querySelector: fakeElement,
    querySelectorAll() { return []; },
    createElement: fakeElement,
    addEventListener(name, callback) { if (name === 'DOMContentLoaded') onReady = callback; },
  };
  const context = vm.createContext({
    document, navigator: { deviceMemory: 4 },
    console: { ...console, error(error) { errors.push(error); } },
    window: {
      addEventListener() {},
      pdfjsLib: { GlobalWorkerOptions: {} },
      jspdf: { jsPDF: class {} }, JSZip: class {},
    },
    setTimeout() {},
  });
  for (const file of [core, controller]) {
    vm.runInContext(readFileSync(join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  if (onReady) onReady();
  assert.deepEqual(errors, [], 'a inicialização não deve registrar erros');
  assert.ok(context.window.FerramentasCore);
}

for (const [name, core, controller] of [
  ['compressor PDF', 'js/core/pdf.js', 'js/app.js'],
  ['conversor Moodle', 'js/core/conversor.js', 'js/conversor.js'],
  ['documentos dos alunos', 'js/core/documentos.js', 'js/docalunos.js'],
  ['QR em PDF', 'js/core/qr.js', 'js/extratordeqr.js'],
  ['gerador de presença', 'js/core/presenca.js', 'js/gerador-presenca.js'],
]) {
  test(`${name} inicializa com seu núcleo carregado`, () => boot(core, controller));
}
