const STORAGE_KEY = "flouzeo-v1";

const VARIABLE_DEFAULTS = [
  { id: "courses", label: "Courses alimentaires" },
  { id: "sante", label: "Santé" },
  { id: "voiture", label: "Voiture" },
  { id: "autres_necessaires", label: "Autres dépenses nécessaires courantes" },
  { id: "sorties_vacances", label: "Sorties + Vacances" },
  { id: "occasionnelles", label: "Dépenses occasionnelles" },
  { id: "dons", label: "Dons" },
];

const FIXED_DEFAULTS = [
  { id: "loyer", label: "Loyer + charges" },
  { id: "assurance_banques", label: "Assurance et Banques" },
  { id: "abonnements", label: "Abonnements" },
];

const euro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

const monthTitle = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

function monthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseMonthKey(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function shiftMonth(key, delta) {
  const d = parseMonthKey(key);
  d.setMonth(d.getMonth() + delta);
  return monthKey(d);
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(label) {
  const base = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return base || `cat_${uid()}`;
}

function uniqueCategoryId(label, existing) {
  let id = slugify(label);
  if (!existing.some((c) => c.id === id)) return id;
  id = `${id}_${uid()}`;
  return id;
}

function emptyFixedFrom(categories) {
  return Object.fromEntries(categories.map((c) => [c.id, 0]));
}

function defaultState() {
  return {
    variableCategories: VARIABLE_DEFAULTS.map((c) => ({ ...c })),
    fixedCategories: FIXED_DEFAULTS.map((c) => ({ ...c })),
    fixedTemplates: emptyFixedFrom(FIXED_DEFAULTS),
    months: {},
  };
}

function normalizeCategories(list, fallback) {
  if (!Array.isArray(list) || !list.length) {
    return fallback.map((c) => ({ ...c }));
  }
  return list
    .filter((c) => c && typeof c.id === "string" && typeof c.label === "string")
    .map((c) => ({ id: c.id, label: c.label.trim() || c.id }));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    const variableCategories = normalizeCategories(
      data.variableCategories,
      VARIABLE_DEFAULTS
    );
    const fixedCategories = normalizeCategories(
      data.fixedCategories,
      FIXED_DEFAULTS
    );
    return {
      variableCategories,
      fixedCategories,
      fixedTemplates: {
        ...emptyFixedFrom(fixedCategories),
        ...(data.fixedTemplates || {}),
      },
      months: data.months || {},
    };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensureMonth(state, key) {
  if (!state.months[key]) {
    state.months[key] = {
      fixed: { ...state.fixedTemplates },
      expenses: [],
    };
  } else {
    for (const cat of state.fixedCategories) {
      if (state.months[key].fixed[cat.id] === undefined) {
        state.months[key].fixed[cat.id] = Number(
          state.fixedTemplates[cat.id] || 0
        );
      }
    }
  }
  return state.months[key];
}

function categoryTotal(month, categoryId, kind) {
  if (kind === "fixed") {
    return Number(month.fixed[categoryId] || 0);
  }
  return month.expenses
    .filter((e) => e.categoryId === categoryId)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
}

function monthTotal(month) {
  const fixedSum = state.fixedCategories.reduce(
    (sum, c) => sum + Number(month.fixed[c.id] || 0),
    0
  );
  const variableSum = month.expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );
  return fixedSum + variableSum;
}

function parseAmount(value) {
  if (typeof value !== "string") value = String(value ?? "");
  const normalized = value.replace(",", ".").trim();
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** @type {ReturnType<typeof defaultState>} */
let state = loadState();
let currentMonth = monthKey();
/** @type {{ kind: 'variable' | 'fixed', id: string, label: string } | null} */
let activeCategory = null;
/** @type {'expense' | 'add-category' | null} */
let sheetMode = null;
/** @type {'variable' | 'fixed' | null} */
let addCategoryKind = null;

const els = {
  monthLabel: document.getElementById("month-label"),
  monthTotal: document.getElementById("month-total"),
  variableList: document.getElementById("variable-list"),
  fixedList: document.getElementById("fixed-list"),
  addVariable: document.getElementById("add-variable"),
  addFixed: document.getElementById("add-fixed"),
  prevMonth: document.getElementById("prev-month"),
  nextMonth: document.getElementById("next-month"),
  sheet: document.getElementById("sheet"),
  backdrop: document.getElementById("sheet-backdrop"),
  sheetTitle: document.getElementById("sheet-title"),
  sheetSub: document.getElementById("sheet-sub"),
  amountField: document.getElementById("amount-field"),
  amountInput: document.getElementById("amount-input"),
  noteField: document.getElementById("note-field"),
  noteInput: document.getElementById("note-input"),
  categoryNameField: document.getElementById("category-name-field"),
  categoryNameInput: document.getElementById("category-name-input"),
  sheetCancel: document.getElementById("sheet-cancel"),
  sheetSave: document.getElementById("sheet-save"),
  sheetDeleteCategory: document.getElementById("sheet-delete-category"),
  entries: document.getElementById("entries"),
  entriesList: document.getElementById("entries-list"),
};

function categoriesFor(kind) {
  return kind === "fixed" ? state.fixedCategories : state.variableCategories;
}

function render() {
  const month = ensureMonth(state, currentMonth);
  els.monthLabel.textContent = monthTitle.format(parseMonthKey(currentMonth));
  els.monthTotal.textContent = euro.format(monthTotal(month));

  els.variableList.innerHTML = state.variableCategories
    .map((cat) => {
      const total = categoryTotal(month, cat.id, "variable");
      return `
      <li>
        <button type="button" class="cat-btn" data-kind="variable" data-id="${cat.id}">
          <span class="cat-name">${escapeHtml(cat.label)}</span>
          <span class="cat-amount">${euro.format(total)}</span>
        </button>
      </li>
    `;
    })
    .join("");

  els.fixedList.innerHTML = state.fixedCategories
    .map((cat) => {
      const total = categoryTotal(month, cat.id, "fixed");
      return `
      <li>
        <button type="button" class="cat-btn" data-kind="fixed" data-id="${cat.id}">
          <span class="cat-name">${escapeHtml(cat.label)}</span>
          <span class="cat-amount">${euro.format(total)}</span>
        </button>
      </li>
    `;
    })
    .join("");
}

function setExpenseFieldsVisible(visible) {
  els.amountField.hidden = !visible;
  els.noteField.hidden = !visible;
  els.categoryNameField.hidden = visible;
}

function openSheet(kind, id) {
  const cat = categoriesFor(kind).find((c) => c.id === id);
  if (!cat) return;

  sheetMode = "expense";
  addCategoryKind = null;
  activeCategory = { kind, id, label: cat.label };
  const month = ensureMonth(state, currentMonth);

  els.sheetTitle.textContent = cat.label;
  setExpenseFieldsVisible(true);
  els.noteField.hidden = kind === "fixed";
  els.noteInput.value = "";
  els.sheetDeleteCategory.hidden = false;

  if (kind === "fixed") {
    els.sheetSub.textContent =
      "Ce montant sera reporté aux mois suivants. Modifiez-le en cas de changement.";
    els.amountInput.value =
      month.fixed[id] > 0 ? String(month.fixed[id]) : "";
    els.sheetSave.textContent = "Mettre à jour";
    els.entries.hidden = true;
    els.entriesList.innerHTML = "";
  } else {
    els.sheetSub.textContent = "Ajoutez une dépense à cette catégorie.";
    els.amountInput.value = "";
    els.sheetSave.textContent = "Ajouter";
    renderEntries(month, id);
  }

  els.sheet.hidden = false;
  els.backdrop.hidden = false;
  requestAnimationFrame(() => els.amountInput.focus());
}

function openAddCategorySheet(kind) {
  sheetMode = "add-category";
  addCategoryKind = kind;
  activeCategory = null;

  els.sheetTitle.textContent =
    kind === "fixed" ? "Nouvelle charge fixe" : "Nouvelle charge variable";
  els.sheetSub.textContent = "Choisissez le nom de la sous-catégorie.";
  setExpenseFieldsVisible(false);
  els.categoryNameInput.value = "";
  els.sheetSave.textContent = "Créer";
  els.sheetDeleteCategory.hidden = true;
  els.entries.hidden = true;
  els.entriesList.innerHTML = "";

  els.sheet.hidden = false;
  els.backdrop.hidden = false;
  requestAnimationFrame(() => els.categoryNameInput.focus());
}

function renderEntries(month, categoryId) {
  const items = month.expenses
    .filter((e) => e.categoryId === categoryId)
    .slice()
    .reverse();

  if (!items.length) {
    els.entries.hidden = true;
    els.entriesList.innerHTML = "";
    return;
  }

  els.entries.hidden = false;
  els.entriesList.innerHTML = items
    .map((e) => {
      const d = new Date(e.createdAt);
      const dateLabel = d.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
      });
      const note = e.note
        ? `<p class="entry-note">${escapeHtml(e.note)}</p>`
        : "";
      return `
        <li class="entry" data-id="${e.id}">
          <div class="entry-meta">
            <div class="entry-amount">${euro.format(e.amount)}</div>
            ${note}
            <p class="entry-date">${dateLabel}</p>
          </div>
          <button type="button" class="entry-del" data-del="${e.id}">Suppr.</button>
        </li>
      `;
    })
    .join("");
}

function closeSheet() {
  activeCategory = null;
  sheetMode = null;
  addCategoryKind = null;
  els.sheet.hidden = true;
  els.backdrop.hidden = true;
}

function addCategory(kind, label) {
  const name = label.trim();
  if (!name) return false;

  const list = categoriesFor(kind);
  const exists = list.some(
    (c) => c.label.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr")
  );
  if (exists) {
    els.categoryNameInput.focus();
    els.categoryNameInput.select();
    return false;
  }

  const id = uniqueCategoryId(name, [
    ...state.variableCategories,
    ...state.fixedCategories,
  ]);
  list.push({ id, label: name });

  if (kind === "fixed") {
    state.fixedTemplates[id] = 0;
    for (const month of Object.values(state.months)) {
      month.fixed[id] = 0;
    }
  }

  saveState(state);
  return true;
}

function deleteCategory(kind, id) {
  if (kind === "fixed") {
    state.fixedCategories = state.fixedCategories.filter((c) => c.id !== id);
    delete state.fixedTemplates[id];
    for (const month of Object.values(state.months)) {
      delete month.fixed[id];
    }
  } else {
    state.variableCategories = state.variableCategories.filter(
      (c) => c.id !== id
    );
    for (const month of Object.values(state.months)) {
      month.expenses = month.expenses.filter((e) => e.categoryId !== id);
    }
  }
  saveState(state);
}

function saveFromSheet() {
  if (sheetMode === "add-category") {
    if (!addCategoryKind) return;
    if (!addCategory(addCategoryKind, els.categoryNameInput.value)) return;
    closeSheet();
    render();
    return;
  }

  if (!activeCategory) return;
  const amount = parseAmount(els.amountInput.value);
  if (amount === null) {
    els.amountInput.focus();
    els.amountInput.select();
    return;
  }

  const month = ensureMonth(state, currentMonth);

  if (activeCategory.kind === "fixed") {
    month.fixed[activeCategory.id] = amount;
    state.fixedTemplates[activeCategory.id] = amount;
    for (const key of Object.keys(state.months)) {
      if (key > currentMonth) {
        state.months[key].fixed[activeCategory.id] = amount;
      }
    }
    saveState(state);
    closeSheet();
    render();
    return;
  }

  const note = els.noteInput.value.trim();
  month.expenses.push({
    id: uid(),
    categoryId: activeCategory.id,
    amount,
    note,
    createdAt: new Date().toISOString(),
  });
  saveState(state);
  closeSheet();
  render();
}

function deleteExpense(expenseId) {
  const month = ensureMonth(state, currentMonth);
  month.expenses = month.expenses.filter((e) => e.id !== expenseId);
  saveState(state);
  if (activeCategory?.kind === "variable") {
    renderEntries(month, activeCategory.id);
  }
  render();
}

function confirmDeleteCategory() {
  if (!activeCategory) return;
  const ok = window.confirm(
    `Supprimer la sous-catégorie « ${activeCategory.label} » ?\nLes montants associés seront aussi supprimés.`
  );
  if (!ok) return;
  deleteCategory(activeCategory.kind, activeCategory.id);
  closeSheet();
  render();
}

els.variableList.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".cat-btn");
  if (!btn) return;
  openSheet(btn.dataset.kind, btn.dataset.id);
});

