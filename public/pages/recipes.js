/**
 * Modul: Rezepte (Recipes)
 * Zweck: Gespeicherte Rezepte verwalten und in den Essensplan uebernehmen
 */

import { api } from '/api.js';
import { t, formatDate, formatDateInput, parseDateInput, isDateInputValid } from '/i18n.js';
import { esc } from '/utils/html.js';
import { openModal as openSharedModal, closeModal as closeSharedModal, selectModal, advancedSection, wireBlurValidation, reportFieldError } from '/components/modal.js';
import { DEFAULT_CATEGORY_NAME } from '/utils/shopping-categories.js';
import { renderKitchenTabsBar, refreshKitchenBadges } from '/utils/kitchen-tabs.js';
import { popoverMenuHtml, installPopoverMenus } from '/utils/popover-menu.js';
import { ingredientRowHTML } from '/utils/ingredient-row.js';
import { scheduleUndoableDelete } from '/utils/ux.js';
import { normalizeRecipeMealTypes, RECIPE_MEAL_TYPE_KEYS } from '/utils/recipe-meal-types.js';
import { mealPayloadFromRecipe } from '/utils/recipe-to-meal.js';
import { toLocalDateKey } from '/utils/date.js';
import '/components/datepicker.js';
import { renderSkeletonList } from '/utils/skeleton.js';
import { mountEmptyState } from '/utils/empty-state.js';

let _container = null;

const state = {
  recipes: [],
  categories: [],
  // Einkaufslisten für „Auf die Einkaufsliste": nur die Auswahl, keine Artikel.
  lists: [],
  query: '',
};

// Client-seitige Suche über Titel, Notizen und Zutaten (Audit A1-21):
// die Rezeptliste ist vollständig geladen, ein Server-Roundtrip wäre Umweg.
function filteredRecipes() {
  const q = state.query.toLowerCase();
  if (!q) return state.recipes;
  return state.recipes.filter((r) =>
    r.title?.toLowerCase().includes(q)
    || r.notes?.toLowerCase().includes(q)
    || (r.ingredients ?? []).some((i) => i.name?.toLowerCase().includes(q)));
}

function mealCategories() {
  return state.categories.filter((c) => c.name !== 'Haushalt' && c.name !== 'Drogerie');
}

function mealTypeOptions() {
  return [
    { key: 'breakfast', label: t('meals.typeBreakfast') },
    { key: 'lunch', label: t('meals.typeLunch') },
    { key: 'dinner', label: t('meals.typeDinner') },
    { key: 'snack', label: t('meals.typeSnack') },
  ];
}

async function loadRecipes() {
  const res = await api.get('/recipes');
  state.recipes = res.data;
}

async function loadCategories() {
  try {
    const res = await api.get('/shopping/categories');
    state.categories = res.data;
  } catch {
    state.categories = [];
  }
}

// Ist das Einkaufsmodul deaktiviert oder gibt es keine Liste, bleibt state.lists
// leer und die Karte zeigt die Übernahme-Aktion gar nicht erst an.
async function loadShoppingLists() {
  if (window.yuvomi?.isModuleDisabled?.('shopping')) {
    state.lists = [];
    return;
  }
  try {
    const res = await api.get('/shopping');
    state.lists = res.data ?? [];
  } catch {
    state.lists = [];
  }
}

