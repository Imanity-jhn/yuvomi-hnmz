/**
 * Modul: Kinder-Routinen in den Einstellungen
 * Zweck: Pro Person Fotos fuer Morgen/Abend und ein eigener Hintergrund.
 * Abhaengigkeiten: /api.js, /i18n.js, /utils/html.js, /utils/routines.js,
 *                  /utils/image-fit.js, /components/icon-picker.js
 */
import { api } from '/api.js';
import { t } from '/i18n.js';
import { esc } from '/utils/html.js';
import { ROUTINE_TEMPLATES, routineStepImageUrl, routineWallpaperUrl } from '/utils/routines.js';

const STEP_FIT = { maxWidth: 800, maxHeight: 800, maxDataLength: 768 * 1024 };
const WALLPAPER_FIT = { maxWidth: 1920, maxHeight: 1080, maxDataLength: 1_572_864 };

function firstName(displayName) {
  return String(displayName || '').trim().split(/\s+/)[0] || String(displayName || '');
}

function stepRow(step) {
  const photo = routineStepImageUrl(step);
  const preview = photo
    ? `<img src="${esc(photo)}" alt="">`
    : `<i data-lucide="${esc(step.icon)}" aria-hidden="true"></i>`;
  return `
    <li class="routine-edit__step" data-step-id="${esc(String(step.id))}">
      <span class="routine-edit__preview">
        <button type="button" class="routine-edit__icon" data-routine-photo-pick="${esc(String(step.id))}"
            aria-label="${esc(t('settings.routinesPhotoPick'))}">
          ${preview}
        </button>
        ${step.has_image
          ? `<button type="button" class="routine-edit__photo-clear" data-routine-photo-clear="${esc(String(step.id))}"
                aria-label="${esc(t('settings.routinesPhotoRemove'))}">
               <i data-lucide="x" aria-hidden="true"></i>
             </button>`
          : ''}
      </span>
      <span class="routine-edit__copy">
        <input class="form-input" data-routine-title="${esc(String(step.id))}" value="${esc(step.title)}" maxlength="80">
        <label class="routine-edit__show-title">
          <input type="checkbox" data-routine-show-title="${esc(String(step.id))}"${step.show_title ? ' checked' : ''}>
          <span>${esc(t('settings.routinesShowTitle'))}</span>
        </label>
      </span>
      <button type="button" class="btn btn--ghost routine-edit__icon-btn" data-routine-icon="${esc(String(step.id))}"
          aria-label="${esc(t('settings.routinesChooseIcon'))}">
        <i data-lucide="${esc(step.icon)}" aria-hidden="true"></i>
      </button>
      <button type="button" class="btn btn--ghost routine-edit__up" data-routine-up="${esc(String(step.id))}" aria-label="${esc(t('settings.routinesMoveUp'))}">
        <i data-lucide="chevron-up" aria-hidden="true"></i>
      </button>
      <button type="button" class="btn btn--ghost routine-edit__down" data-routine-down="${esc(String(step.id))}" aria-label="${esc(t('settings.routinesMoveDown'))}">
        <i data-lucide="chevron-down" aria-hidden="true"></i>
      </button>
      <button type="button" class="btn btn--ghost" data-routine-delete="${esc(String(step.id))}">${esc(t('settings.routinesDelete'))}</button>
    </li>`;
}

