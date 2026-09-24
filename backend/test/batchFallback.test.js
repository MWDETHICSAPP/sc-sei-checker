const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const frontend = fs.readFileSync(path.join(__dirname, '../../app.js'), 'utf8');
const start = frontend.indexOf('async function requestChecks(');
const end = frontend.indexOf('\nfunction renderRows(', start);
assert.ok(start >= 0 && end > start);

function checker(fetch) {
  const context = vm.createContext({ fetch, API_BASE_URL: 'https://example.test' });
  vm.runInContext(`${frontend.slice(start, end)}\nthis.check = checkBatchWithFallback;`, context);
  return context.check;
}

test('splits a failed batch and preserves the order of successful checks', async () => {
  const calls = [];
  const check = checker(async (_url, options) => {
    const people = JSON.parse(options.body).people;
    calls.push(people.map(p => p.name));
    if (people.length > 2) throw new Error('Request timed out');
    return { ok: true, json: async () => ({ results: people.map(p => ({ name: p.name })) }) };
  });
  const people = ['A', 'B', 'C', 'D', 'E'].map(name => ({ name }));
  const results = await check(people, 2026);
  assert.deepEqual(Array.from(results, r => r.name), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(calls.length, 5);
});

test('marks only an individually failing person for review after retry', async () => {
  let failedAttempts = 0;
  const check = checker(async (_url, options) => {
    const people = JSON.parse(options.body).people;
    if (people.some(p => p.name === 'B')) {
      if (people.length === 1) failedAttempts++;
      return { ok: false, status: 503, json: async () => ({ error: 'Service unavailable' }) };
    }
    return { ok: true, json: async () => ({ results: people.map(p => ({ name: p.name })) }) };
  });
  const results = await check(['A', 'B', 'C'].map(name => ({ name })), 2026);
  assert.equal(results[0].name, 'A');
  assert.match(results[1].__requestError, /Service unavailable/);
  assert.equal(results[2].name, 'C');
  assert.equal(failedAttempts, 2);
});
