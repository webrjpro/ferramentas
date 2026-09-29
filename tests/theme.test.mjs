import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/theme.js', import.meta.url), 'utf8');

function page(savedTheme, withHost = false) {
  let button;
  let placement;
  const writes = [];
  const root = { dataset: {} };
  const body = { appendChild(element) { button = element; placement = 'body'; } };
  const host = { appendChild(element) { button = element; placement = 'header'; } };
  const document = {
    documentElement: root,
    body,
    readyState: 'complete',
    querySelector(selector) { return withHost && selector === '[data-theme-toggle-host]' ? host : null; },
    createElement() {
      const events = {};
      return {
        events,
        classList: { add(name) { this.name = name; } },
        addEventListener(name, listener) { events[name] = listener; },
        setAttribute(name, value) { this[name] = value; },
      };
    },
  };
  const window = {
    AppPreferences: {
      get: async () => savedTheme,
      set: async (key, value) => { writes.push([key, value]); },
    },
  };
  runInNewContext(source, { document, window });
  return { root, button, writes, placement };
}

test('tema claro aparece de imediato e a escolha salva é aplicada', async () => {
  const app = page('dark');
  assert.equal(app.root.dataset.theme, 'light');
  await Promise.resolve();
  assert.equal(app.root.dataset.theme, 'dark');
  assert.equal(app.button['aria-pressed'], 'true');
});

test('alternância grava no IndexedDB sem sobrescrever clique com leitura atrasada', async () => {
  const app = page('light');
  app.button.events.click();
  await Promise.resolve();
  assert.equal(app.root.dataset.theme, 'dark');
  assert.deepEqual(app.writes, [['tema', 'dark']]);
});

test('seletor fica no cabeçalho quando a página oferece um espaço para ele', () => {
  const app = page('light', true);
  assert.equal(app.placement, 'header');
  assert.equal(app.button.classList.name, 'theme-toggle--inline');
});
