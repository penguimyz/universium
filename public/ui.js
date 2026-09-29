/* In-site dialogs that replace the browser's alert/confirm/prompt ("Universium says…").
   All return Promises:
     await ui.confirm({ title, message, confirmText, danger })        → true / false
     await ui.prompt({ title, message, value, placeholder, type, confirmText }) → string / null
     await ui.alert({ title, message, copyText })                      → undefined
   Only one dialog shows at a time; Escape or clicking outside cancels. */
window.ui = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let queue = Promise.resolve();

  function open({ title, message = '', input = null, confirmText = 'OK', cancelText = 'Cancel', danger = false, copyText = null, alertOnly = false }) {
    return new Promise(resolve => {
      const scrim = document.createElement('div');
      scrim.className = 'dlg-scrim';
      scrim.innerHTML = `
        <form class="dlg${danger ? ' danger' : ''}" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
          <h2 id="dlg-t">${esc(title)}</h2>
          ${message ? `<p>${esc(message)}</p>` : ''}
          ${input ? `<input class="field" name="v" type="${input.type || 'text'}" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" autocomplete="${input.type === 'password' ? 'current-password' : 'off'}" spellcheck="false" maxlength="${input.maxlength || 200}">` : ''}
          ${copyText != null ? `<div class="dlg-copy"><code>${esc(copyText)}</code><button type="button" class="btn" data-copy>Copy</button></div>` : ''}
          <div class="dlg-btns">
            ${alertOnly ? '' : `<button type="button" class="btn ghost" data-cancel>${esc(cancelText)}</button>`}
            <button type="submit" class="btn ${danger ? 'danger-fill' : 'primary'}">${esc(confirmText)}</button>
          </div>
        </form>`;
      document.body.appendChild(scrim);
      const form = scrim.querySelector('form'), field = form.querySelector('input');
      const prevFocus = document.activeElement;
      const done = v => {
        document.removeEventListener('keydown', onKey, true);
        scrim.classList.add('out');
        setTimeout(() => scrim.remove(), 150);
        try { prevFocus?.focus?.(); } catch {}
        resolve(v);
      };
      const cancel = () => done(input ? null : alertOnly ? undefined : false);
      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); } };
      document.addEventListener('keydown', onKey, true);
      form.addEventListener('submit', e => { e.preventDefault(); done(input ? field.value : alertOnly ? undefined : true); });
      form.querySelector('[data-cancel]')?.addEventListener('click', cancel);
      scrim.addEventListener('pointerdown', e => { if (e.target === scrim) cancel(); });
      form.querySelector('[data-copy]')?.addEventListener('click', async e => {
        try { await navigator.clipboard.writeText(copyText); e.target.textContent = 'Copied'; }
        catch { const r = document.createRange(); r.selectNodeContents(form.querySelector('.dlg-copy code')); getSelection().removeAllRanges(); getSelection().addRange(r); }
      });
      window.sfx?.open?.();
      setTimeout(() => (field || form.querySelector('[type=submit]')).focus(), 30);
      if (field) field.select();
    });
  }
  // Serialize so two dialogs never stack on top of each other.
  const serial = fn => opts => (queue = queue.then(() => fn(opts), () => fn(opts)));

  return {
    confirm: serial(o => open({ confirmText: 'OK', ...o })),
    prompt: serial(o => open({ confirmText: 'Save', ...o, input: { type: o.type, value: o.value, placeholder: o.placeholder, maxlength: o.maxlength } })),
    alert: serial(o => open({ confirmText: 'Done', ...o, alertOnly: true })),
  };
})();
