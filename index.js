/**
 * 谷时执行 (off-peak execution) — Host half.
 *
 * DeepSeek 官方峰谷分时定价（北京时间）：工作日 09:00–12:00、14:00–18:00 为高峰，
 * 其余时间（含周末与法定假日）为谷时，谷时价格减半。
 *
 * 开关打开后，本轮对话在高峰时段发出的任务不会立刻请求模型，而是安静等待到最近的
 * 谷时起点再开始执行——等待期间不产生任何 token 费用。
 */

/** 会话命令名。 */
const COMMAND_NAME = 'offpeak';
const DEFINITION_ID = 'dsh-offpeak-exec';
/** 供客户端从 descriptor / 命令结果里识别开关状态的标记。 */
const TAG_ON = '(offpeak:on)';
const TAG_OFF = '(offpeak:off)';
/** 已在等待谷时：客户端据此显示「已排队」。 */
const TAG_WAITING = '(offpeak:waiting)';
const BEIJING_OFFSET = 8 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 5000;

/**
 * 法定假日与调休补班（北京时间日期）：true = 放假，false = 调休补班（按工作日计价）。
 * 数据与官方峰谷规则一致，表外日期回退到自然周末判断。
 */
const HOLIDAYS_BY_YEAR = new Map([
  [2026, new Map([
    ['2026-01-01', true],
    ['2026-01-02', true],
    ['2026-01-03', true],
    ['2026-01-04', false],
    ['2026-02-14', false],
    ['2026-02-15', true],
    ['2026-02-16', true],
    ['2026-02-17', true],
    ['2026-02-18', true],
    ['2026-02-19', true],
    ['2026-02-20', true],
    ['2026-02-21', true],
    ['2026-02-22', true],
    ['2026-02-23', true],
    ['2026-02-28', false],
    ['2026-04-04', true],
    ['2026-04-05', true],
    ['2026-04-06', true],
    ['2026-05-01', true],
    ['2026-05-02', true],
    ['2026-05-03', true],
    ['2026-05-04', true],
    ['2026-05-05', true],
    ['2026-05-09', false],
    ['2026-06-19', true],
    ['2026-06-20', true],
    ['2026-06-21', true],
    ['2026-09-20', false],
    ['2026-09-25', true],
    ['2026-09-26', true],
    ['2026-09-27', true],
    ['2026-10-01', true],
    ['2026-10-02', true],
    ['2026-10-03', true],
    ['2026-10-04', true],
    ['2026-10-05', true],
    ['2026-10-06', true],
    ['2026-10-07', true],
    ['2026-10-10', false],
  ])],
]);

/** 把真实时间平移到 UTC 字段即北京时间。 */
function shiftToBeijing(timeMs) {
  return new Date(timeMs + BEIJING_OFFSET);
}

