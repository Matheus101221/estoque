/* =========================================================
   ESTADO
   ========================================================= */
const state = {
  activeTab: CONFIG.SHEET_TABS[0],
  dataByTab: {},   // { "Shineray Extrema": [ {foto, modelo, ano, cor, chassi, valor}, ... ] }
  searchTerm: "",
};

/* =========================================================
   NORMALIZAÇÃO DE TEXTO / CABEÇALHOS
   ========================================================= */
function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .trim();
}

// para cada campo que precisamos, uma lista de palavras-chave possíveis
// que podem aparecer no cabeçalho da coluna na planilha.
// Ordem importa: campos mais específicos (valorMinimo, valorMedio, valorMaximo)
// são checados antes do fallback genérico "valor", pra não haver conflito.
const HEADER_FIELDS = [
  ["foto", ["foto", "imagem", "foto url", "url foto", "picture"]],
  ["modelo", ["veiculo", "modelo", "nome da moto", "nome", "moto"]],
  ["ano", ["ano/modelo", "ano fabricacao", "ano"]],
  ["cor", ["cor"]],
  ["chassi", ["chassi", "chassis"]],
  ["valorMinimo", ["valor minimo", "minimo"]],
  ["valorMedio", ["valor medio", "medio"]],
  ["valorMaximo", ["valor maximo", "maximo"]],
  ["valor", ["valor de venda", "preco", "valor"]], // fallback: coluna única de preço
];

function mapHeaders(headerRow) {
  const normalizedHeaders = headerRow.map(normalize);
  const map = {}; // { colIndex: fieldName }
  const usedCols = new Set();

  for (const [field, keywords] of HEADER_FIELDS) {
    let bestIndex = -1;
    // primeiro tenta match exato, depois substring
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
    if (bestIndex >= 0) {
      map[bestIndex] = field;
      usedCols.add(bestIndex);
    }
  }
  return map;
}

// varre as primeiras linhas em busca da linha de cabeçalho real
// (permite linhas em branco ou título acima da tabela, como na planilha atual)
function findHeaderRowIndex(rawRows) {
  let bestIndex = -1, bestScore = 0;
  const scanLimit = Math.min(rawRows.length, 6);
  for (let i = 0; i < scanLimit; i++) {
    const score = Object.keys(mapHeaders(rawRows[i].map(v => String(v ?? "")))).length;
    if (score > bestScore) { bestScore = score; bestIndex = i; }
  }
  return bestScore >= 2 ? bestIndex : -1;
}

/* =========================================================
   PARSING DE VALOR (aceita "R$ 7.200,00", "7200", "7.200", etc.)
   ========================================================= */
function parseValor(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return raw;
  let s = String(raw).replace(/[^\d,.-]/g, "").trim();
  if (!s) return null;

  // se tem vírgula E ponto, assume formato BR: ponto = milhar, vírgula = decimal
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    // só vírgula -> decimal
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function formatBRL(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/* =========================================================
   BUSCA NO GOOGLE SHEETS (via gviz, planilha pública)
   ========================================================= */
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

  // monta matriz de valores brutos
  const rawRows = rows.map(r => (r.c || []).map(cell => (cell ? (cell.f ?? cell.v) : "")));

  // tenta primeiro os rótulos de coluna que o próprio Sheets detectou;
  // se não derem match suficiente, varre as primeiras linhas em busca
  // do cabeçalho real (cobre casos como linha em branco no topo)
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

  return dataRows
    .map(row => {
      const item = {};
      for (const [colIndex, field] of Object.entries(headerMap)) {
        item[field] = row[colIndex];
      }
      return item;
    })
    .filter(item => item.modelo && String(item.modelo).trim() !== "")
    .map(item => {
      let valorMinimo = parseValor(item.valorMinimo);
      let valorMedio = parseValor(item.valorMedio);
      let valorMaximo = parseValor(item.valorMaximo);

      // se a planilha só tem uma coluna única de preço (sem min/médio/máx
      // separados), usa esse mesmo valor nos três campos
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
        valorMinimo, valorMedio, valorMaximo,
      };
    });
}

/* =========================================================
   CARREGAMENTO
   ========================================================= */
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

/* =========================================================
   RENDER — TABS
   ========================================================= */
function renderTabs() {
  const nav = document.getElementById("store-tabs");
  nav.innerHTML = "";
  CONFIG.SHEET_TABS.forEach(name => {
    const btn = document.createElement("button");
    btn.className = "store-tab" + (name === state.activeTab ? " active" : "");
    const count = (state.dataByTab[name] || []).length;
    btn.innerHTML = `${escapeHtml(name)}<span class="tab-count">${count}</span>`;
    btn.addEventListener("click", () => {
      state.activeTab = name;
      renderTabs();
      renderContent();
    });
    nav.appendChild(btn);
  });
}

