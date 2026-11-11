/* ============================================================
 * shell.js — 布局状态控制（顶栏 / 边栏 / 底栏的显隐）
 *
 * 状态写在 <body> 的 data-* 属性上，CSS 负责动画，
 * 因此美术可以在不碰 JS 的前提下改任何视觉效果。
 *
 * 用法：
 *   shell.toggle('sidebar')
 *   shell.set('topbar', false)
 *   shell.get('bottombar')        // 'open' | 'closed'
 *
 * 事件：window 上派发 'shell:change'
 *   detail = { slot, state, states }
 * ============================================================ */

const shell = (() => {
  const SLOTS = ['topbar', 'sidebar', 'bottombar'];
  const STORAGE_KEY = 'fantaui.shell';
  const root = document.body;

  const read = (slot) => (root.dataset[slot] === 'closed' ? 'closed' : 'open');

  const states = () =>
    Object.fromEntries(SLOTS.map((slot) => [slot, read(slot)]));

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(states()));
    } catch {
      /* 隐私模式下忽略 */
    }
  }

  function emit(slot) {
    window.dispatchEvent(
      new CustomEvent('shell:change', {
        detail: { slot, state: read(slot), states: states() },
      }),
    );
  }

  function set(slot, open, { silent = false } = {}) {
    if (!SLOTS.includes(slot)) return;
    root.dataset[slot] = open ? 'open' : 'closed';
    syncAria(slot);
    if (!silent) {
      persist();
      emit(slot);
    }
  }

  function toggle(slot) {
    set(slot, read(slot) === 'closed');
  }

  function syncAria(slot) {
    const open = read(slot) === 'open';
    document.querySelectorAll(`[data-shell-toggle="${slot}"]`).forEach((el) => {
      el.setAttribute('aria-expanded', String(open));
      el.setAttribute('aria-pressed', String(open));
    });
  }

  function restore() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      saved = {};
    }

    SLOTS.forEach((slot) => {
      // 窄屏默认收起边栏，除非用户显式保存过状态
      const fallback = slot === 'sidebar' && window.matchMedia('(max-width: 900px)').matches ? 'closed' : 'open';
      const value = saved[slot] === 'closed' || saved[slot] === 'open' ? saved[slot] : fallback;
      root.dataset[slot] = value;
    });

    SLOTS.forEach(syncAria);
  }

  function bind() {
    // 点击任意带 data-shell-toggle 的元素切换对应栏
    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-shell-toggle]');
      if (!trigger) return;
      toggle(trigger.dataset.shellToggle);
    });

    // 快捷键：Ctrl/Cmd + B → 边栏；Ctrl/Cmd + Shift + T → 顶栏；Ctrl/Cmd + Shift + B → 底栏
    document.addEventListener('keydown', (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'b' && event.shiftKey) {
        event.preventDefault();
        toggle('bottombar');
      } else if (key === 'b') {
        event.preventDefault();
        toggle('sidebar');
      } else if (key === 't' && event.shiftKey) {
        event.preventDefault();
        toggle('topbar');
      }
    });
  }

  restore();
  bind();

  return { SLOTS, get: read, set, toggle, states };
})();