export async function render(container) {
  _container = container;

  const page = document.createElement('div');
  page.className = 'recipes-page';

  // sr-only Titel: die geteilte Kitchen-Tabs-Leiste labelt das Modul bereits
  // sichtbar — konsistent mit Mahlzeiten/Einkauf. Der FAB ist die einzige
  // Create-Affordanz (kein redundanter sichtbarer Kopf-Titel mehr).
  const title = document.createElement('h1');
  title.className = 'sr-only';
  title.textContent = t('nav.recipes');

  // Suchfeld über der Liste: Rezepte waren als einziges Kitchen-Modul nicht
  // durchsuchbar (Audit A1-21).
  // Kanonischer Kopf in der Gruppen-Variante: --in-group gibt Akzentstreifen und
  // oberste Sticky-Position an die .kitchen-tabs-bar darüber ab, die beides schon
  // trägt. Genau der Doppelstreifen aus Issue #577 war der Grund, warum diese
  // Zeile vorher als eigene .recipes-toolbar gebaut war - mit dem Ergebnis, dass
  // alle vier Küchen-Tabs eine andere Kopf-Grammatik hatten (Critique
  // 2026-07-29). Die Variante löst den Konflikt, ohne den Kopf zu meiden.
  const toolbar = document.createElement('div');
  toolbar.className = 'page-toolbar page-toolbar--in-group';
  const center = document.createElement('div');
  center.className = 'page-toolbar__center';
  const searchWrap = document.createElement('div');
  searchWrap.className = 'recipes-search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'form-input recipes-search__input';
  searchInput.id = 'recipes-search';
  searchInput.placeholder = t('recipes.searchPlaceholder');
  searchInput.setAttribute('aria-label', t('recipes.searchPlaceholder'));
  searchInput.addEventListener('input', () => {
    state.query = searchInput.value.trim();
    renderRecipeList();
  });
  searchWrap.appendChild(searchInput);
  center.appendChild(searchWrap);
  toolbar.appendChild(center);

  const list = document.createElement('div');
  list.className = 'kitchen-list recipes-list';
  list.id = 'recipes-list';
  // Lade-Skeleton bis loadRecipes() aufgelöst ist (Router blendet den Wrapper
  // bereits vor dem Daten-await ein).
  list.setAttribute('aria-busy', 'true');
  list.insertAdjacentHTML('beforeend', renderSkeletonList({ rows: 5, lines: 2 }));
  // Kein wireScrollFade mehr: die Liste kachelt nicht länger mit 320px-Mindest-
  // breite, sondern ist eine Zeilenliste in der 720er-Lesespalte. Der frühere
  // 32px-Überlauf bei 320px war eine Eigenschaft des Rasters und ist mit ihm weg.

  const fab = document.createElement('button');
  fab.className = 'page-fab';
  fab.type = 'button';
  fab.id = 'fab-new-recipe';
  fab.setAttribute('aria-label', t('recipes.addRecipe'));
  const fabIcon = document.createElement('i');
  fabIcon.dataset.lucide = 'plus';
  fabIcon.setAttribute('aria-hidden', 'true');
  fab.appendChild(fabIcon);

  page.append(title, toolbar, list, fab);
  container.replaceChildren(page);
  renderKitchenTabsBar(container, '/recipes');
  // Positionierung und Schliessen der Zeilen-Ueberlaufmenues. Idempotent, haengt an
  // der stabilen Seitenwurzel - die Liste darin wird bei jedem Filter neu gebaut.
  installPopoverMenus(page);

  if (window.lucide) window.lucide.createIcons({ el: container });

  await Promise.all([loadRecipes(), loadCategories(), loadShoppingLists()]);
  renderRecipeList();

  fab.addEventListener('click', () => openRecipeModal('create'));

  list.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;

    // Aufklappen: der Zustand lebt am Button (aria-expanded) und am Panel
    // (hidden). `hidden` statt max-height-Transition, weil ein per Transition
    // versteckter Inhalt in headless-Renderern und auf inaktiven Tabs nie
    // erscheint - der Reveal muss einen sichtbaren Default verbessern, nicht
    // Sichtbarkeit an eine Animation binden.
    if (actionBtn.dataset.action === 'toggle-detail') {
      const panel = _container?.querySelector(`#recipe-detail-${actionBtn.dataset.id}`);
      if (!panel) return;
      const open = actionBtn.getAttribute('aria-expanded') === 'true';
      actionBtn.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
      return;
    }

    const recipeId = Number(actionBtn.dataset.id);
    const recipe = state.recipes.find((r) => r.id === recipeId);
    if (!recipe) return;

    if (actionBtn.dataset.action === 'edit') {
      openRecipeModal('edit', recipe);
      return;
    }

    if (actionBtn.dataset.action === 'delete') {
      await removeRecipe(recipe);
      return;
    }

    if (actionBtn.dataset.action === 'duplicate') {
      await duplicateRecipe(recipe);
      return;
    }

    if (actionBtn.dataset.action === 'to-shopping') {
      await transferRecipe(recipe, actionBtn);
      return;
    }

    if (actionBtn.dataset.action === 'add-to-meals') {
      await planRecipe(recipe, actionBtn);
    }
  });

  // Kein eigener keydown-Handler mehr: das Aufklappen sitzt auf einem echten
  // <button>, der Enter und Space von sich aus verarbeitet. Der frühere Handler
  // gehörte zur Karte, die role="button" trug und damit ein Bedienelement mit
  // Bedienelementen darin war.
}

