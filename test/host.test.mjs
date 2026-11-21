// Host-half integration test with a mock Cordis scope.
import assert from 'node:assert/strict';
import { apply, isPeakBeijing } from '../index.js';

const realNow = Date.now;
const at = (iso) => {
  const t = new Date(iso).getTime();
  Date.now = () => t;
  return t;
};

function makeHarness() {
  const registrations = [];
  const preStep = [];
  const registry = {
    register(definition) {
      registrations.push(definition);
      return () => {
        const index = registrations.indexOf(definition);
        if (index >= 0) registrations.splice(index, 1);
      };
    },
  };
  const scope = {
    commands: registry,
    on(name, handler) {
      if (name === 'agent/pre-step') preStep.push(handler);
      return () => {};
    },
    effect(fn) {
      return fn();
    },
  };
  const agentCtx = {
    inject(deps, callback) {
      assert.deepEqual(deps, ['commands']);
      callback(scope);
    },
  };
  const created = [];
  const rootCtx = {
    on(name, handler) {
      if (name === 'agent/created') created.push(handler);
      return () => {};
    },
    effect(fn) {
      return fn();
    },
  };
  apply(rootCtx);
  assert.equal(created.length, 1, 'apply subscribes to agent/created');
  created[0]({ agent: { ctx: agentCtx } });
  return { registrations, preStep };
}

const { registrations, preStep } = makeHarness();
assert.equal(registrations.length, 1, 'one command registered per agent');
assert.equal(preStep.length, 1, 'one pre-step gate per agent');

const command = () => registrations[registrations.length - 1];

// Off by default, peak window: description advertises the toggle state.
assert.equal(command().name, 'offpeak');
assert.equal(command().definitionId, 'dsh-offpeak-exec');
assert.match(command().description, /\(offpeak:off\)$/);
assert.deepEqual(command().input, { hint: '[on|off|status]' });

// Gate is inert while the switch is off.
at('2026-11-20T10:00:00+08:00');
let nextCalls = 0;
const next = async () => {
  nextCalls += 1;
  return { kind: 'enter', messages: [] };
};
assert.deepEqual(
  await preStep[0]({ step: 1, messages: [{ id: 'm1' }], signal: undefined }, next),
  { kind: 'enter', messages: [] },
);
assert.equal(nextCalls, 1, 'off state never delays');

// Turning it on inside the peak window reports the off-peak start time.
const on = command().handler({ rawInput: 'on' });
assert.equal(on.kind, 'success');
assert.match(on.text, /已开启/);
assert.match(on.text, /12:00/);
assert.match(command().description, /\(offpeak:on\)$/);
assert.equal(registrations.length, 1, 're-registration replaces the previous descriptor');

// Peak + armed + first step: the gate holds and only rejects when cancelled.
const controller = new AbortController();
let settled = false;
const gate = preStep[0]({ step: 1, messages: [{ id: 'm2' }], signal: controller.signal }, next).then((value) => {
  settled = true;
  return value;
});
await new Promise((resolve) => setTimeout(resolve, 300));
assert.equal(settled, false, 'gate waits instead of calling the model');
assert.match(command().description, /已排队/);
assert.match(command().description, /\(offpeak:waiting\)/);
controller.abort(new Error('user stopped'));
assert.deepEqual(await gate, { kind: 'reject' }, 'cancelling the wait quietly ends the turn');
assert.doesNotMatch(command().description, /已排队/, 'the queued marker clears when the wait ends');

// Steps that only continue tool work carry no new messages and are never delayed.
assert.deepEqual(
  await preStep[0]({ step: 2, messages: [], signal: undefined }, next),
  { kind: 'enter', messages: [] },
);

// A follow-up the user sends while the turn is running is gated too.
const followUpController = new AbortController();
let followUpSettled = false;
const followUp = preStep[0]({ step: 3, messages: [{ id: 'm4' }], signal: followUpController.signal }, next).then((value) => {
  followUpSettled = true;
  return value;
});
await new Promise((resolve) => setTimeout(resolve, 300));
assert.equal(followUpSettled, false, 'mid-turn follow-ups wait for off-peak as well');

// Turning the switch off releases a queued message instead of letting it wait out the window.
command().handler({ rawInput: 'off' });
assert.deepEqual(await followUp, { kind: 'enter', messages: [] }, 'switching off releases the queue');
command().handler({ rawInput: 'on' });

// Off-peak: armed but no delay.
at('2026-11-20T22:05:00+08:00');
assert.equal(isPeakBeijing(Date.now()), false);
const status = command().handler({ rawInput: 'status' });
assert.match(status.text, /当前谷时/);

// Toggle/off/unknown input handling.
assert.match(command().handler({ rawInput: '' }).text, /已关闭/);
assert.equal(command().handler({ rawInput: 'yes' }).kind, 'error');
assert.match(command().handler({ rawInput: 'off' }).text, /已关闭/);

Date.now = realNow;
console.log('host half: all checks passed');
// Cancel the pending peak gate so the process can exit.
process.exit(0);
