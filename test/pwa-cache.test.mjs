import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const root = new URL('..', import.meta.url);

function readSiteFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, root), 'utf8');
}

function stripFrontMatter(source) {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

test('offline cache is disabled and the site stays installable', () => {
  const config = readSiteFile('_config.yml');
  assert.match(config, /pwa:\n {2}enabled: true\b/);
  assert.match(config, /cache:\n {4}enabled: false\b/);
});

test('register=false unregisters workers and deletes caches', async () => {
  const deleted = [];
  const unregistered = [];
  let registered = 0;
  const context = {
    document: {
      currentScript: {
        src: 'https://bullbearbull.github.io/app.min.js?baseurl=&register=false'
      }
    },
    navigator: {
      serviceWorker: {
        register() {
          registered += 1;
          return Promise.resolve();
        },
        getRegistrations() {
          return Promise.resolve([
            {
              unregister() {
                unregistered.push('sw');
                return Promise.resolve(true);
              }
            }
          ]);
        }
      }
    },
    caches: {
      keys() {
        return Promise.resolve(['chirpy-old']);
      },
      delete(key) {
        deleted.push(key);
        return Promise.resolve(true);
      }
    },
    URL,
    Promise
  };
  vm.createContext(context);
  vm.runInContext(stripFrontMatter(readSiteFile('assets/js/dist/app.min.js')), context);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(registered, 0);
  assert.deepEqual(unregistered, ['sw']);
  assert.deepEqual(deleted, ['chirpy-old']);
});

test('the string false is truthy, which is why the theme script cannot be reused', () => {
  assert.equal(Boolean('false'), true);
  assert.equal(Boolean(''), false);
});

test('replacement service worker clears caches, reloads clients, and unregisters', async () => {
  const deleted = [];
  const navigated = [];
  let unregistered = false;
  let skipped = false;
  const events = {};
  const context = {
    caches: {
      keys() {
        return Promise.resolve(['chirpy-1794272053']);
      },
      delete(key) {
        deleted.push(key);
        return Promise.resolve(true);
      }
    },
    Promise
  };
  context.self = {
    addEventListener(type, handler) {
      events[type] = handler;
    },
    skipWaiting() {
      skipped = true;
      return Promise.resolve();
    },
    registration: {
      unregister() {
        unregistered = true;
        return Promise.resolve(true);
      }
    },
    clients: {
      matchAll() {
        return Promise.resolve([
          {
            url: 'https://bullbearbull.github.io/',
            navigate(url) {
              navigated.push(url);
              return Promise.resolve();
            }
          }
        ]);
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(stripFrontMatter(readSiteFile('assets/js/dist/sw.min.js')), context);
  assert.equal(typeof events.install, 'function');
  assert.equal(typeof events.activate, 'function');
  assert.equal(events.fetch, undefined);

  let installDone;
  events.install({
    waitUntil(promise) {
      installDone = promise;
    }
  });
  await installDone;
  assert.equal(skipped, true);

  let activateDone;
  events.activate({
    waitUntil(promise) {
      activateDone = promise;
    }
  });
  await activateDone;
  assert.deepEqual(deleted, ['chirpy-1794272053']);
  assert.deepEqual(navigated, ['https://bullbearbull.github.io/']);
  assert.equal(unregistered, true);
});
