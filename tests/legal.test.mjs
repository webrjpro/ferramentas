import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/legal.js', import.meta.url), 'utf8');

test('termos abrem após IndexedDB mesmo quando currentScript já é null', async () => {
  let overlay;
  const acceptButton = { addEventListener() {}, focus() {} };
  const document = {
    currentScript: { src: 'https://webrjpro.github.io/ferramentas/js/legal.js' },
    body: { appendChild(element) { overlay = element; } },
    documentElement: { classList: { add() {} } },
    createElement() {
      return { querySelector: () => acceptButton };
    },
  };
  const window = { AppPreferences: { get: async () => undefined } };
  runInNewContext(source, { document, window, URL });
  document.currentScript = null;
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(overlay.innerHTML, /https:\/\/webrjpro\.github\.io\/ferramentas\/paginas\/termos\.html/);
});
