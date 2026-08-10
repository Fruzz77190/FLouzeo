const STORAGE_KEY = "flouzeo-v1";

const VARIABLE_CATEGORIES = [
  { id: "courses", label: "Courses alimentaires" },
  { id: "sante", label: "Santé" },
  { id: "voiture", label: "Voiture" },
  { id: "autres_necessaires", label: "Autres dépenses nécessaires courantes" },
  { id: "sorties_vacances", label: "Sorties + Vacances" },
  { id: "occasionnelles", label: "Dépenses occasionnelles" },
  { id: "dons", label: "Dons" },
];

const FIXED_CATEGORIES = [
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

function emptyFixed() {
  return Object.fromEntries(FIXED_CATEGORIES.map((c) => [c.id, 0]));
}

function defaultState() {
  return {
    fixedTemplates: emptyFixed(),
    months: {},
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    return {
      fixedTemplates: { ...emptyFixed(), ...(data.fixedTemplates || {}) },
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
  const fixedSum = FIXED_CATEGORIES.reduce(
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

/** @type {ReturnType<typeof defaultState>} */
let state = loadState();
let currentMonth = monthKey();
/** @type {{ kind: 'variable' | 'fixed', id: string, label: string } | null} */
let activeCategory = null;

const els = {
  monthLabel: document.getElementById("month-label"),
  monthTotal: document.getElementById("month-total"),
  variableList: document.getElementById("variable-list"),
  fixedList: document.getElementById("fixed-list"),
  prevMonth: document.getElementById("prev-month"),
  nextMonth: document.getElementById("next-month"),
  sheet: document.getElementById("sheet"),
  backdrop: document.getElementById("sheet-backdrop"),
  sheetTitle: document.getElementById("sheet-title"),
  sheetSub: document.getElementById("sheet-sub"),
  amountInput: document.getElementById("amount-input"),
  noteInput: document.getElementById("note-input"),
  noteField: document.getElementById("note-field"),
  sheetCancel: document.getElementById("sheet-cancel"),
  sheetSave: document.getElementById("sheet-save"),
  entries: document.getElementById("entries"),
  entriesList: document.getElementById("entries-list"),
};

function render() {
  const month = ensureMonth(state, currentMonth);
  els.monthLabel.textContent = monthTitle.format(parseMonthKey(currentMonth));
  els.monthTotal.textContent = euro.format(monthTotal(month));

  els.variableList.innerHTML = VARIABLE_CATEGORIES.map((cat) => {
    const total = categoryTotal(month, cat.id, "variable");
    return `
      <li>
        <button type="button" class="cat-btn" data-kind="variable" data-id="${cat.id}">
          <span class="cat-name">${cat.label}</span>
          <span class="cat-amount">${euro.format(total)}</span>
        </button>
      </li>
    `;
  }).join("");

  els.fixedList.innerHTML = FIXED_CATEGORIES.map((cat) => {
    const total = categoryTotal(month, cat.id, "fixed");
    return `
      <li>
        <button type="button" class="cat-btn" data-kind="fixed" data-id="${cat.id}">
          <span class="cat-name">${cat.label}</span>
          <span class="cat-amount">${euro.format(total)}</span>
        </button>
      </li>
    `;
  }).join("");
}

function openSheet(kind, id) {
  const list = kind === "fixed" ? FIXED_CATEGORIES : VARIABLE_CATEGORIES;
  const cat = list.find((c) => c.id === id);
  if (!cat) return;

  activeCategory = { kind, id, label: cat.label };
  const month = ensureMonth(state, currentMonth);

  els.sheetTitle.textContent = cat.label;
  els.noteField.hidden = kind === "fixed";
  els.noteInput.value = "";

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

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function closeSheet() {
  activeCategory = null;
  els.sheet.hidden = true;
  els.backdrop.hidden = true;
}

function saveFromSheet() {
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
    // Aligne aussi les mois futurs déjà initialisés
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

els.amountInput.addEventListener("keydown", (ev) => {
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* ignore offline registration errors in file:// */
    });
  });
}