function ymdOf(shifted) {
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 北京时间该日是否按工作日计价。 */
function isWorkdayBeijing(shifted, ymd) {
  const table = HOLIDAYS_BY_YEAR.get(Number(ymd.slice(0, 4)));
  const known = table ? table.get(ymd) : undefined;
  if (typeof known === 'boolean') return !known;
  const weekday = shifted.getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/** 当前时刻是否处于 DeepSeek 高峰计价窗口。 */
export function isPeakBeijing(timeMs = Date.now()) {
  const shifted = shiftToBeijing(timeMs);
  if (!isWorkdayBeijing(shifted, ymdOf(shifted))) return false;
  const hour = shifted.getUTCHours();
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

/** 从 timeMs 开始（含）最近的谷时时刻；已在谷时则返回 timeMs 所在分钟。 */
export function nextOffPeakStart(timeMs = Date.now()) {
  let probe = Math.floor(timeMs / 60000) * 60000;
  for (let minute = 0; minute < 4 * 24 * 60; minute += 1) {
    if (!isPeakBeijing(probe)) return probe;
    probe += 60000;
  }
  return timeMs;
}

/** 北京时间 HH:MM。 */
export function formatBeijingTime(timeMs) {
  const shifted = shiftToBeijing(timeMs);
  const hour = String(shifted.getUTCHours()).padStart(2, '0');
  const minute = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

/** 等到 target（或提前滑出高峰窗口、或开关被关闭）。abort 时 reject。 */
function waitForOffPeak(target, signal, stillWanted) {
  return new Promise((resolve, reject) => {
    let timer = null;
    const stop = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      signal?.removeEventListener?.('abort', onAbort);
    };
    const onAbort = () => {
      stop();
      reject(signal.reason ?? new Error('aborted'));
    };
    const tick = () => {
      timer = null;
      if (signal?.aborted) return onAbort();
      const now = Date.now();
      if (now >= target || !isPeakBeijing(now) || (stillWanted && !stillWanted())) {
        stop();
        return resolve();
      }
      timer = setTimeout(tick, Math.min(CHECK_INTERVAL_MS, Math.max(250, target - now)));
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
    tick();
  });
}

export function apply(ctx) {
  ctx.on('agent/created', (payload) => {
    const agent = payload?.agent;
    const actx = agent?.ctx;
    if (!actx || typeof actx.inject !== 'function') return;

    actx.inject(['commands'], (scope) => {
      const registry = scope.commands;
      if (!registry || typeof registry.register !== 'function') return;

      /** 本会话开关状态（常开，直到用户手动关闭或会话结束）。 */
      const state = { armed: false, waiting: false };
      let unregister = null;

      const describe = (now) => {
        if (state.waiting) {
          return `谷时执行：已排队 · 将在北京时间 ${formatBeijingTime(nextOffPeakStart(now))} 自动执行 ${TAG_ON} ${TAG_WAITING}`;
        }
        if (!state.armed) {
          return `谷时执行：已关闭 · 开启后，高峰时段（北京时间工作日 09:00–12:00、14:00–18:00）发出的任务会等到谷时再开始 ${TAG_OFF}`;
        }
        if (isPeakBeijing(now)) {
          return `谷时执行：已开启 · 当前高峰，将在北京时间 ${formatBeijingTime(nextOffPeakStart(now))} 自动开始 ${TAG_ON}`;
        }
        return `谷时执行：已开启 · 当前谷时，任务立即执行 ${TAG_ON}`;
      };

      const sync = () => {
        if (unregister) {
          unregister();
          unregister = null;
        }
        unregister = registry.register({
          definitionId: DEFINITION_ID,
          name: COMMAND_NAME,
          description: describe(Date.now()),
          input: { hint: '[on|off|status]' },
          handler: (invocation) => {
            const raw = String(invocation?.rawInput ?? '').trim().toLowerCase();
            const arg = raw.split(/\s+/).filter(Boolean)[0] ?? '';
            if (arg === '' || arg === 'toggle') state.armed = !state.armed;
            else if (arg === 'on' || arg === '1' || arg === 'true') state.armed = true;
            else if (arg === 'off' || arg === '0' || arg === 'false') state.armed = false;
            else if (arg !== 'status') return { kind: 'error', text: '用法：/offpeak [on|off|status]' };
            sync();
            return { kind: 'success', text: describe(Date.now()) };
          },
        });
      };

      sync();
      scope.effect(() => () => {
        if (unregister) {
          unregister();
          unregister = null;
        }
      }, 'dsh-offpeak-exec: command');

      // 门禁：开关打开、当前处于高峰、且该 step 带入了新的用户消息时，等待谷时。
      scope.effect(() => scope.on('agent/pre-step', async (payload, next) => {
        if (!state.armed) return next();
        // Gate any step that introduces new user input: the turn's first step and
        // mid-turn follow-ups alike. Steps that only continue tool work carry no new
        // messages and must never be held back.
        if (!Array.isArray(payload?.messages) || payload.messages.length === 0) return next();
        const now = Date.now();
        if (!isPeakBeijing(now)) return next();
        const target = nextOffPeakStart(now);
        state.waiting = true;
        sync();
        try {
          await waitForOffPeak(target, payload?.signal, () => state.armed);
        } catch {
          // 用户停止：安静结束本轮。
          return { kind: 'reject' };
        } finally {
          state.waiting = false;
          sync();
        }
        return next();
      }), 'dsh-offpeak-exec: pre-step gate');
    });
  });
}