function renderBoard(container, { people, steps }, { userId, period }) {
  const mine = steps
    .filter((s) => Number(s.user_id) === Number(userId) && s.period === period)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const person = people.find((p) => Number(p.id) === Number(userId));
  const wallpaper = routineWallpaperUrl(person);
  const personChips = people.map((p) => {
    const on = Number(p.id) === Number(userId);
    return `<button type="button" class="filter-chip${on ? ' is-active' : ''}" data-routine-person="${esc(String(p.id))}" aria-pressed="${on ? 'true' : 'false'}">${esc(firstName(p.display_name))}</button>`;
  }).join('');

  container.replaceChildren();
  container.insertAdjacentHTML('beforeend', `
    <section class="settings-section">
      <p class="form-hint">${esc(t('settings.pageRoutinesDescription'))}</p>
      <div class="form-group">
        <p class="form-label">${esc(t('settings.routinesPerson'))}</p>
        <div class="filter-chips">${personChips || `<p class="form-hint">${esc(t('settings.routinesEmpty'))}</p>`}</div>
      </div>
      ${userId ? `
      <div class="form-group routine-edit__wallpaper">
        <p class="form-label">${esc(t('settings.routinesWallpaper'))}</p>
        <p class="form-hint">${esc(t('settings.routinesWallpaperHint'))}</p>
        ${wallpaper ? `<img class="routine-edit__wallpaper-img" src="${esc(wallpaper)}" alt="">` : ''}
        <div class="settings-form-actions">
          <button type="button" class="btn btn--secondary" id="routine-wallpaper-pick">${esc(t('settings.routinesWallpaperPick'))}</button>
          ${person?.has_wallpaper
            ? `<button type="button" class="btn btn--ghost" id="routine-wallpaper-clear">${esc(t('settings.routinesWallpaperRemove'))}</button>`
            : ''}
        </div>
      </div>` : ''}
      <div class="sub-tabs" role="tablist">
        <button type="button" class="sub-tab${period === 'morning' ? ' is-active' : ''}" data-routine-period="morning">${esc(t('settings.routinesMorning'))}</button>
        <button type="button" class="sub-tab${period === 'evening' ? ' is-active' : ''}" data-routine-period="evening">${esc(t('settings.routinesEvening'))}</button>
      </div>
      ${mine.length
        ? `<ul class="routine-edit__list">${mine.map(stepRow).join('')}</ul>`
        : `<p class="form-hint">${esc(t('settings.routinesEmpty'))}</p>`}
      <p class="form-hint">${esc(t('settings.routinesMax'))}</p>
      <div class="settings-form-actions">
        <button type="button" class="btn btn--secondary" id="routine-fill">${esc(t('settings.routinesFillTemplate'))}</button>
        <button type="button" class="btn btn--primary" id="routine-add">
          <i data-lucide="plus" aria-hidden="true"></i>
          <span>${esc(t('settings.routinesAdd'))}</span>
        </button>
      </div>
      <input class="sr-only" type="file" id="routine-wallpaper-file" accept="image/png,image/jpeg,image/webp">
      <input class="sr-only" type="file" id="routine-step-photo-file" accept="image/png,image/jpeg,image/webp">
    </section>
  `);
  if (window.lucide) window.lucide.createIcons({ el: container });
}

async function loadBoard() {
  const res = await api.get('/routines');
  return res.data ?? { people: [], steps: [] };
}

async function persistOrder(list) {
  const ids = [...list.querySelectorAll('[data-step-id]')].map((el) => Number(el.dataset.stepId));
  if (!ids.length) return;
  await api.put('/routines/steps/order', { ids });
}

async function fitImage(file, opts) {
  const { readFittedImage } = await import('/utils/image-fit.js');
  return readFittedImage(file, opts);
}