els.fixedList.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".cat-btn");
  if (!btn) return;
  openSheet(btn.dataset.kind, btn.dataset.id);
});

els.addVariable.addEventListener("click", () => openAddCategorySheet("variable"));
els.addFixed.addEventListener("click", () => openAddCategorySheet("fixed"));

els.prevMonth.addEventListener("click", () => {
  currentMonth = shiftMonth(currentMonth, -1);
  ensureMonth(state, currentMonth);
  saveState(state);
  closeSheet();
  render();
});

els.nextMonth.addEventListener("click", () => {
  currentMonth = shiftMonth(currentMonth, 1);
  ensureMonth(state, currentMonth);
  saveState(state);
  closeSheet();
  render();
});

els.sheetCancel.addEventListener("click", closeSheet);
els.backdrop.addEventListener("click", closeSheet);
els.sheetSave.addEventListener("click", saveFromSheet);
els.sheetDeleteCategory.addEventListener("click", confirmDeleteCategory);

els.amountInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    saveFromSheet();
  }
});

els.categoryNameInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    saveFromSheet();
  }
});

els.entriesList.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-del]");
  if (!btn) return;
  deleteExpense(btn.dataset.del);
});

ensureMonth(state, currentMonth);
saveState(state);
render();

const INSTALL_DISMISS_KEY = "flouzeo-install-dismissed";
let deferredInstallPrompt = null;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function showInstallHelp() {
  if (isStandalone()) return;
  if (localStorage.getItem(INSTALL_DISMISS_KEY) === "1") return;
  const card = document.getElementById("install-card");
  if (card) card.hidden = false;
}

function hideInstallHelp() {
  const card = document.getElementById("install-card");
  if (card) card.hidden = true;
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const btn = document.getElementById("install-btn");
  if (btn) btn.hidden = false;
  showInstallHelp();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  localStorage.setItem(INSTALL_DISMISS_KEY, "1");
  hideInstallHelp();
});

document.getElementById("install-btn")?.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  hideInstallHelp();
});

document.getElementById("install-dismiss")?.addEventListener("click", () => {
  localStorage.setItem(INSTALL_DISMISS_KEY, "1");
  hideInstallHelp();
});

showInstallHelp();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* ignore offline registration errors in file:// */
    });
  });
}
