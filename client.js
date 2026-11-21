window.__ModuleLoader__.load({
  id: '@local/dsh-offpeak-exec',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'offpeak-exec';
    const COMMAND_NAME = 'offpeak';
    const TAG_ON = '(offpeak:on)';
    const TAG_OFF = '(offpeak:off)';
    const TAG_WAITING = '(offpeak:waiting)';
    const BEIJING_OFFSET = 8 * 60 * 60 * 1000;

    const zh = {
      label: '谷时执行',
      off: '已关闭',
      waiting: '已排队 · {time} 自动执行',
      onPeak: '高峰 · {time} 后自动执行',
      onIdle: '当前谷时 · 立即执行',
      tipOff: '谷时执行已关闭：消息立即开始。开启后，高峰时段发出的消息会等到谷时再开始，价格减半。',
      tipOnPeak: '谷时执行已开启：当前处于 DeepSeek 高峰计价（工作日 09:00–12:00、14:00–18:00）。新消息会在北京时间 {time} 的谷时才发起请求，等待期间不产生费用。点击关闭。',
      tipOnIdle: '谷时执行已开启：当前是谷时（价格减半），消息会立即执行。点击关闭。',
      tipWaiting: '有一条消息正在排队，将在北京时间 {time} 的谷时自动开始，等待期间不计费。点停止可取消；在此关闭开关会立刻放行。绿点：谷时立即执行；黄点：高峰等待。',
      tip: '绿点：谷时立即执行；黄点：高峰等待。',
      failed: '切换失败，请重试',
    };
    const en = {
      label: 'Off-peak run',
      off: 'Off',
      waiting: 'Queued · runs {time}',
      onPeak: 'Peak · runs after {time}',
      onIdle: 'Off-peak now',
      tipOff: 'Off-peak run is off: messages start immediately. When on, a message sent during peak hours waits for off-peak pricing (half price).',
      tipOnPeak: 'Off-peak run is on. DeepSeek peak pricing is active (workdays 09:00–12:00 and 14:00–18:00 Beijing time). A new message starts at {time} Beijing time instead, with no cost while waiting. Click to turn off.',
      tipOnIdle: 'Off-peak run is on. This is off-peak (half price), so messages run immediately. Click to turn off.',
      tipWaiting: 'A message is queued and starts at {time} Beijing time, with no cost while waiting. Stop cancels it; turning this switch off releases it now. Green dot: off-peak. Amber dot: waiting.',
      tip: 'Green dot: off-peak, runs now. Amber dot: waiting for off-peak.',
      failed: 'Switch failed, please retry',
    };

    const css = `
      .dshOffpeakBtn{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;white-space:nowrap;cursor:pointer;transition:background .12s ease,border-color .12s ease,color .12s ease,opacity .12s ease}
      .dshOffpeakBtn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
      .dshOffpeakBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .dshOffpeakBtn:disabled{opacity:.55;cursor:default}
      .dshOffpeakBtn[data-on="true"]{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);color:var(--dsw-alias-label-primary)}
      .dshOffpeakIcon{flex:none;display:block;opacity:.9}
      .dshOffpeakName{font-weight:500}
      .dshOffpeakBtn[data-on="true"] .dshOffpeakName{font-weight:600}
      .dshOffpeakMeta{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
      .dshOffpeakBtn[data-on="true"] .dshOffpeakMeta{color:var(--dsw-alias-label-primary);opacity:.85}
      .dshOffpeakDot{flex:none;width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-state-idle-primary)}
      .dshOffpeakDot[data-state="success"]{background:var(--dsw-alias-state-success-primary)}
      .dshOffpeakDot[data-state="warn"]{background:var(--dsw-alias-state-warn-primary);animation:dshOffpeakPulse 2s ease-in-out infinite}
      @keyframes dshOffpeakPulse{0%,100%{opacity:1}50%{opacity:.45}}
      @media (prefers-reduced-motion:reduce){.dshOffpeakDot[data-state="warn"]{animation:none}}
      .dshOffpeakError{color:var(--dsw-alias-state-error-primary);font-size:11px;margin-left:6px}
    `;

    const HOLIDAYS = {
      '2026': {
        '2026-01-01': true, '2026-01-02': true, '2026-01-03': true, '2026-01-04': false,
        '2026-02-14': false, '2026-02-15': true, '2026-02-16': true, '2026-02-17': true,
        '2026-02-18': true, '2026-02-19': true, '2026-02-20': true, '2026-02-21': true,
        '2026-02-22': true, '2026-02-23': true, '2026-02-28': false,
        '2026-04-04': true, '2026-04-05': true, '2026-04-06': true,
        '2026-05-01': true, '2026-05-02': true, '2026-05-03': true, '2026-05-04': true,
        '2026-05-05': true, '2026-05-09': false,
        '2026-06-19': true, '2026-06-20': true, '2026-06-21': true,
        '2026-09-20': false, '2026-09-25': true, '2026-09-26': true, '2026-09-27': true,
        '2026-10-01': true, '2026-10-02': true, '2026-10-03': true, '2026-10-04': true,
        '2026-10-05': true, '2026-10-06': true, '2026-10-07': true, '2026-10-10': false,
      },
    };

    function shiftToBeijing(timeMs) {
      return new Date(timeMs + BEIJING_OFFSET);
    }

    function ymdOf(shifted) {
      const year = shifted.getUTCFullYear();
      const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
      const day = String(shifted.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    function isWorkdayBeijing(shifted, ymd) {
      const table = HOLIDAYS[ymd.slice(0, 4)];
      const known = table ? table[ymd] : undefined;
      if (typeof known === 'boolean') return !known;
      const weekday = shifted.getUTCDay();
      return weekday !== 0 && weekday !== 6;
    }

    function isPeakBeijing(timeMs) {
      const shifted = shiftToBeijing(timeMs);
      if (!isWorkdayBeijing(shifted, ymdOf(shifted))) return false;
      const hour = shifted.getUTCHours();
      return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
    }

    function nextOffPeakStart(timeMs) {
      let probe = Math.floor(timeMs / 60000) * 60000;
      for (let minute = 0; minute < 4 * 24 * 60; minute += 1) {
        if (!isPeakBeijing(probe)) return probe;
        probe += 60000;
      }
      return timeMs;
    }

    function formatBeijingTime(timeMs) {
      const shifted = shiftToBeijing(timeMs);
      const hour = String(shifted.getUTCHours()).padStart(2, '0');
      const minute = String(shifted.getUTCMinutes()).padStart(2, '0');
      return `${hour}:${minute}`;
    }

    function tagOf(text) {
      const value = String(text ?? '');
      if (value.includes(TAG_ON)) return true;
      if (value.includes(TAG_OFF)) return false;
      return null;
    }

    function format(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) => (
        values[key] === undefined ? match : String(values[key])
      ));
    }

    function MoonIcon() {
      return h('svg', {
        className: 'dshOffpeakIcon', width: 13, height: 13, viewBox: '0 0 16 16',
        'aria-hidden': true, focusable: 'false',
      }, h('path', {
        d: 'M12.9 9.6a5.4 5.4 0 0 1-6.5-6.5A5.7 5.7 0 1 0 12.9 9.6Z',
        fill: 'currentColor',
      }));
    }

    function OffpeakToggle(props) {
      const sessionId = props?.sessionId;
      const remote = props?.remote;
      const t = props?.t;

      const [known, setKnown] = React.useState(false);
      const [on, setOn] = React.useState(false);
      const [waiting, setWaiting] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [now, setNow] = React.useState(() => Date.now());

      const read = React.useCallback(async () => {
        const api = remote?.commands;
        if (api === undefined || typeof api.list !== 'function' || sessionId === undefined || sessionId === null) {
          setKnown(false);
          setOn(false);
          setWaiting(false);
          return;
        }
        try {
          const result = await api.list(sessionId);
          if (!result || result.ok !== true) {
            setKnown(false);
            setOn(false);
            setWaiting(false);
            return;
          }
          const rows = Array.isArray(result.value) ? result.value : [];
          const row = rows.find((entry) => entry && entry.name === COMMAND_NAME);
          if (row === undefined) {
            setKnown(false);
            setOn(false);
            setWaiting(false);
            return;
          }
          const tag = tagOf(row.description);
          setKnown(tag !== null);
          setOn(tag === true);
          setWaiting(String(row.description ?? '').includes(TAG_WAITING));
        } catch (cause) {
          console.debug('[offpeak-exec] read state failed', cause);
          setKnown(false);
          setOn(false);
          setWaiting(false);
        }
      }, [remote, sessionId]);

      // A different conversation always starts from "unknown" until its own state arrives.
      React.useEffect(() => {
        setKnown(false);
        setOn(false);
        setWaiting(false);
        setError('');
      }, [sessionId]);

      React.useEffect(() => {
        read();
      }, [read]);

      React.useEffect(() => {
        const subscribe = remote?.$on;
        if (typeof subscribe !== 'function') return undefined;
        let dispose;
        try {
          dispose = subscribe.call(remote, 'commands/change', () => {
            read();
          });
        } catch (cause) {
          console.debug('[offpeak-exec] subscribe failed', cause);
        }
        return () => {
          if (typeof dispose === 'function') dispose();
        };
      }, [remote, read]);

      React.useEffect(() => {
        const id = setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden === true) return;
          setNow(Date.now());
        }, 20000);
        return () => {
          clearInterval(id);
        };
      }, []);

      const peak = isPeakBeijing(now);
      const target = peak ? nextOffPeakStart(now) : null;
      const at = target === null ? '' : formatBeijingTime(target);

      const toggle = React.useCallback(async () => {
        if (busy || !known) return;
        const api = remote?.commands;
        if (api === undefined || typeof api.execute !== 'function') {
          setError(t('failed'));
          return;
        }
        if (sessionId === undefined || sessionId === null) {
          setError(t('failed'));
          return;
        }
        const next = !on;
        setBusy(true);
        setError('');
        try {
          const result = await api.execute(sessionId, `/${COMMAND_NAME} ${next ? 'on' : 'off'}`, []);
          if (!result || result.ok !== true) {
            throw new Error(result?.error?.message ?? 'RPC failed');
          }
          const tag = tagOf(result?.value?.result?.text);
          setOn(tag === null ? next : tag);
          setKnown(true);
        } catch (cause) {
          console.debug('[offpeak-exec] toggle failed', cause);
          const detail = cause instanceof Error ? cause.message : String(cause);
          setError(`${t('failed')} · ${detail}`);
        } finally {
          setBusy(false);
          setNow(Date.now());
          read();
        }
      }, [busy, known, on, remote, sessionId, read, t]);

      let meta = t('off');
      let tip = t('tipOff');
      let dot = 'idle';
      if (waiting) {
        meta = format(t('waiting'), { time: at });
        tip = format(t('tipWaiting'), { time: at });
        dot = 'warn';
      } else if (on) {
        if (peak && target !== null) {
          meta = format(t('onPeak'), { time: at });
          tip = `${format(t('tipOnPeak'), { time: at })}`;
          dot = 'warn';
        } else {
          meta = t('onIdle');
          tip = t('tipOnIdle');
          dot = 'success';
        }
      }

      const children = [
        h('style', { key: 'style' }, css),
        h('button', {
          key: 'button',
          type: 'button',
          role: 'switch',
          'aria-checked': on,
          'aria-busy': busy,
          'aria-describedby': 'dsh-offpeak-meta',
          'data-on': on ? 'true' : 'false',
          'data-known': known ? 'true' : 'false',
          className: 'dshOffpeakBtn',
          disabled: busy,
          title: tip,
          'aria-label': t('label'),
          onClick: toggle,
        },
        h(MoonIcon, { key: 'icon' }),
        h('span', { key: 'name', className: 'dshOffpeakName' }, t('label')),
        h('span', { key: 'meta', id: 'dsh-offpeak-meta', className: 'dshOffpeakMeta' }, meta),
          h('span', { key: 'dot', className: 'dshOffpeakDot', 'data-state': dot }),
        ),
      ];

      if (error !== '') {
        children.push(h('span', { key: 'error', className: 'dshOffpeakError', role: 'alert' }, error));
      }

      return h('span', { style: { display: 'inline-flex', alignItems: 'center' } }, children);
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.commands'],
      apply(ctx) {
        const locale = ctx.locale;
        const remote = ctx.remote;
        const t = typeof locale?.bind === 'function' ? locale.bind(NS) : (key) => key;

        ctx.effect(() => {
          const dispose = locale?.register?.(NS, { zh, en });
          return () => {
            if (typeof dispose === 'function') dispose();
          };
        }, 'dsh-offpeak-exec: dictionaries');

        ctx.slots.inject('conversation.input.left', () => ctx.slots.register(
          {
            name: 'conversation.input.left',
            id: 'offpeak-exec',
            order: 25,
            label: () => t('label'),
            locale: NS,
          },
          (props) => h(OffpeakToggle, { ...props, remote, t }),
        ));
      },
    };
  },
});
