const state = {
  activeTab: CONFIG.SHEET_TABS[0],
  dataByTab: {},
  searchTerm: "",
  filter: "all",
};

function normalize(str) {
  return String(str || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

const HEADER_FIELDS = [
  ["foto", ["foto", "imagem", "foto url", "url foto", "picture"]],
  ["modelo", ["veiculo", "modelo", "nome da moto", "nome", "moto"]],
  ["ano", ["ano/modelo", "ano fabricacao", "ano"]],
  ["cor", ["cor"]],
  ["chassi", ["chassi", "chassis"]],
  ["valorMinimo", ["valor minimo", "minimo"]],
  ["valorMedio", ["valor medio", "medio"]],
  ["valorMaximo", ["valor maximo", "maximo"]],
  ["valor", ["valor de venda", "preco", "valor"]],
];

function mapHeaders(headerRow) {
  const normalizedHeaders = headerRow.map(normalize);
  const map = {};
  const usedCols = new Set();

  for (const [field, keywords] of HEADER_FIELDS) {
    let bestIndex = -1;
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (usedCols.has(i)) continue;
      if (keywords.includes(normalizedHeaders[i])) { bestIndex = i; break; }
    }
    if (bestIndex === -1) {
      for (let i = 0; i < normalizedHeaders.length; i++) {
        if (usedCols.has(i)) continue;
        if (keywords.some(k => normalizedHeaders[i].includes(k))) { bestIndex = i; break; }
      }
    }
    if (bestIndex >= 0) { map[bestIndex] = field; usedCols.add(bestIndex); }
  }
  return map;
}

function findHeaderRowIndex(rawRows) {
  let bestIndex = -1, bestScore = 0;
  const scanLimit = Math.min(rawRows.length, 6);
  for (let i = 0; i < scanLimit; i++) {
    const score = Object.keys(mapHeaders(rawRows[i].map(v => String(v ?? "")))).length;
    if (score > bestScore) { bestScore = score; bestIndex = i; }
  }
  return bestScore >= 2 ? bestIndex : -1;
}

function parseValor(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return raw;
  let s = String(raw).replace(/[^\d,.-]/g, "").trim();
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function formatBRL(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

async function fetchSheetTab(sheetName) {
  const id = CONFIG.SPREADSHEET_ID.trim();
  if (!id) throw new Error("SPREADSHEET_ID vazio");

  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao buscar a aba "${sheetName}" (HTTP ${res.status})`);

  const text = await res.text();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  const json = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  const cols = json.table.cols.map(c => c.label || c.id || "");
  const rows = json.table.rows || [];
  const rawRows = rows.map(r => (r.c || []).map(cell => (cell ? (cell.f ?? cell.v) : "")));

  let headerMap = mapHeaders(cols);
  let dataRows = rawRows;

  if (Object.keys(headerMap).length < 2) {
    const idx = findHeaderRowIndex(rawRows);
    if (idx >= 0) {
      headerMap = mapHeaders(rawRows[idx].map(v => String(v ?? "")));
      dataRows = rawRows.slice(idx + 1);
    } else {
      headerMap = mapHeaders(rawRows[0] ? rawRows[0].map(v => String(v ?? "")) : []);
      dataRows = rawRows.slice(1);
    }
  }

  return dataRows.map(row => {
    const item = {};
    for (const [colIndex, field] of Object.entries(headerMap)) item[field] = row[colIndex];
    return item;
  })
  .filter(item => item.modelo && String(item.modelo).trim() !== "")
  .map(item => {
    let valorMinimo = parseValor(item.valorMinimo);
    let valorMedio = parseValor(item.valorMedio);
    let valorMaximo = parseValor(item.valorMaximo);
    if (valorMinimo === null && valorMedio === null && valorMaximo === null && item.valor !== undefined) {
      const v = parseValor(item.valor);
      valorMinimo = valorMedio = valorMaximo = v;
    }
    return {
      foto: item.foto || "",
      modelo: String(item.modelo || "").trim(),
      ano: String(item.ano || "").trim(),
      cor: String(item.cor || "").trim(),
      chassi: String(item.chassi || "").trim(),
      valorMinimo, valorMedio, valorMaximo
    };
  });
}

async function loadTab(sheetName) {
  if (!CONFIG.SPREADSHEET_ID.trim()) {
    state.dataByTab[sheetName] = MOCK_DATA[sheetName] || [];
    return { usedMock: true };
  }
  try {
    state.dataByTab[sheetName] = await fetchSheetTab(sheetName);
    return { usedMock: false };
  } catch (err) {
    console.error(err);
    state.dataByTab[sheetName] = MOCK_DATA[sheetName] || [];
    return { usedMock: true, error: err.message };
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

function groupByModel(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.modelo)) groups.set(item.modelo, []);
    groups.get(item.modelo).push(item);
  }
  return groups;
}

function allStock() {
  return Object.values(state.dataByTab).flat();
}


function renderTabs() {
  const nav = document.getElementById("store-tabs");
  nav.innerHTML = "";

  CONFIG.SHEET_TABS.forEach(name => {
    const btn = document.createElement("button");
    btn.className = "store-tab" + (name === state.activeTab ? " active" : "");
    const count = (state.dataByTab[name] || []).length;
    btn.innerHTML = `
      <div class="store-tab-main">
        <span class="store-tab-name">${escapeHtml(name.replace(/^ESTOQUE\s*/i, ""))}</span>
        <span>→</span>
      </div>
      <span class="tab-count">${count} ${count === 1 ? "unidade disponível" : "unidades disponíveis"}</span>
    `;
    btn.addEventListener("click", () => {
      state.activeTab = name;
      state.filter = "all";
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === "all"));
      renderTabs();
      renderContent();
    });
    nav.appendChild(btn);
  });
}

function getFilteredItems() {
  const allItems = state.dataByTab[state.activeTab] || [];
  const term = normalize(state.searchTerm);
  let items = term
    ? allItems.filter(i =>
        normalize(i.modelo).includes(term) ||
        normalize(i.cor).includes(term) ||
        normalize(i.chassi).includes(term) ||
        normalize(i.ano).includes(term)
      )
    : [...allItems];

  if (state.filter === "lowest") {
    items.sort((a,b) => (a.valorMedio ?? a.valorMinimo ?? Infinity) - (b.valorMedio ?? b.valorMinimo ?? Infinity));
  }
  return items;
}

function renderContent() {
  const container = document.getElementById("models-container");
  const activeTitle = document.getElementById("active-store-title");
  const activeCount = document.getElementById("active-stock-count");
  container.innerHTML = "";

  activeTitle.textContent = state.activeTab.replace(/^ESTOQUE\s*/i, "");
  const items = getFilteredItems();
  activeCount.textContent = `${items.length} ${items.length === 1 ? "unidade" : "unidades"}`;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>Nenhuma moto encontrada</strong>
        <span>Tente outro modelo, cor ou chassi.</span>
      </div>`;
    return;
  }

  const groups = groupByModel(items);
  for (const [modelo, units] of groups) {
    const minVals = units.map(u => u.valorMinimo).filter(v => v !== null && v !== undefined);
    const medVals = units.map(u => u.valorMedio).filter(v => v !== null && v !== undefined);
    const maxVals = units.map(u => u.valorMaximo).filter(v => v !== null && v !== undefined);

    const min = minVals.length ? Math.min(...minVals) : null;
    const max = maxVals.length ? Math.max(...maxVals) : null;
    const media = medVals.length ? medVals.reduce((a,b) => a+b, 0) / medVals.length : null;

    const section = document.createElement("section");
    section.className = "model-group";
    section.innerHTML = `
      <div class="model-header">
        <div>
          <span class="model-name">${escapeHtml(modelo)}</span>
          <span class="model-unit-count">${units.length} ${units.length === 1 ? "unidade" : "unidades"}</span>
        </div>
        <div class="model-stats">
          <span>Mín. <strong>${formatBRL(min)}</strong></span>
          <span>Médio <strong>${formatBRL(media)}</strong></span>
          <span class="stat-max">Máx. <strong>${formatBRL(max)}</strong></span>
        </div>
      </div>
      <div class="unit-grid"></div>
    `;

    const grid = section.querySelector(".unit-grid");
    units.forEach(unit => grid.appendChild(renderUnitCard(unit, { min, media, max })));
    container.appendChild(section);
  }
}

function renderUnitCard(unit, modelStats) {
  const card = document.createElement("article");
  card.className = "unit-card";

  const photoHtml = unit.foto
    ? `<div class="unit-photo"><img src="${escapeAttr(unit.foto)}" alt="${escapeAttr(unit.modelo)}" loading="lazy" onerror="this.parentElement.classList.add('no-photo'); this.remove();"></div>`
    : `<div class="unit-photo no-photo">Foto não cadastrada</div>`;

  const chassi = unit.chassi || "—";
  const safeChassi = escapeHtml(chassi);

  card.innerHTML = `
    ${photoHtml}
    <div class="unit-body">
      <div class="unit-top">
        <div>
          <div class="unit-title">${escapeHtml(unit.modelo)}</div>
          <div class="unit-subtitle">${escapeHtml(unit.ano || "Ano não informado")} • ${escapeHtml(unit.cor || "Cor não informada")}</div>
        </div>
        <span class="unit-badge">Disponível</span>
      </div>

      <div class="unit-row">
        <span>Ano / modelo</span>
        <span>${escapeHtml(unit.ano || "—")}</span>
      </div>
      <div class="unit-row">
        <span>Cor</span>
        <span>${escapeHtml(unit.cor || "—")}</span>
      </div>
      <div class="unit-row">
        <span>Chassi</span>
        <div class="chassi-wrapper">
          <span class="chassi-text" title="${safeChassi}">${safeChassi}</span>
          ${unit.chassi ? `<button class="btn-copy" type="button" title="Copiar chassi">COPIAR</button>` : ""}
        </div>
      </div>

      <div class="price-box">
        <div class="price-label">Preço médio de referência</div>
        <div class="price-main">
          <strong>${formatBRL(modelStats.media)}</strong>
          <span>referência</span>
        </div>
        <div class="price-range">
          <div><span>Mínimo</span><strong>${formatBRL(modelStats.min)}</strong></div>
          <div><span>Máximo</span><strong>${formatBRL(modelStats.max)}</strong></div>
        </div>
      </div>

      <div class="card-actions">
        ${unit.chassi ? `<button class="card-action primary copy-full" type="button">COPIAR CHASSI</button>` : ""}
        <button class="card-action copy-data" type="button">COPIAR DADOS</button>
      </div>
    </div>
  `;

  const copyBtn = card.querySelector(".btn-copy");
  if (copyBtn) copyBtn.addEventListener("click", () => copyText(unit.chassi, copyBtn, "Chassi copiado"));

  const fullBtn = card.querySelector(".copy-full");
  if (fullBtn) fullBtn.addEventListener("click", () => copyText(unit.chassi, fullBtn, "Chassi copiado"));

  const dataBtn = card.querySelector(".copy-data");
  if (dataBtn) {
    dataBtn.addEventListener("click", () => {
      const text = [
        unit.modelo,
        unit.ano ? `Ano/Modelo: ${unit.ano}` : "",
        unit.cor ? `Cor: ${unit.cor}` : "",
        unit.chassi ? `Chassi: ${unit.chassi}` : "",
        modelStats.media != null ? `Valor de referência: ${formatBRL(modelStats.media)}` : ""
      ].filter(Boolean).join("\n");
      copyText(text, dataBtn, "Dados copiados");
    });
  }

  return card;
}

async function copyText(text, btn, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = "✓ COPIADO";
    btn.classList.add("copied");
    showToast(successMessage);
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove("copied");
    }, 1500);
  } catch (err) {
    console.error(err);
    showToast("Não foi possível copiar");
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function showStatus(message, isError = false) {
  const el = document.getElementById("status-message");
  if (!message) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle("error", !!isError);
}

async function refreshAll() {
  const btn = document.getElementById("refresh-btn");
  showStatus("Atualizando estoque...", false);

  let anyError = false;
  await Promise.all(CONFIG.SHEET_TABS.map(async name => {
    const result = await loadTab(name);
    if (result.error) anyError = true;
  }));

  document.getElementById("last-update").textContent =
    "Atualizado às " + new Date().toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"});

  btn.classList.remove("loading");
  renderTabs();
  renderContent();

  if (anyError) {
    showStatus("Uma ou mais abas não puderam ser carregadas. Verifique o ID, compartilhamento e nomes das abas.", true);
  } else {
    showStatus("");
    showToast("Estoque atualizado");
  }
}

async function init() {
  document.getElementById("search-input").addEventListener("input", e => {
    state.searchTerm = e.target.value;
    e.target.closest(".search-box").classList.toggle("has-value", !!e.target.value);
    renderContent();
  });

  document.getElementById("clear-search").addEventListener("click", () => {
    const input = document.getElementById("search-input");
    input.value = "";
    state.searchTerm = "";
    input.closest(".search-box").classList.remove("has-value");
    input.focus();
    renderContent();
  });

  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.toggle("active", b === btn));
      renderContent();
    });
  });

  document.getElementById("refresh-btn").addEventListener("click", refreshAll);

  await refreshAll();
}

init();
