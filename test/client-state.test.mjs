// Stateful client-half test: ON state, peak meta text, and the click path.
import assert from 'node:assert/strict';

let cursor = 0;
let slots = [];
let effects = [];
let renders = 0;

function createElement(type, props, ...children) {
  return { type, props: { ...(props ?? {}), children } };
}
const React = {
  createElement,
  useState(initial) {
    const index = cursor++;
    if (slots[index] === undefined) slots[index] = typeof initial === 'function' ? initial() : initial;
    const set = (value) => {
      slots[index] = typeof value === 'function' ? value(slots[index]) : value;
    };
    return [slots[index], set];
  },
  useEffect(fn) {
    const index = cursor++;
    effects[index] = fn;
  },
  useCallback(fn) {
    cursor++;
    return fn;
  },
};

let loaded;
globalThis.window = {
  __ModuleLoader__: {
    load({ id, factory }) {
      loaded = { id, module: factory((name) => {
        if (name === 'react') return React;
        throw new Error(`unexpected require: ${name}`);
      }) };
    },
  },
};

const realNow = Date.now;
// Friday 2026-11-20 10:00 Beijing = 02:00 UTC.
const PEAK = Date.UTC(2026, 10, 20, 2, 0, 0);
Date.now = () => PEAK;

await import(new URL('../client.js', import.meta.url).href);

const dict_by_ns = new Map();
let registered = null;
let hostArmed = true;
const remote = {
  commands: {
    listCalls: 0,
    async list() {
      remote.commands.listCalls += 1;
      return {
        ok: true,
        value: [{
          name: 'offpeak',
          description: hostArmed
            ? '谷时执行：已开启 · 当前高峰，将在北京时间 12:00 开始 (offpeak:on)'
            : '谷时执行：已关闭 (offpeak:off)',
        }],
      };
    },
    calls: [],
    async execute(sessionId, line, attachments) {
      remote.commands.calls.push({ sessionId, line, attachments });
      hostArmed = line.endsWith(' on');
      return {
        ok: true,
        value: {
          result: {
            kind: 'success',
            text: hostArmed ? '谷时执行：已开启 (offpeak:on)' : '谷时执行：已关闭 (offpeak:off)',
          },
        },
      };
    },
  },
  $on() {
    return () => {};
  },
};

const ctx = {
  effect(fn) {
    return fn();
  },
  locale: {
    register(ns, dicts) {
      dict_by_ns.set(ns, dicts);
      return () => {};
    },
    bind(ns) {
      return (key) => dict_by_ns.get(ns)?.zh?.[key] ?? key;
    },
  },
  slots: {
    inject(name, factory) {
      factory();
    },
    register(options, component) {
      registered = { options, component };
      return { ...options };
    },
  },
};

loaded.module.apply({ ...ctx, remote });

function expand(node) {
  if (node === null || node === undefined || node === false) return node;
  if (typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(expand);
  if (typeof node.type === 'function') return expand(node.type(node.props));
  return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
}

function render() {
  cursor = 0;
  renders += 1;
  effects = [];
  const raw = registered.component({ sessionId: 'session-1' });
  const tree = expand(raw);
  const pending = [];
  for (const fn of effects) {
    if (typeof fn !== 'function') continue;
    const value = fn();
    pending.push(value && typeof value.then === 'function' ? value : Promise.resolve());
  }
  return { tree, pending };
}

function texts(node, out = []) {
  if (node === null || node === undefined || node === false) return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => texts(child, out));
    return out;
  }
  texts(node.props?.children, out);
  return out;
}

function find(node, tag) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, tag);
      if (hit) return hit;
    }
    return null;
  }
  if (node.type === tag) return node;
  return find(node.props?.children, tag);
}

// First paint: OFF.
let { tree, pending } = render();
assert.equal(find(tree, 'button').props['data-on'], 'false');
assert.match(texts(tree).join('|'), /已关闭/);

// Let the mounted reader resolve, then repaint: ON (peak).
await Promise.all(pending);
await new Promise((resolve) => setTimeout(resolve, 20));
({ tree } = render());
await new Promise((resolve) => setTimeout(resolve, 20));
({ tree } = render());

const button = find(tree, 'button');
const all = texts(tree).join('|');
console.log('render after read:', all);
console.log('list calls:', remote.commands.listCalls, 'slots:', JSON.stringify(slots));
assert.equal(button.props['data-on'], 'true');
assert.match(all, /谷时执行/);
assert.match(all, /高峰 · 12:00 后自动执行/);
assert.equal(button.props['aria-checked'], true);
assert.match(button.props.title, /18:00|12:00/);

// Click path: executes /offpeak off and parses the returned tag.
await button.props.onClick();
({ tree } = render());
const after = texts(tree).join('|');
assert.equal(remote.commands.calls.length, 1);
assert.equal(remote.commands.calls[0].line, '/offpeak off');
assert.equal(find(tree, 'button').props['data-on'], 'false');
assert.match(after, /已关闭/);

Date.now = realNow;
console.log(`client half (stateful): ${renders} renders, all checks passed`);
// The mounted switch keeps a refresh interval; stop the process explicitly.
process.exit(0);
