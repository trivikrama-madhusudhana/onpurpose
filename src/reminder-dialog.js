/* Isolated reminder dialog. Native top-layer rendering also covers fullscreen. */
(() => {
  'use strict';
  function create(callbacks = {}) {
    const host = document.createElement('div');
    host.id = 'onpurpose-reminder-dialog-host';
    host.className = 'onpurpose-reminder-host';
    const root = host.attachShadow({mode:'open'});
    root.innerHTML = `
      <style>
        :host{all:initial;position:fixed;left:0;top:0;width:0;height:0;--surface:#f7faf8;--text:#17392d;--muted:#465d53;--line:#b8c9bf;--accent:#215c40;--on-accent:#fff;--hover:#e5eee8;color-scheme:light}
        :host([data-theme="dark"]){--surface:#18241f;--text:#edf5f0;--muted:#c0d1c6;--line:#60796b;--accent:#a0e2b9;--on-accent:#102c1b;--hover:#2a3c31;color-scheme:dark}
        *{box-sizing:border-box}dialog{display:none;position:fixed;inset:auto;left:var(--center-x,50vw);top:var(--center-y,50vh);transform:translate(-50%,-50%);margin:0;width:min(470px,calc(100vw - 32px));max-width:none;max-height:calc(100vh - 32px);overflow:auto;padding:28px;border:1px solid var(--line);border-radius:18px;background:var(--surface);color:var(--text);box-shadow:0 20px 70px #0005;font:15px/1.5 system-ui,-apple-system,sans-serif;text-align:left}
        dialog[open]{display:block}dialog::backdrop{background:#0005}.brand{font-size:12px;font-weight:700;letter-spacing:.04em;color:var(--muted);margin:0 36px 16px 0}h2{font:700 23px/1.25 system-ui,-apple-system,sans-serif;margin:0 24px 12px 0}p{margin:0;color:var(--muted);overflow-wrap:anywhere}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:24px}button{font:600 13px/1.4 system-ui,-apple-system,sans-serif;min-height:38px;border:1px solid var(--line);border-radius:8px;padding:9px 12px;background:var(--surface);color:var(--text);cursor:pointer}button:hover{background:var(--hover)}button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}.primary:hover{background:var(--accent);filter:brightness(.94)}.close{position:absolute;right:14px;top:12px;width:34px;min-height:34px;padding:0;border:0;background:transparent;font-size:25px;font-weight:400;line-height:1}[hidden]{display:none!important}
        @media(max-width:500px){dialog{padding:24px}.actions{display:grid}button{width:100%}.close{width:34px}}
      </style>
      <dialog id="reminder-dialog" aria-labelledby="reminder-heading" aria-describedby="reminder-goal">
        <button class="close" id="close-reminder" type="button" aria-label="Close reminder" title="Remind me again later">×</button>
        <div class="brand">OnPurpose</div><h2 id="reminder-heading">Still working on that?</h2><p id="reminder-goal"></p>
        <div class="actions"><button class="primary" id="back-to-goal" type="button" autofocus>Back to my goal</button><button id="video-helps" type="button">This video helps</button><button id="keep-exploring" type="button">Keep exploring</button></div>
      </dialog>`;
    const dialog = root.querySelector('dialog');
    let destroyed = false, shown = false, player = null, fullscreen = null;
    (document.body || document.documentElement).append(host);
    function close() {
      shown = false;
      if (!dialog.open) return;
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    function act(callback) { close(); callback?.(); }
    root.querySelector('#close-reminder').addEventListener('click', () => act(callbacks.onClose));
    root.querySelector('#back-to-goal').addEventListener('click', () => act(callbacks.onBack));
    root.querySelector('#video-helps').addEventListener('click', () => act(callbacks.onHelpful));
    root.querySelector('#keep-exploring').addEventListener('click', () => act(callbacks.onExplore));
    dialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); act(callbacks.onClose); });
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); act(callbacks.onClose); } });
    function position() {
      if (destroyed || !shown) return;
      const width = window.innerWidth, height = window.innerHeight;
      const bounds = !document.fullscreenElement && player?.getBoundingClientRect();
      const usable = bounds && bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < height && bounds.right > 0 && bounds.left < width;
      let x = usable ? bounds.left + bounds.width / 2 : width / 2;
      let y = usable ? bounds.top + bounds.height / 2 : height / 2;
      const box = dialog.getBoundingClientRect();
      const halfWidth = (box.width || Math.min(470, width - 32)) / 2, halfHeight = (box.height || 250) / 2;
      x = Math.max(16 + halfWidth, Math.min(width - 16 - halfWidth, x));
      y = Math.max(16 + halfHeight, Math.min(height - 16 - halfHeight, y));
      dialog.style.setProperty('--center-x', `${x}px`); dialog.style.setProperty('--center-y', `${y}px`);
    }
    function update({show = false, goal = '', canMarkHelpful = false, player:nextPlayer = null} = {}) {
      if (destroyed) return;
      host.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light';
      const goalText = `You came here to ${goal}.`;
      if (root.querySelector('#reminder-goal').textContent !== goalText) root.querySelector('#reminder-goal').textContent = goalText;
      root.querySelector('#video-helps').hidden = !canMarkHelpful;
      player = nextPlayer;
      if (!show) { close(); fullscreen = document.fullscreenElement; return; }
      // A fullscreen transition adds a new top-layer element. Reopen an existing
      // dialog after it so the reminder stays above the fullscreen player.
      if (dialog.open && fullscreen !== document.fullscreenElement) close();
      fullscreen = document.fullscreenElement; shown = true; position();
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') {
          try { dialog.showModal(); } catch { shown = false; return; }
        } else dialog.setAttribute('open',''); // DOM test environments without dialog support.
        position();
        root.querySelector('#back-to-goal').focus({preventScroll:true});
      }
    }
    window.addEventListener('resize', position, {passive:true});
    window.addEventListener('scroll', position, {passive:true});
    return Object.freeze({update, destroy() { if (destroyed) return; close(); destroyed = true; window.removeEventListener('resize',position); window.removeEventListener('scroll',position); host.remove(); }});
  }
  globalThis.OnPurposeReminderDialog = Object.freeze({create});
})();