function renderRecipeList() {
  const list = _container.querySelector('#recipes-list');
  if (!list) return;
  list.removeAttribute('aria-busy');

  list.replaceChildren();

  if (!state.recipes.length) {
    // Geteilter Renderer (utils/empty-state.js): erzwingt Reihenfolge und
    // ARIA-Rolle. Vorher fehlte hier als einzigem Küchen-Leerzustand das Icon.
    mountEmptyState(list, {
      icon: 'book-text',
      title: t('recipes.emptyTitle'),
      description: t('recipes.emptyDescription'),
      hint: t('emptyHint.recipes'),
      action: {
        label: t('recipes.emptyAction'),
        icon: 'plus',
        onClick: () => document.querySelector('.page-fab')?.click(),
      },
    });
    return;
  }

  const visible = filteredRecipes();
  if (!visible.length) {
    // Geteilter Renderer, Variante 'no-results' (role="status", sekundärer CTA).
    // Vorher war das hier ein nacktes <p class="recipes-search-empty"> - die eine
    // Stelle im Modul, die den erzwingenden Baustein umging, während die
    // Schwester im Vorrat im identischen Zustand Icon, Überschrift, den
    // Suchbegriff und einen Zurücksetzen-Pfad lieferte (Critique 2026-07-30).
    mountEmptyState(list, {
      variant: 'no-results',
      title: t('recipes.noResultsTitle'),
      description: t('recipes.searchNoResults'),
      hint: state.query ? `„${state.query}"` : undefined,
      action: {
        // Geteilter Key: „Suche leeren" existiert in allen 23 Locales. Der
        // Vorrat sagt „Suche und Filter zurücksetzen", weil er beides hat -
        // Rezepte haben nur die Suche, und das Label soll nicht mehr versprechen
        // als es tut.
        label: t('common.searchClear'),
        onClick: () => {
          state.query = '';
          const search = _container?.querySelector('#recipes-search');
          if (search) search.value = '';
          renderRecipeList();
          search?.focus();
        },
      },
    });
    return;
  }

  // Eine Zeilenliste, keine Kacheln: das Kartenraster war der letzte Tab mit
  // eigener Zeilen-Grammatik (20px Radius, 408px Höhe, drei CTA-Grundlinien,
  // 48px Bodenversatz in derselben Rasterzeile). Als Zeile teilt es Fläche,
  // Trennlinie, Textspalte und Bedienzone mit Einkauf und Vorrat.
  const rows = document.createElement('ul');
  rows.className = 'kitchen-rows';

  for (const recipe of visible) {
    const ingredients = recipe.ingredients ?? [];
    const detailId = `recipe-detail-${recipe.id}`;
    const hasDetail = Boolean(ingredients.length || recipe.notes || recipe.recipe_url);

    const li = document.createElement('li');
    li.className = 'recipe-row-item';
    li.dataset.id = String(recipe.id);

    const row = document.createElement('div');
    row.className = 'kitchen-row recipe-row';

    // Kanonisches Accordion-Muster: Überschrift umschließt den Button. Die
    // Überschrift trägt die Dokumentstruktur, der Button den Zustand - vorher
    // war die ganze Karte ein role="button" MIT Buttons darin, was für
    // Hilfsmittel ein verschachteltes Bedienelement ist.
    const heading = document.createElement('h2');
    heading.className = 'kitchen-row__main recipe-row__heading';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'kitchen-row__main--interactive recipe-row__toggle';
    toggle.dataset.action = 'toggle-detail';
    toggle.dataset.id = String(recipe.id);

    const name = document.createElement('span');
    name.className = 'kitchen-row__name';
    name.textContent = recipe.title;
    toggle.appendChild(name);

    // Die Zutatenzahl ersetzt das frühere „+N": dort stand ein <li> mit
    // cursor: pointer, ohne role, ohne tabindex, ohne aria-expanded, dessen
    // Klick nachweislich nichts tat (Kartenhöhe 408 → 408px an sechs Karten
    // gemessen, Critique 2026-07-30). Jetzt ist die Zahl die Beschriftung
    // dessen, was das Aufklappen zeigt.
    if (ingredients.length) {
      const meta = document.createElement('span');
      meta.className = 'kitchen-row__meta';
      meta.textContent = t('meals.ingredientCount', { count: ingredients.length });
      toggle.appendChild(meta);
    }

    if (hasDetail) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', detailId);
      toggle.insertAdjacentHTML('beforeend',
        '<i data-lucide="chevron-down" class="icon-sm recipe-row__chevron" aria-hidden="true"></i>');
    } else {
      // Ohne Detail kein Versprechen: kein Chevron, kein aria-expanded. Der
      // Button öffnet dann direkt das Bearbeiten-Formular.
      toggle.dataset.action = 'edit';
    }

    heading.appendChild(toggle);
    row.appendChild(heading);

    const ROW_ACTIONS = [
      { action: 'edit',      icon: 'pencil',  label: t('common.edit') },
      { action: 'duplicate', icon: 'copy',    label: t('recipes.duplicate') },
      { action: 'delete',    icon: 'trash-2', label: t('common.delete'), danger: true },
    ];

    const actions = document.createElement('div');
    actions.className = 'kitchen-row__actions';

    // Drei Zeilenaktionen kosten 152px von 262px Zeilenbreite bei 320px - 58% der
    // Zeile für Sekundäraktionen. Für den Namen blieben 98px, und weil er in einem
    // Flex-Elternteil steht, fiel er auf min-content: 8px, Zeilenhöhe 448px
    // (Critique 2026-07-30, P0).
    //
    // Unter 30rem Zeilenbreite wandern sie deshalb in dasselbe Überlaufmenü, das der
    // Einkaufs-Kopf benutzt - mit Labels, und ein 48px-Trigger statt drei Knöpfen.
    // Die Container-Query dazu steht in recipes.css; hier stehen beide Fassungen im
    // DOM, CSS entscheidet. Dieselbe Mechanik wie beim Kopf: `display: none` nimmt
    // die ungenutzte Fassung auch aus der Tabfolge.
    const inline = document.createElement('div');
    inline.className = 'recipe-row__inline-actions';
    for (const a of ROW_ACTIONS) {
      const btn = document.createElement('button');
      btn.className = `row-action${a.danger ? ' row-action--danger' : ''}`;
      btn.type = 'button';
      btn.dataset.action = a.action;
      btn.dataset.id = String(recipe.id);
      btn.setAttribute('aria-label', `${a.label}: ${recipe.title}`);
      btn.title = a.label;
      btn.insertAdjacentHTML('beforeend',
        `<i data-lucide="${a.icon}" class="icon-md" aria-hidden="true"></i>`);
      inline.appendChild(btn);
    }
    actions.appendChild(inline);

    const more = document.createElement('div');
    more.className = 'recipe-row__more';
    more.insertAdjacentHTML('beforeend', popoverMenuHtml({
      id: `recipe-menu-${recipe.id}`,
      label: t('common.moreActions'),
      triggerClass: 'row-action',
      items: ROW_ACTIONS.map((a) => ({ ...a, id: recipe.id })),
    }));
    actions.appendChild(more);

    row.appendChild(actions);
    li.appendChild(row);

    if (hasDetail) {
      const detail = document.createElement('div');
      detail.className = 'recipe-detail';
      detail.id = detailId;
      detail.hidden = true;

      const mealTypes = normalizeRecipeMealTypes(recipe.meal_types);
      // Chips nur, wenn sie unterscheiden: gilt ein Rezept für alle Mahlzeiten,
      // ist die volle Chip-Reihe reine Ornamentik (Audit A1-21).
      if (mealTypes.length && mealTypes.length < mealTypeOptions().length) {
        const badges = document.createElement('div');
        badges.className = 'recipe-card__meal-types';
        badges.replaceChildren(...mealTypeOptions()
          .filter((option) => mealTypes.includes(option.key))
          .map((option) => {
            const badge = document.createElement('span');
            badge.className = `meal-type-badge meal-type-badge--${option.key}`;
            badge.textContent = option.label;
            return badge;
          }));
        detail.appendChild(badges);
      }

      // VOLLSTÄNDIGE Zutatenliste, nicht die ersten vier: das Kürzen war nur
      // nötig, um die Kartenhöhe zu bändigen. Ein Detail, das sich öffnet, hat
      // keinen Grund, etwas zu verschweigen.
      if (ingredients.length) {
        const ul = document.createElement('ul');
        ul.className = 'recipe-detail__ingredients';
        for (const ing of ingredients) {
          const item = document.createElement('li');
          item.className = 'recipe-detail__ingredient';
          item.textContent = ing.quantity ? `${ing.quantity} · ${ing.name}` : ing.name;
          ul.appendChild(item);
        }
        detail.appendChild(ul);
      }

      if (recipe.notes) {
        const notes = document.createElement('p');
        notes.className = 'recipe-detail__notes';
        notes.textContent = recipe.notes;
        detail.appendChild(notes);
      }

      // Die beiden Kreislauf-Ausgänge stehen im Detail, nicht in der Zeile, und
      // sind dort BESCHRIFTET. Grund: derselbe Weg hieß im Modul dreimal etwas
      // anderes - ein 24px-Glyph im Essensplan, ein 48px-Glyph im Vorrat, ein
      // 167px-Pill in den Rezepten (Critique 2026-07-30). Und man entscheidet
      // sich fürs Einplanen, nachdem man gesehen hat, was drin ist. Der Preis
      // ist ein zusätzlicher Tap für den häufigsten Weg; die Zeile bleibt dafür
      // scanbar und auf 393px ohne fünf konkurrierende Bedienelemente.
      const detailActions = document.createElement('div');
      detailActions.className = 'recipe-detail__actions';

      const addToMeals = document.createElement('button');
      addToMeals.className = 'btn btn--primary';
      addToMeals.type = 'button';
      addToMeals.dataset.action = 'add-to-meals';
      addToMeals.dataset.id = String(recipe.id);
      addToMeals.textContent = t('recipes.addToMeals');
      detailActions.appendChild(addToMeals);

      if (state.lists.length && ingredients.length) {
        const addToShopping = document.createElement('button');
        addToShopping.className = 'btn btn--secondary';
        addToShopping.type = 'button';
        addToShopping.dataset.action = 'to-shopping';
        addToShopping.dataset.id = String(recipe.id);
        addToShopping.textContent = t('common.toShoppingList');
        detailActions.appendChild(addToShopping);
      }

      if (recipe.recipe_url) {
        const link = document.createElement('a');
        link.className = 'btn btn--ghost';
        link.href = recipe.recipe_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.insertAdjacentHTML('beforeend',
          '<i data-lucide="external-link" class="icon-sm" aria-hidden="true"></i>');
        const linkLabel = document.createElement('span');
        linkLabel.textContent = t('recipes.openLink');
        link.appendChild(linkLabel);
        detailActions.appendChild(link);
      }

      detail.appendChild(detailActions);
      li.appendChild(detail);
    }

    rows.appendChild(li);
  }

  list.appendChild(rows);

  if (window.lucide) window.lucide.createIcons({ el: list });
}

