// Client-half render test with a minimal React stand-in.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function createElement(type, props, ...children) {
  return { type, props: { ...(props ?? {}), children } };
}
const React = {
  createElement,
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useEffect() {},
  useCallback(fn) {
    return fn;
  },
};

let loaded;
globalThis.window = {
  __ModuleLoader__: {
    load({ id, factory }) {
      loaded = {
        id,
        module: factory((name) => {
          if (name === 'react') return React;
          throw new Error(`unexpected require: ${name}`);
        }),
      };
    },
  },
};

await import(new URL('../client.js', import.meta.url).href);
assert.equal(loaded.id, '@local/dsh-offpeak-exec');

const zh = {
  label: '谷时执行',
  off: '已关闭',
  onPeak: '高峰 · {time} 开始',
  onIdle: '当前谷时 · 立即执行',
  tipOff: 'off tip',
  tipOnPeak: 'peak tip {time}',
  tipOnIdle: 'idle tip',
  failed: '切换失败：{message}',
};

let registered = null;
let dictionaries = null;
let effects = [];

const locale = {
  register(ns, dicts) {
    assert.equal(ns, 'offpeak-exec');
    dictionaries = dicts;
    return () => {};
  },
  bind(ns) {
    assert.equal(ns, 'offpeak-exec');
    return (key) => (dicts_zh()[key] ?? key);
  },
};
const dicts_zh = () => dictionaries?.zh ?? zh;

const slots = {
  inject(name, factory) {
    assert.equal(name, 'conversation.input.left');
    factory();
  },
  register(options, component) {
    assert.equal(options.name, 'conversation.input.left');
    assert.equal(options.id, 'offpeak-exec');
    assert.equal(options.order, 25);
    assert.equal(options.locale, 'offpeak-exec');
    assert.equal(typeof options.label(), 'string');
    registered = { options, component };
    return { ...options };
  },
};

const remote = {
  commands: {
    async list() {
      return { ok: true, value: [{ name: 'offpeak', description: '谷时执行：已关闭 (offpeak:off)' }] };
    },
    async execute() {
      return { ok: true, value: { result: { kind: 'success', text: 'x (offpeak:on)' } } };
    },
  },
  $on() {
    return () => {};
  },
};

const ctx = {
  effect(fn, label) {
    effects.push(label);
    return fn();
  },
  locale,
  slots,
};

loaded.module.apply({ ...ctx, remote });

assert.deepEqual(loaded.module.inject, ['slots', 'locale', 'remote', 'remote.commands']);
assert.deepEqual(Object.keys(dictionaries), ['zh', 'en']);
assert.equal(effects[0], 'dsh-offpeak-exec: dictionaries');
assert.ok(registered, 'slot registered');

const tree = registered.component({ sessionId: 'session-1' });
const texts = [];
const tags = [];
function walk(node) {
  if (node === null || node === undefined || node === false) return;
  if (typeof node === 'string' || typeof node === 'number') {
    texts.push(String(node));
    return;
  }
  if (typeof node === 'function') {
    tags.push(node.name || 'anonymous');
    walk(node({}));
    return;
  }
  if (Array.isArray(node)) {
    node.forEach(walk);
    return;
  }
  if (typeof node.type === 'function') {
    tags.push(node.type.name || 'anonymous');
    walk(node.type(node.props));
    return;
  }
  tags.push(node.type);
  walk(node.props?.children);
}
walk(tree);

const all = texts.join(' | ');
console.log('tags:', tags.filter((t) => typeof t === 'string').join(','));
console.log('text:', all);

assert.match(all, /谷时执行/, 'label text renders');
assert.match(all, /已关闭/, 'off-state meta renders');

function findByTag(node, tag) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByTag(child, tag);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node.type === 'function') return findByTag(node.type(node.props), tag);
  if (node.type === tag) return node;
  return findByTag(node.props?.children, tag);
}

const button = findByTag(tree, 'button');
assert.ok(button, 'switch button exists');
assert.equal(button.props.role, 'switch');
assert.equal(button.props['aria-checked'], false);
assert.equal(button.props['data-on'], 'false');
assert.equal(button.props.disabled, false);

const dot = findByTag(tree, 'span');
assert.ok(dot);
console.log('client half: all checks passed');