/* =========================================================
   RENDER — CONTEÚDO (grupos de modelo + cards)
   ========================================================= */
function groupByModel(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.modelo)) groups.set(item.modelo, []);
    groups.get(item.modelo).push(item);
  }
  return groups;
}

function renderContent() {
  const container = document.getElementById("models-container");
  const countLabel = document.getElementById("store-count");
  container.innerHTML = "";

  const allItems = state.dataByTab[state.activeTab] || [];
  const term = normalize(state.searchTerm);
  const items = term
    ? allItems.filter(i => normalize(i.modelo).includes(term) || normalize(i.chassi).includes(term))
    : allItems;

  countLabel.textContent = `${items.length} moto${items.length === 1 ? "" : "s"} em estoque`;

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state">Nenhuma moto encontrada.</div>`;
    return;
  }

  const groups = groupByModel(items);

  for (const [modelo, units] of groups) {
    const minVals = units.map(u => u.valorMinimo).filter(v => v !== null && v !== undefined);
    const medVals = units.map(u => u.valorMedio).filter(v => v !== null && v !== undefined);
    const maxVals = units.map(u => u.valorMaximo).filter(v => v !== null && v !== undefined);

    const min = minVals.length ? Math.min(...minVals) : null;
    const max = maxVals.length ? Math.max(...maxVals) : null;
    const media = medVals.length ? medVals.reduce((a, b) => a + b, 0) / medVals.length : null;

    const section = document.createElement("section");
    section.className = "model-group";
    section.innerHTML = `
      <div class="model-header">
        <div class="model-name">${escapeHtml(modelo)}</div>
        <div class="model-stats">
          <span class="stat-min">Mínimo <strong>${formatBRL(min)}</strong></span>
          <span class="stat-media">Médio <strong>${formatBRL(media)}</strong></span>
          <span class="stat-max">Máximo <strong>${formatBRL(max)}</strong></span>
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
  const card = document.createElement("div");
  card.className = "unit-card";

  const photoHtml = unit.foto
    ? `<div class="unit-photo"><img src="${escapeAttr(unit.foto)}" alt="${escapeAttr(unit.modelo)}" loading="lazy" onerror="this.parentElement.classList.add('no-photo'); this.remove();"></div>`
    : `<div class="unit-photo no-photo">sem foto</div>`;

  const { min, media, max } = modelStats;

  card.innerHTML = `
    ${photoHtml}
    <div class="unit-body">
      <div class="unit-row"><span>Ano</span><span>${escapeHtml(unit.ano || "—")}</span></div>
      <div class="unit-row"><span>Cor</span><span>${escapeHtml(unit.cor || "—")}</span></div>
      <div class="unit-row"><span>Chassi</span><span>${escapeHtml(unit.chassi || "—")}</span></div>
      <div class="unit-price-grid">
        <div class="price-cell"><span class="price-label">Mínimo</span><span class="price-value">${formatBRL(min)}</span></div>
        <div class="price-cell"><span class="price-label">Médio</span><span class="price-value">${formatBRL(media)}</span></div>
        <div class="price-cell price-cell-max"><span class="price-label">Máximo</span><span class="price-value">${formatBRL(max)}</span></div>
      </div>
    </div>
  `;
  return card;
}

/* =========================================================
   HELPERS
   ========================================================= */
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

/* =========================================================
   STATUS / MENSAGENS
   ========================================================= */
function showStatus(message, isError) {
  const el = document.getElementById("status-message");
  if (!message) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle("error", !!isError);
}

/* =========================================================
   INIT
   ========================================================= */
async function init() {
  renderTabs();

  document.getElementById("search-input").addEventListener("input", (e) => {
    state.searchTerm = e.target.value;
    renderContent();
  });

  const usingMock = !CONFIG.SPREADSHEET_ID.trim();
  if (usingMock) {
    showStatus("Mostrando dados de exemplo — cole o ID da sua planilha em config.js para conectar ao Google Sheets de verdade.", false);
  }

  let anyError = false;
  await Promise.all(CONFIG.SHEET_TABS.map(async (name) => {
    const result = await loadTab(name);
    if (result.error) anyError = true;
  }));

  if (anyError) {
    showStatus("Não consegui carregar uma ou mais abas da planilha (verifique o ID, o compartilhamento e os nomes das abas em config.js). Mostrando dados de exemplo por enquanto.", true);
  }

  document.getElementById("last-update").textContent =
    "atualizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  renderTabs();
  renderContent();
}

init();