/* ENTFERNT: openRecipeReadModal (Nur-Lese-Modal fürs Kochen, Audit A1-21).
 *
 * Es zeigte volle Zutatenliste, Notizen und Link - genau das, was jetzt das
 * Aufklapp-Detail der Zeile zeigt, nur ohne Kontextverlust, ohne Overlay und
 * ohne einen zweiten Weg zur selben Information (Kriterium aus distill:
 * „wenn es woanders steht, wiederhole es nicht"). Sein Auslöser war zusätzlich
 * eine Karte mit role="button", die Buttons enthielt.
 *
 * Der Zweck bleibt erfüllt: Lesen erzwingt weiter kein Bearbeiten-Formular.
 */

function openRecipeModal(mode, recipe = null) {
  const isEdit = mode === 'edit';

  openSharedModal({
    title: isEdit ? t('recipes.editRecipe') : t('recipes.addRecipe'),
    size: 'md',
    content: `
      <div class="form-group">
        <label class="form-label" for="recipe-title">${t('common.nameLabel')}</label>
        <input id="recipe-title" class="form-input" type="text" required placeholder="${t('recipes.titlePlaceholder')}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('meals.mealTypeLabel')}</label>
        <div class="recipe-meal-types" id="recipe-meal-types">
          ${mealTypeOptions().map((option) => `
            <label class="form-check recipe-meal-types__option">
              <input type="checkbox" value="${option.key}" checked>
              <span class="meal-type-badge meal-type-badge--${option.key}">${option.label}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('recipes.ingredientsLabel')}</label>
        <div class="recipe-ingredient-list" id="recipe-ingredient-list"></div>
        <button class="btn btn--secondary recipe-add-ingredient" type="button" id="recipe-add-ingredient">${t('meals.addIngredient')}</button>
      </div>
      ${advancedSection(`
        <div class="form-group">
          <label class="form-label" for="recipe-notes">${t('recipes.notesLabel')}</label>
          <textarea id="recipe-notes" class="form-input" rows="3" placeholder="${t('recipes.notesPlaceholder')}"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="recipe-url">${t('recipes.urlLabel')}</label>
          <input id="recipe-url" class="form-input" type="url" placeholder="${t('recipes.urlPlaceholder')}">
        </div>`,
        { open: isEdit && (!!recipe.notes || !!recipe.recipe_url) })}
      <div class="modal-panel__footer modal-panel__footer--plain">
        <button class="btn btn--secondary" id="recipe-cancel">${t('common.cancel')}</button>
        <button class="btn btn--primary" id="recipe-save">${isEdit ? t('common.save') : t('common.add')}</button>
      </div>
    `,
    onSave(panel) {
      panel.querySelector('#recipe-title').value = isEdit ? recipe.title : '';
      panel.querySelector('#recipe-notes').value = isEdit && recipe.notes ? recipe.notes : '';
      panel.querySelector('#recipe-url').value = isEdit && recipe.recipe_url ? recipe.recipe_url : '';
      const selectedMealTypes = normalizeRecipeMealTypes(isEdit ? recipe.meal_types : RECIPE_MEAL_TYPE_KEYS);
      panel.querySelectorAll('#recipe-meal-types input[type="checkbox"]').forEach((input) => {
        input.checked = selectedMealTypes.includes(input.value);
      });

      const ingList = panel.querySelector('#recipe-ingredient-list');
      if (isEdit && recipe.ingredients?.length) {
        ingList.insertAdjacentHTML('beforeend', recipe.ingredients.map((i) => ingredientRowHTML({
          name: i.name,
          quantity: i.quantity ?? '',
          category: i.category ?? DEFAULT_CATEGORY_NAME,
          categories: mealCategories(),
        })).join(''));
      }

      panel.querySelector('#recipe-add-ingredient')?.addEventListener('click', () => {
        ingList.insertAdjacentHTML('beforeend', ingredientRowHTML({ categories: mealCategories() }));
        if (window.lucide) window.lucide.createIcons({ el: ingList });
      });

      ingList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="remove-ingredient"]');
        if (!btn) return;
        btn.closest('.ingredient-row')?.remove();
      });

      panel.querySelector('#recipe-cancel')?.addEventListener('click', closeModal);
      panel.querySelector('#recipe-save')?.addEventListener('click', () => saveRecipe(panel, mode, recipe));
      // Pflichtfelder melden sich beim Verlassen inline (geteiltes Muster).
      wireBlurValidation(panel);

      if (window.lucide) window.lucide.createIcons({ el: panel });
    },
  });
}

function closeModal({ force = false } = {}) {
  closeSharedModal({ force });
}

async function saveRecipe(panel, mode, recipe) {
  const saveBtn = panel.querySelector('#recipe-save');
  const title = panel.querySelector('#recipe-title')?.value.trim() || '';
  const notes = panel.querySelector('#recipe-notes')?.value.trim() || null;
  const recipe_url = panel.querySelector('#recipe-url')?.value.trim() || null;
  const meal_types = [...panel.querySelectorAll('#recipe-meal-types input[type="checkbox"]:checked')].map((input) => input.value);

  if (!title) {
    // Fehler am Feld statt als ortloser Toast (geteiltes Muster, Critique P1).
    reportFieldError(panel.querySelector('#recipe-title'), t('common.nameRequired'));
    return;
  }

  const ingredients = [];
  panel.querySelectorAll('.ingredient-row').forEach((row) => {
    const name = row.querySelector('.ingredient-row__name')?.value.trim() || '';
    const quantity = row.querySelector('.ingredient-row__qty')?.value.trim() || null;
    const category = row.querySelector('.ingredient-row__cat')?.value || DEFAULT_CATEGORY_NAME;
    if (name) ingredients.push({ name, quantity, category });
  });

  saveBtn.disabled = true;

  try {
    if (mode === 'create') {
      const res = await api.post('/recipes', { title, notes, recipe_url, meal_types, ingredients });
      state.recipes.push(res.data);
    } else {
      const res = await api.put(`/recipes/${recipe.id}`, { title, notes, recipe_url, meal_types, ingredients });
      const idx = state.recipes.findIndex((r) => r.id === recipe.id);
      if (idx >= 0) state.recipes[idx] = res.data;
    }

    closeModal({ force: true });
    renderRecipeList();
    window.yuvomi?.showToast(mode === 'create' ? t('recipes.created') : t('recipes.updated'), 'success');
  } catch (err) {
    saveBtn.disabled = false;
    window.yuvomi?.showToast(err.data?.error ?? t('common.errorGeneric'), 'danger');
  }
}

// --------------------------------------------------------
// Zutaten → Einkaufsliste
// --------------------------------------------------------

/**
 * Übernimmt die Zutaten eines Rezepts auf eine Einkaufsliste. Bei genau einer
 * Liste ohne Rückfrage, sonst über die geteilte Auswahl - dasselbe Muster wie
 * transferMeal() im Essensplan, damit sich der Weg in beiden Modulen gleich
 * anfühlt. Der Server überspringt Zutaten, die schon unabgehakt auf der Liste
 * liegen; die Rückmeldung nennt beide Zahlen.
 */
/**
 * Rezept in den Essensplan übernehmen: fragt „Für wann?" hier und legt die
 * Mahlzeit direkt an.
 *
 * Vorher navigierte dieser Weg auf `/meals?recipe=<id>`, wo ein Formular mit 27
 * Feldern aufging - Titel „Mahlzeit hinzufügen" ohne das Rezept zu nennen, das
 * Datumsfeld leer, 42 % des Dialogs unter der Sichtkante. Nach Escape blieb
 * `?recipe=` in der URL und ein Reload öffnete das Formular erneut, beliebig oft
 * (Critique 2026-07-29). Als einziger der fünf Transfers folgte er nicht dem
 * Muster der anderen.
 *
 * Jetzt zwei Entscheidungen statt neun Feldern, kein Seitenwechsel, und der
 * Query-Parameter existiert nicht mehr - der Zombie ist damit strukturell weg,
 * nicht per `replaceState` kaschiert. Details lassen sich danach im Essensplan
 * bearbeiten, wie bei jeder anderen Mahlzeit.
 */
async function planRecipe(recipe, btn) {
  const types = normalizeRecipeMealTypes(recipe.meal_types);
  // Vorauswahl: erklärt das Rezept genau einen Typ, ist die Sache klar. Erklärt
  // es mehrere - was der Default ist, wenn niemand etwas gesetzt hat -, dann
  // stand bisher „Frühstück" da, weil es in der Liste zuerst kommt: der Dialog
  // schlug für ein Curry das Frühstück vor (Critique 2026-07-30). Ohne Signal
  // vom Rezept ist das Abendessen die ehrlichere Annahme, es ist die Mahlzeit,
  // die Haushalte am häufigsten planen.
  const vorauswahl = types.length === 1 ? types[0] : (types.includes('dinner') ? 'dinner' : types[0]);
  const typeOpts = mealTypeOptions()
    .filter(({ key }) => types.includes(key))
    .map(({ key, label }) =>
      `<option value="${key}"${key === vorauswahl ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');

  const today = toLocalDateKey(new Date());

  openSharedModal({
    title: t('recipes.planTitle', { name: recipe.title }),
    size: 'sm',
    content: `
      <div class="form-group">
        <label class="form-label" for="plan-date">${t('meals.dateLabel')}</label>
        <yuvomi-datepicker type="date" id="plan-date" value="${esc(formatDateInput(today))}"></yuvomi-datepicker>
      </div>
      <div class="form-group">
        <label class="form-label" for="plan-type">${t('meals.mealTypeLabel')}</label>
        <select class="form-input" id="plan-type">${typeOpts}</select>
      </div>
      <div class="modal-panel__footer modal-panel__footer--plain">
        <button type="button" class="btn btn--secondary" data-action="close-modal">${esc(t('common.cancel'))}</button>
        <!-- „Übernehmen", nicht die Wiederholung des Auslöser-Labels: die drei
             anderen Transfer-Dialoge bestätigen genauso, und der Dialogtitel
             nennt Rezept und Ziel bereits (Critique 2026-07-30). -->
        <button type="button" class="btn btn--primary" id="plan-confirm">${esc(t('common.apply'))}</button>
      </div>`,
    onSave(panel) {
      panel.querySelector('#plan-confirm').addEventListener('click', async (e) => {
        const confirmBtn = e.currentTarget;
        const dateField = panel.querySelector('#plan-date');
        if (!isDateInputValid(dateField.value)) {
          reportFieldError(dateField, t('calendar.invalidDate'));
          return;
        }
        const date = parseDateInput(dateField.value);
        const mealType = panel.querySelector('#plan-type').value;

        confirmBtn.disabled = true;
        try {
          await api.post('/meals', mealPayloadFromRecipe(recipe, date, mealType));
          closeSharedModal({ force: true });
          window.yuvomi?.showToast(
            t('recipes.planSuccess', { name: recipe.title, date: formatDate(date) }),
            'success',
          );
        } catch (err) {
          window.yuvomi?.showToast(err.data?.error ?? t('common.errorGeneric'), 'danger');
          confirmBtn.disabled = false;
        }
      });
    },
  });

  if (btn) btn.blur();
}

async function transferRecipe(recipe, btn) {
  if (!state.lists.length) {
    window.yuvomi?.showToast(t('meals.noShoppingLists'), 'danger');
    return;
  }

  let listId = state.lists[0].id;
  if (state.lists.length > 1) {
    const options = state.lists.map((l) => ({ value: l.id, label: l.name }));
    const choice = await selectModal(t('common.toShoppingListWhich'), options);
    if (choice === null) return;
    listId = Number(choice);
  }

  if (btn) btn.disabled = true;
  try {
    const res = await api.post(`/recipes/${recipe.id}/to-shopping-list`, { listId });
    const added = res.data?.transferred ?? 0;
    const skipped = res.data?.skipped ?? 0;

    if (added > 0) {
      // t() wählt die _one-Form selbst, sobald count numerisch ist (i18n.js).
      // `list` nennt das Ziel: „5 Zutaten übernommen." sagte nicht, in welche der
      // Listen (Critique 2026-07-30, P1).
      window.yuvomi?.showToast(t('recipes.toShoppingSuccess', {
        count: added,
        list: state.lists.find((l) => l.id === listId)?.name ?? '',
      }), 'success');
      refreshKitchenBadges();
    } else if (skipped > 0) {
      window.yuvomi?.showToast(t('recipes.toShoppingAllPresent'), 'info');
    } else {
      window.yuvomi?.showToast(t('recipes.toShoppingNoIngredients'), 'info');
    }
  } catch (err) {
    window.yuvomi?.showToast(err.data?.error ?? t('common.errorGeneric'), 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function removeRecipe(recipe) {
  const itemEl = _container.querySelector(`.recipe-row-item[data-id="${recipe.id}"]`);
  if (itemEl) itemEl.style.display = 'none';

  scheduleUndoableDelete({
    message: t('recipes.deleted'),
    commit: async ({ keepalive }) => {
      await api.delete(`/recipes/${recipe.id}`, { keepalive });
      if (keepalive) return; // Seite verschwindet — kein UI-Refresh mehr
      state.recipes = state.recipes.filter((r) => r.id !== recipe.id);
      renderRecipeList();
    },
    restore: (err) => {
      if (itemEl) itemEl.style.display = '';
      if (err) window.yuvomi?.showToast(err.data?.error ?? t('common.unknownError'), 'danger');
    },
  });
}

async function duplicateRecipe(recipe) {
  const copySuffix = t('recipes.copySuffix');
  const title = `${recipe.title} (${copySuffix})`;
  const notes = recipe.notes || null;
  const recipe_url = recipe.recipe_url || null;
  const ingredients = (recipe.ingredients || []).map((ing) => ({
    name: ing.name,
    quantity: ing.quantity || null,
    category: ing.category || DEFAULT_CATEGORY_NAME,
  }));

  try {
    const res = await api.post('/recipes', { title, notes, recipe_url, ingredients });
    state.recipes.push(res.data);
    renderRecipeList();
    window.yuvomi?.showToast(t('recipes.duplicated'), 'success');
  } catch (err) {
    window.yuvomi?.showToast(err.data?.error ?? t('common.errorGeneric'), 'danger');
  }
}