export async function render(container) {
  let board = await loadBoard();
  let userId = board.people[0]?.id ?? null;
  let period = 'morning';
  let photoTargetId = null;

  async function redraw() {
    renderBoard(container, board, { userId, period });
    bind();
  }

  function toast(err) {
    window.yuvomi?.showToast(err.message ?? t('common.unknownError'), 'danger');
  }

  function bind() {
    container.querySelectorAll('[data-routine-person]').forEach((btn) => {
      btn.addEventListener('click', () => {
        userId = Number(btn.dataset.routinePerson);
        redraw();
      });
    });
    container.querySelectorAll('[data-routine-period]').forEach((btn) => {
      btn.addEventListener('click', () => {
        period = btn.dataset.routinePeriod;
        redraw();
      });
    });
    container.querySelector('#routine-add')?.addEventListener('click', async () => {
      if (!userId) return;
      try {
        await api.post('/routines/steps', {
          user_id: userId,
          period,
          title: t('settings.routinesTitlePlaceholder'),
          icon: 'star',
        });
        board = await loadBoard();
        await redraw();
      } catch (err) {
        toast(err);
      }
    });
    container.querySelector('#routine-fill')?.addEventListener('click', async () => {
      if (!userId) return;
      const existing = board.steps.filter((s) => Number(s.user_id) === Number(userId) && s.period === period);
      if (existing.length) {
        board = await loadBoard();
        await redraw();
        return;
      }
      try {
        for (const step of ROUTINE_TEMPLATES[period] || []) {
          await api.post('/routines/steps', {
            user_id: userId,
            period,
            title: t(`routines.${step.key}`),
            icon: step.icon,
          });
        }
        board = await loadBoard();
        await redraw();
      } catch (err) {
        toast(err);
      }
    });
    container.querySelectorAll('[data-routine-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api.delete(`/routines/steps/${btn.dataset.routineDelete}`);
          board = await loadBoard();
          await redraw();
        } catch (err) {
          toast(err);
        }
      });
    });
    container.querySelectorAll('[data-routine-icon]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { openIconPicker } = await import('/components/icon-picker.js');
        const chosen = await openIconPicker(btn.querySelector('[data-lucide]')?.dataset.lucide || 'star');
        if (!chosen) return;
        try {
          await api.patch(`/routines/steps/${btn.dataset.routineIcon}`, { icon: chosen });
          board = await loadBoard();
          await redraw();
        } catch (err) {
          toast(err);
        }
      });
    });
    container.querySelectorAll('[data-routine-title]').forEach((input) => {
      input.addEventListener('change', async () => {
        const title = input.value.trim();
        if (!title) return;
        try {
          await api.patch(`/routines/steps/${input.dataset.routineTitle}`, { title });
        } catch (err) {
          toast(err);
        }
      });
    });
    container.querySelectorAll('[data-routine-show-title]').forEach((input) => {
      input.addEventListener('change', async () => {
        try {
          await api.patch(`/routines/steps/${input.dataset.routineShowTitle}`, {
            show_title: input.checked,
          });
          const step = board.steps.find((s) => Number(s.id) === Number(input.dataset.routineShowTitle));
          if (step) step.show_title = input.checked;
        } catch (err) {
          input.checked = !input.checked;
          toast(err);
        }
      });
    });
    container.querySelectorAll('[data-routine-photo-pick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        photoTargetId = Number(btn.dataset.routinePhotoPick);
        container.querySelector('#routine-step-photo-file')?.click();
      });
    });
    container.querySelector('#routine-step-photo-file')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      const stepId = photoTargetId;
      photoTargetId = null;
      if (!file || !stepId) return;
      try {
        const image_data = await fitImage(file, STEP_FIT);
        await api.patch(`/routines/steps/${stepId}`, { image_data });
        board = await loadBoard();
        await redraw();
      } catch (err) {
        toast(err);
      }
    });
    container.querySelectorAll('[data-routine-photo-clear]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        event.stopPropagation();
        try {
          await api.patch(`/routines/steps/${btn.dataset.routinePhotoClear}`, { image_data: null });
          board = await loadBoard();
          await redraw();
        } catch (err) {
          toast(err);
        }
      });
    });
    container.querySelector('#routine-wallpaper-pick')?.addEventListener('click', () => {
      container.querySelector('#routine-wallpaper-file')?.click();
    });
    container.querySelector('#routine-wallpaper-file')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file || !userId) return;
      try {
        const wallpaper_data = await fitImage(file, WALLPAPER_FIT);
        await api.put(`/routines/people/${userId}`, { wallpaper_data });
        board = await loadBoard();
        await redraw();
      } catch (err) {
        toast(err);
      }
    });
    container.querySelector('#routine-wallpaper-clear')?.addEventListener('click', async () => {
      if (!userId) return;
      try {
        await api.put(`/routines/people/${userId}`, { wallpaper_data: null });
        board = await loadBoard();
        await redraw();
      } catch (err) {
        toast(err);
      }
    });
    const list = container.querySelector('.routine-edit__list');
    container.querySelectorAll('[data-routine-up]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('[data-step-id]');
        const prev = row?.previousElementSibling;
        if (!row || !prev || !list) return;
        list.insertBefore(row, prev);
        try { await persistOrder(list); } catch (err) {
          toast(err);
        }
      });
    });
    container.querySelectorAll('[data-routine-down]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('[data-step-id]');
        const next = row?.nextElementSibling;
        if (!row || !next || !list) return;
        list.insertBefore(next, row);
        try { await persistOrder(list); } catch (err) {
          toast(err);
        }
      });
    });
  }

  await redraw();
}
