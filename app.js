const savedCatalog = JSON.parse(localStorage.getItem('quickSumCatalog') || '{}');
const savedPurchases = JSON.parse(localStorage.getItem('quickSumPurchases') || '[]');
const state = { mode: 'product', pendingCode: null, promotionCode: null, pendingBackup: null, catalog: savedCatalog, cart: {}, purchases: savedPurchases, stream: null, scanning: false, lastScan: { value: '', at: 0 } };

const $ = (id) => document.getElementById(id);
const els = {
  video: $('video'), cameraStage: $('cameraStage'), cameraPlaceholder: $('cameraPlaceholder'), cameraButton: $('cameraButton'),
  switchModeButton: $('switchModeButton'), modeBadge: $('modeBadge'), scannerTitle: $('scannerTitle'), scanStatus: $('scanStatus'),
  quantityForm: $('quantityForm'), quantityInput: $('quantityInput'), quantityLabel: $('quantityLabel'), quantitySubmit: $('quantitySubmit'), cartList: $('cartList'), emptyState: $('emptyState'),
  grandTotal: $('grandTotal'), totalCount: $('totalCount'), resetButton: $('resetButton'), dialog: $('productDialog'),
  productForm: $('productForm'), productName: $('productName'), productCategory: $('productCategory'), productPrice: $('productPrice'), dialogCode: $('dialogCode'),
  cancelDialog: $('cancelDialog'), scanPriceDialog: $('scanPriceDialog'), toast: $('toast'),
  promotionPhotoButton: $('promotionPhotoButton'), promotionPhoto: $('promotionPhoto'), promotionDialog: $('promotionDialog'),
  promotionForm: $('promotionForm'), promotionProduct: $('promotionProduct'), promotionPreview: $('promotionPreview'),
  promotionText: $('promotionText'), promotionType: $('promotionType'), promotionFields: $('promotionFields'), cancelPromotion: $('cancelPromotion'),
  installButton: $('installButton'), calculatorView: $('calculatorView'), dashboardView: $('dashboardView'),
  purchaseDate: $('purchaseDate'), savePurchaseButton: $('savePurchaseButton'), dashboardMonth: $('dashboardMonth'),
  monthSpend: $('monthSpend'), purchaseCount: $('purchaseCount'), monthItemCount: $('monthItemCount'), topProduct: $('topProduct'),
  dashboardEmpty: $('dashboardEmpty'), dashboardContent: $('dashboardContent'), monthlyChart: $('monthlyChart'),
  categoryChart: $('categoryChart'), categoryLegend: $('categoryLegend'), productRanking: $('productRanking'), historyList: $('historyList'),
  backupButton: $('backupButton'), restoreButton: $('restoreButton'), csvButton: $('csvButton'), restoreFile: $('restoreFile'),
  restoreDialog: $('restoreDialog'), restoreForm: $('restoreForm'), restoreSummary: $('restoreSummary'), cancelRestore: $('cancelRestore'), backupStatus: $('backupStatus')
};

const won = (value) => `${Number(value).toLocaleString('ko-KR')}원`;
const saveCatalog = () => localStorage.setItem('quickSumCatalog', JSON.stringify(state.catalog));
const savePurchases = () => localStorage.setItem('quickSumPurchases', JSON.stringify(state.purchases));
const saveCart = () => localStorage.setItem('quickSumCart', JSON.stringify(state.cart));
const localDate = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

function setMode(mode) {
  state.mode = mode;
  const priceMode = mode === 'price';
  els.modeBadge.textContent = priceMode ? '가격' : '상품';
  els.modeBadge.classList.toggle('price', priceMode);
  els.scannerTitle.textContent = priceMode ? '가격 QR/바코드를 보여주세요' : '상품 바코드를 보여주세요';
  els.switchModeButton.textContent = priceMode ? '상품 코드 스캔' : '가격 코드 스캔';
  els.scanStatus.textContent = priceMode ? '가격만 인식하면 직전 상품에 적용합니다.' : '상품 코드를 스캔하면 수량이 추가됩니다.';
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 1800);
}

function parsePrice(raw) {
  const text = String(raw).trim();
  try {
    const parsed = JSON.parse(text);
    if (Number.isFinite(Number(parsed.price))) return Number(parsed.price);
  } catch (_) {}
  const match = text.match(/(?:PRICE\s*[:=]\s*)?([0-9][0-9,]*)/i);
  return match ? Number(match[1].replaceAll(',', '')) : NaN;
}

function addToCart(code) {
  const product = state.catalog[code];
  if (!product) {
    state.pendingCode = code;
    els.dialogCode.textContent = `상품 코드: ${code}`;
    els.productName.value = '';
    els.productPrice.value = '';
    els.dialog.showModal();
    return;
  }
  state.cart[code] ??= { ...product, code, quantity: 0 };
  state.cart[code].quantity += 1;
  selectQuantityProduct(code);
  render();
  showToast(`${product.name} 1개 추가`);
}

function selectQuantityProduct(code) {
  const item = state.cart[code];
  if (!item) return;
  state.pendingCode = code;
  els.quantityLabel.textContent = `${item.name} 수량 직접 입력`;
  els.quantityInput.disabled = false;
  els.quantitySubmit.disabled = false;
  els.quantityInput.placeholder = '수량';
  els.quantityInput.value = item.quantity;
}

function promotionTotal(item) {
  const q = item.quantity;
  const promo = item.promotion;
  if (!promo || promo.type === 'none') return item.price * q;
  if (promo.type === 'plus') {
    const group = promo.buy + promo.free;
    return item.price * (q - Math.floor(q / group) * promo.free);
  }
  if (promo.type === 'bundle') return Math.floor(q / promo.count) * promo.bundlePrice + (q % promo.count) * item.price;
  if (promo.type === 'percent') return Math.round(item.price * q * (1 - promo.percent / 100));
  if (promo.type === 'amount') return Math.max(0, item.price - promo.amount) * q;
  return item.price * q;
}

function promotionLabel(promo) {
  if (!promo || promo.type === 'none') return '';
  if (promo.type === 'plus') return `${promo.buy}+${promo.free} 적용`;
  if (promo.type === 'bundle') return `${promo.count}개 ${won(promo.bundlePrice)} 적용`;
  if (promo.type === 'percent') return `${promo.percent}% 할인 적용`;
  if (promo.type === 'amount') return `${won(promo.amount)} 할인 적용`;
  return '';
}

function applyPrice(raw) {
  const price = parsePrice(raw);
  if (!Number.isFinite(price) || price < 0) return showToast('가격 코드를 읽지 못했어요.');
  if (!state.pendingCode) return showToast('먼저 가격을 적용할 상품을 스캔하세요.');
  const existing = state.catalog[state.pendingCode];
  if (existing) {
    existing.price = price;
    if (state.cart[state.pendingCode]) state.cart[state.pendingCode].price = price;
    saveCatalog();
    render();
    showToast(`단가를 ${won(price)}으로 변경했어요.`);
    setMode('product');
  } else {
    els.productPrice.value = price;
    els.dialog.showModal();
  }
}

function acceptCode(raw) {
  const value = String(raw).trim();
  if (!value) return;
  const now = Date.now();
  if (state.lastScan.value === value && now - state.lastScan.at < 1200) return;
  state.lastScan = { value, at: now };
  if (state.mode === 'price') applyPrice(value);
  else {
    state.pendingCode = value;
    addToCart(value);
  }
}

function render() {
  const items = Object.values(state.cart);
  const total = items.reduce((sum, item) => sum + promotionTotal(item), 0);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  els.grandTotal.textContent = won(total);
  els.totalCount.textContent = count.toLocaleString('ko-KR');
  els.emptyState.hidden = items.length > 0;
  els.cartList.innerHTML = items.map((item) => `
    <article class="cart-item" data-code="${escapeHtml(item.code)}">
      <div><h3>${escapeHtml(item.name)}</h3><p class="cart-meta">단가 ${won(item.price)} · ${escapeHtml(item.code)}</p>${item.promotion ? `<span class="promotion-tag">${escapeHtml(promotionLabel(item.promotion))}</span>` : ''}</div>
      <div class="item-total">${won(promotionTotal(item))}
        <div class="quantity"><button data-action="minus" aria-label="수량 줄이기">−</button><button class="quantity-value" data-action="select" aria-label="수량 직접 입력">${item.quantity}</button><button data-action="plus" aria-label="수량 늘리기">＋</button></div>
      </div>
    </article>`).join('');
  saveCart();
}

function downloadFile(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportBackup() {
  const backup = { app: 'barohapgye', version: 1, exportedAt: new Date().toISOString(), catalog: state.catalog, cart: state.cart, purchases: state.purchases };
  downloadFile(JSON.stringify(backup, null, 2), `barohapgye-backup-${localDate()}.json`, 'application/json;charset=utf-8');
  localStorage.setItem('quickSumLastBackup', localDate());
  updateBackupStatus();
  showToast('전체 백업 파일을 저장했습니다.');
}

function cleanProduct(value) {
  if (!value || typeof value !== 'object' || typeof value.name !== 'string') return null;
  const price = Number(value.price);
  if (!Number.isFinite(price) || price < 0) return null;
  return { name: value.name.slice(0, 200), price, category: typeof value.category === 'string' ? value.category.slice(0, 80) : '미분류' };
}

function cleanPromotion(value) {
  if (!value || typeof value !== 'object') return null;
  const type = value.type;
  const positive = (key) => Number.isFinite(Number(value[key])) && Number(value[key]) > 0 ? Number(value[key]) : null;
  if (type === 'plus' && positive('buy') && positive('free')) return { type, buy: positive('buy'), free: positive('free') };
  if (type === 'bundle' && positive('count') && positive('bundlePrice')) return { type, count: positive('count'), bundlePrice: positive('bundlePrice') };
  if (type === 'percent' && positive('percent') && positive('percent') <= 100) return { type, percent: positive('percent') };
  if (type === 'amount' && positive('amount')) return { type, amount: positive('amount') };
  return null;
}

function validateBackup(raw) {
  if (!raw || raw.app !== 'barohapgye' || !raw.catalog || !Array.isArray(raw.purchases)) throw new Error('지원하지 않는 백업 파일입니다.');
  const catalog = {};
  for (const [code, value] of Object.entries(raw.catalog)) {
    const product = cleanProduct(value);
    if (product && code.length <= 200) catalog[code] = product;
  }
  const purchases = raw.purchases.map((record, recordIndex) => {
    if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || !Array.isArray(record.items)) return null;
    const items = record.items.map((item) => {
      const product = cleanProduct(item);
      const quantity = Number(item.quantity), total = Number(item.total);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(total) || total < 0) return null;
      return { ...product, code: String(item.code || '').slice(0, 200), quantity, promotion: cleanPromotion(item.promotion), total };
    }).filter(Boolean);
    if (!items.length) return null;
    return { id: String(record.id || `restored-${recordIndex}-${record.date}`).slice(0, 200), date: record.date, items, total: items.reduce((sum, item) => sum + item.total, 0) };
  }).filter(Boolean);
  const cart = {};
  if (raw.cart && typeof raw.cart === 'object') for (const [code, item] of Object.entries(raw.cart)) {
    const product = cleanProduct(item), quantity = Number(item?.quantity);
    if (product && Number.isInteger(quantity) && quantity > 0 && code.length <= 200) cart[code] = { ...product, code, quantity, promotion: cleanPromotion(item.promotion) };
  }
  return { catalog, purchases, cart };
}

async function prepareRestore(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('백업 파일은 10MB 이하여야 합니다.');
  const parsed = JSON.parse(await file.text());
  state.pendingBackup = validateBackup(parsed);
  els.restoreSummary.textContent = `상품 ${Object.keys(state.pendingBackup.catalog).length}개, 지출 기록 ${state.pendingBackup.purchases.length}건을 확인했습니다.`;
  els.restoreDialog.showModal();
}

function applyRestore(mode) {
  const backup = state.pendingBackup;
  if (!backup) return;
  if (mode === 'replace') {
    state.catalog = backup.catalog;
    state.purchases = backup.purchases;
    state.cart = backup.cart;
  } else {
    state.catalog = { ...backup.catalog, ...state.catalog };
    const knownIds = new Set(state.purchases.map((record) => record.id));
    state.purchases = [...state.purchases, ...backup.purchases.filter((record) => !knownIds.has(record.id))];
    for (const [code, item] of Object.entries(backup.cart)) {
      if (state.cart[code]) state.cart[code].quantity += item.quantity;
      else state.cart[code] = item;
    }
  }
  saveCatalog(); savePurchases(); saveCart();
  state.pendingBackup = null;
  state.pendingCode = null;
  resetQuantityControl();
  render(); renderDashboard();
  showToast('백업 데이터를 가져왔습니다.');
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function exportMonthlyCsv() {
  const month = els.dashboardMonth.value;
  const records = state.purchases.filter((record) => record.date.startsWith(month));
  if (!records.length) return showToast('선택한 달의 내보낼 기록이 없습니다.');
  const rows = [['이용 날짜', '상품명', '품목', '단가(원)', '수량', '행사', '최종 금액(원)']];
  for (const record of records) for (const item of record.items) rows.push([record.date, item.name, item.category || '미분류', item.price, item.quantity, promotionLabel(item.promotion) || '없음', item.total]);
  const csv = '\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  downloadFile(csv, `barohapgye-expenses-${month}.csv`, 'text/csv;charset=utf-8');
  showToast(`${month} 지출 내역을 내보냈습니다.`);
}

function updateBackupStatus() {
  const date = localStorage.getItem('quickSumLastBackup');
  els.backupStatus.textContent = date ? `마지막 백업: ${date}` : '아직 백업하지 않았습니다.';
}

function saveCurrentPurchase() {
  const items = Object.values(state.cart);
  if (!items.length) return showToast('저장할 상품이 없습니다.');
  if (!els.purchaseDate.value) return showToast('이용 날짜를 선택해주세요.');
  const record = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: els.purchaseDate.value,
    total: items.reduce((sum, item) => sum + promotionTotal(item), 0),
    items: items.map((item) => ({ code: item.code, name: item.name, category: item.category || '미분류', price: item.price, quantity: item.quantity, promotion: item.promotion || null, total: promotionTotal(item) }))
  };
  state.purchases.push(record);
  savePurchases();
  state.cart = {};
  state.pendingCode = null;
  resetQuantityControl();
  render();
  els.dashboardMonth.value = record.date.slice(0, 7);
  showView('dashboard');
  showToast('지출 기록을 저장했습니다.');
}

function resetQuantityControl() {
  els.quantityLabel.textContent = '같은 상품 수량 입력';
  els.quantityInput.value = '';
  els.quantityInput.disabled = true;
  els.quantitySubmit.disabled = true;
}

function showView(view) {
  const dashboard = view === 'dashboard';
  els.calculatorView.hidden = dashboard;
  els.dashboardView.hidden = !dashboard;
  document.querySelectorAll('.view-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  if (dashboard) requestAnimationFrame(renderDashboard);
}

function aggregateMonth(month) {
  const records = state.purchases.filter((record) => record.date.startsWith(month));
  const products = {};
  const categories = {};
  for (const record of records) for (const item of record.items) {
    products[item.name] ??= { quantity: 0, amount: 0 };
    products[item.name].quantity += item.quantity;
    products[item.name].amount += item.total;
    const category = item.category || '미분류';
    categories[category] = (categories[category] || 0) + item.total;
  }
  return { records, products, categories, total: records.reduce((sum, record) => sum + record.total, 0), itemCount: records.reduce((sum, record) => sum + record.items.reduce((n, item) => n + item.quantity, 0), 0) };
}

function monthSequence(endMonth, count = 6) {
  const [year, month] = endMonth.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month - count + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
}

function canvasContext(canvas, height) {
  const width = Math.max(280, canvas.getBoundingClientRect().width || 300);
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  return { ctx, width, height };
}

function drawMonthlyChart(month) {
  const months = monthSequence(month);
  const values = months.map((key) => aggregateMonth(key).total);
  const { ctx, width, height } = canvasContext(els.monthlyChart, 230);
  const pad = { top: 18, right: 10, bottom: 38, left: 48 };
  const chartH = height - pad.top - pad.bottom;
  const max = Math.max(...values, 1);
  ctx.font = '11px sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = '#8591a4'; ctx.strokeStyle = '#e9edf3';
  for (let i = 0; i <= 3; i++) {
    const y = pad.top + chartH * i / 3;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.fillText(Math.round(max * (1 - i / 3)).toLocaleString('ko-KR'), pad.left - 7, y + 4);
  }
  const slot = (width - pad.left - pad.right) / months.length;
  values.forEach((value, i) => {
    const barH = value / max * chartH;
    const x = pad.left + i * slot + slot * .2;
    const y = pad.top + chartH - barH;
    const gradient = ctx.createLinearGradient(0, y, 0, pad.top + chartH); gradient.addColorStop(0, '#6257ed'); gradient.addColorStop(.55, '#864be9'); gradient.addColorStop(1, '#ec5dac');
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.roundRect(x, y, slot * .6, barH, 6); ctx.fill();
    ctx.fillStyle = '#68758a'; ctx.textAlign = 'center'; ctx.fillText(`${Number(months[i].slice(5))}월`, x + slot * .3, height - 13);
  });
}

function drawCategoryChart(categories) {
  const colors = ['#6257ed', '#ec5dac', '#2bcda5', '#ff9a4f', '#ff6f7d', '#46aee8', '#9a91ab'];
  const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const { ctx, width } = canvasContext(els.categoryChart, 240);
  const cx = width / 2, cy = 112, radius = 82;
  let start = -Math.PI / 2;
  entries.forEach(([, value], index) => {
    const end = start + value / total * Math.PI * 2;
    ctx.beginPath(); ctx.arc(cx, cy, radius, start, end); ctx.arc(cx, cy, 48, end, start, true); ctx.closePath(); ctx.fillStyle = colors[index % colors.length]; ctx.fill(); start = end;
  });
  ctx.fillStyle = '#172b4d'; ctx.textAlign = 'center'; ctx.font = '800 18px sans-serif'; ctx.fillText(won(total), cx, cy + 6);
  els.categoryLegend.innerHTML = entries.map(([name, value], index) => `<div class="legend-row"><span class="legend-dot" style="background:${colors[index % colors.length]}"></span><span>${escapeHtml(name)}</span><b>${won(value)}</b></div>`).join('');
}

function renderDashboard() {
  const month = els.dashboardMonth.value || localDate().slice(0, 7);
  const data = aggregateMonth(month);
  const ranking = Object.entries(data.products).sort((a, b) => b[1].quantity - a[1].quantity);
  els.monthSpend.textContent = won(data.total);
  els.purchaseCount.textContent = `${data.records.length}회`;
  els.monthItemCount.textContent = `${data.itemCount.toLocaleString('ko-KR')}개`;
  els.topProduct.textContent = ranking[0]?.[0] || '-';
  els.dashboardEmpty.hidden = data.records.length > 0;
  els.dashboardContent.hidden = state.purchases.length === 0;
  if (!state.purchases.length) return;
  drawMonthlyChart(month);
  if (Object.keys(data.categories).length) drawCategoryChart(data.categories);
  else { const { ctx, width, height } = canvasContext(els.categoryChart, 240); ctx.fillStyle = '#8490a3'; ctx.textAlign = 'center'; ctx.fillText('선택한 달의 데이터가 없습니다.', width / 2, height / 2); els.categoryLegend.innerHTML = ''; }
  const maxQty = ranking[0]?.[1].quantity || 1;
  els.productRanking.innerHTML = ranking.length ? ranking.slice(0, 5).map(([name, value], index) => `<div class="rank-row"><span class="rank-number">${index + 1}</span><span class="rank-name">${escapeHtml(name)}</span><span class="rank-value">${value.quantity}개 · ${won(value.amount)}</span><div class="rank-bar"><span style="width:${value.quantity / maxQty * 100}%"></span></div></div>`).join('') : '<p class="cart-meta">선택한 달의 데이터가 없습니다.</p>';
  els.historyList.innerHTML = data.records.slice().sort((a, b) => b.date.localeCompare(a.date)).map((record) => `<div class="history-row" data-id="${escapeHtml(record.id)}"><time>${record.date.slice(5).replace('-', '.')}</time><span class="history-items">${escapeHtml(record.items.map((item) => `${item.name} ${item.quantity}개`).join(', '))}</span><strong class="history-total">${won(record.total)}</strong><button class="delete-history" type="button">삭제</button></div>`).join('') || '<p class="cart-meta">선택한 달의 기록이 없습니다.</p>';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function detectPromotion(text) {
  const normalized = text.replace(/\s/g, '').replace(/,/g, '');
  let match = normalized.match(/(\d+)\+(\d+)/);
  if (match) return { type: 'plus', buy: Number(match[1]), free: Number(match[2]) };
  match = normalized.match(/(\d+)개(?:에|당)?(?:총)?(\d+)원/);
  if (match) return { type: 'bundle', count: Number(match[1]), bundlePrice: Number(match[2]) };
  match = normalized.match(/(\d+)%할인/);
  if (match) return { type: 'percent', percent: Number(match[1]) };
  match = normalized.match(/(\d+)원할인/);
  if (match) return { type: 'amount', amount: Number(match[1]) };
  return { type: 'none' };
}

function renderPromotionFields(promo = {}) {
  const definitions = {
    plus: [['buy', '구매 수량', promo.buy ?? 1], ['free', '무료 수량', promo.free ?? 1]],
    bundle: [['count', '묶음 수량', promo.count ?? 2], ['bundlePrice', '묶음 가격(원)', promo.bundlePrice ?? '']],
    percent: [['percent', '할인율(%)', promo.percent ?? '']], amount: [['amount', '개당 할인액(원)', promo.amount ?? '']], none: []
  };
  els.promotionFields.innerHTML = definitions[els.promotionType.value].map(([name, label, value]) =>
    `<label>${label}<input name="${name}" type="number" min="1" value="${value}" required></label>`).join('');
}

async function readPromotionPhoto(file) {
  const code = state.pendingCode;
  if (!code || !state.catalog[code]) return showToast('먼저 등록된 상품을 스캔하세요.');
  state.promotionCode = code;
  els.promotionPreview.src = URL.createObjectURL(file);
  els.promotionProduct.textContent = `${state.catalog[code].name}에 적용`;
  els.promotionText.value = '사진의 글자를 읽는 중입니다…';
  els.promotionType.value = 'none';
  renderPromotionFields();
  els.promotionDialog.showModal();
  if (!window.Tesseract) {
    els.promotionText.value = '';
    return showToast('사진 인식기를 불러오지 못했습니다. 직접 선택해주세요.');
  }
  try {
    const result = await Tesseract.recognize(file, 'kor+eng', { logger: ({ status, progress }) => {
      if (status === 'recognizing text') els.promotionText.value = `글자 인식 중 ${Math.round(progress * 100)}%`;
    }});
    const text = result.data.text.trim();
    const promo = detectPromotion(text);
    els.promotionText.value = text;
    els.promotionType.value = promo.type;
    renderPromotionFields(promo);
    showToast(promo.type === 'none' ? '자동 판별하지 못했어요. 직접 선택해주세요.' : '행사 내용을 찾았습니다.');
  } catch (_) {
    els.promotionText.value = '';
    showToast('사진을 읽지 못했어요. 직접 선택해주세요.');
  }
}

async function startCamera() {
  if (!('BarcodeDetector' in window)) {
    els.scanStatus.textContent = '이 브라우저는 카메라 바코드 인식을 지원하지 않습니다. Chrome/Edge 또는 직접 입력을 이용하세요.';
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });
    els.video.srcObject = state.stream;
    await els.video.play();
    const track = state.stream.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() || {};
    if (capabilities.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    }
    els.cameraPlaceholder.hidden = true;
    els.cameraStage.classList.add('active');
    els.cameraButton.textContent = '카메라 끄기';
    els.scanStatus.textContent = '바코드나 QR이 초록색 안내선 안에 크게 보이도록 가까이 대주세요.';
    state.scanning = true;
    void scanLoop();
  } catch (error) {
    els.scanStatus.textContent = '카메라 권한을 허용해주세요. HTTPS 또는 localhost에서 실행해야 합니다.';
  }
}

function stopCamera() {
  state.scanning = false;
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  els.video.srcObject = null;
  els.cameraPlaceholder.hidden = false;
  els.cameraStage.classList.remove('active');
  els.cameraButton.textContent = '카메라 켜기';
}

async function scanLoop() {
  const wantedFormats = ['qr_code', 'ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e'];
  let detector;
  try {
    const supportedFormats = await BarcodeDetector.getSupportedFormats?.();
    const formats = supportedFormats?.length
      ? wantedFormats.filter((format) => supportedFormats.includes(format))
      : wantedFormats;
    detector = new BarcodeDetector(formats.length ? { formats } : undefined);
  } catch (_) {
    els.scanStatus.textContent = '이 기기에서 코드 인식기를 시작하지 못했습니다. Chrome을 최신 버전으로 업데이트해주세요.';
    stopCamera();
    return;
  }
  while (state.scanning) {
    try {
      if (els.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const codes = await detector.detect(els.video);
        if (codes[0]?.rawValue) {
          navigator.vibrate?.(60);
          els.scanStatus.textContent = '인식했습니다. 같은 상품을 다시 비추면 수량이 추가됩니다.';
          acceptCode(codes[0].rawValue);
        }
      }
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
}

els.cameraButton.addEventListener('click', () => state.stream ? stopCamera() : startCamera());
els.switchModeButton.addEventListener('click', () => setMode(state.mode === 'product' ? 'price' : 'product'));
els.quantityForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const item = state.cart[state.pendingCode];
  const quantity = Number(els.quantityInput.value);
  if (!item || !Number.isInteger(quantity) || quantity < 1) return showToast('수량을 1개 이상 입력해주세요.');
  item.quantity = quantity;
  render();
  showToast(`${item.name} 수량을 ${quantity}개로 변경했어요.`);
});
els.productPrice.addEventListener('input', () => { els.productPrice.value = els.productPrice.value.replace(/[^0-9]/g, ''); });
els.productForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = els.productName.value.trim();
  const price = Number(els.productPrice.value.replaceAll(',', ''));
  if (!name || !Number.isFinite(price)) return;
  const code = state.pendingCode;
  state.catalog[code] = { name, price };
  state.catalog[code].category = els.productCategory.value;
  saveCatalog();
  els.dialog.close();
  addToCart(code);
  setMode('product');
});
els.cancelDialog.addEventListener('click', () => els.dialog.close());
els.scanPriceDialog.addEventListener('click', () => {
  els.dialog.close();
  setMode('price');
  showToast('가격 QR 또는 바코드를 스캔하세요.');
});
els.promotionPhotoButton.addEventListener('click', () => {
  if (!state.pendingCode || !state.catalog[state.pendingCode]) return showToast('행사를 적용할 상품을 먼저 스캔하세요.');
  els.promotionPhoto.click();
});
els.promotionPhoto.addEventListener('change', () => {
  const file = els.promotionPhoto.files[0];
  if (file) readPromotionPhoto(file);
  els.promotionPhoto.value = '';
});
els.promotionText.addEventListener('input', () => {
  const promo = detectPromotion(els.promotionText.value);
  if (promo.type !== 'none') { els.promotionType.value = promo.type; renderPromotionFields(promo); }
});
els.promotionType.addEventListener('change', () => renderPromotionFields());
els.cancelPromotion.addEventListener('click', () => els.promotionDialog.close());
els.promotionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.promotionForm));
  const promo = { type: els.promotionType.value };
  for (const key of ['buy', 'free', 'count', 'bundlePrice', 'percent', 'amount']) if (data[key] !== undefined) promo[key] = Number(data[key]);
  const item = state.cart[state.promotionCode];
  if (!item) return showToast('장바구니에서 상품을 찾지 못했어요.');
  item.promotion = promo.type === 'none' ? null : promo;
  els.promotionDialog.close();
  render();
  showToast(promo.type === 'none' ? '행사를 해제했습니다.' : `${promotionLabel(promo)} 완료`);
});
els.cartList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const code = button.closest('.cart-item').dataset.code;
  if (button.dataset.action === 'select') {
    selectQuantityProduct(code);
    els.quantityInput.focus();
    els.quantityInput.select();
    return;
  }
  state.cart[code].quantity += button.dataset.action === 'plus' ? 1 : -1;
  if (state.cart[code].quantity <= 0) {
    delete state.cart[code];
    if (state.pendingCode === code) {
      state.pendingCode = null;
      els.quantityLabel.textContent = '같은 상품 수량 입력';
      els.quantityInput.value = '';
      els.quantityInput.disabled = true;
      els.quantitySubmit.disabled = true;
    }
  } else selectQuantityProduct(code);
  render();
});
els.resetButton.addEventListener('click', () => {
  if (!Object.keys(state.cart).length || confirm('장바구니의 모든 상품을 지울까요?')) {
    state.cart = {}; state.pendingCode = null; render();
    resetQuantityControl();
  }
});
document.querySelectorAll('.view-tabs button').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
els.savePurchaseButton.addEventListener('click', saveCurrentPurchase);
els.dashboardMonth.addEventListener('change', renderDashboard);
els.historyList.addEventListener('click', (event) => {
  const button = event.target.closest('.delete-history');
  if (!button || !confirm('이 지출 기록을 삭제할까요?')) return;
  const id = button.closest('.history-row').dataset.id;
  state.purchases = state.purchases.filter((record) => record.id !== id);
  savePurchases();
  renderDashboard();
});
els.backupButton.addEventListener('click', exportBackup);
els.restoreButton.addEventListener('click', () => els.restoreFile.click());
els.restoreFile.addEventListener('change', async () => {
  const file = els.restoreFile.files[0];
  if (!file) return;
  try { await prepareRestore(file); }
  catch (_) { showToast('올바른 바로합계 백업 파일이 아닙니다.'); }
  finally { els.restoreFile.value = ''; }
});
els.cancelRestore.addEventListener('click', () => { state.pendingBackup = null; els.restoreDialog.close(); });
els.restoreForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const mode = new FormData(els.restoreForm).get('restoreMode');
  if (mode === 'replace' && !confirm('현재 데이터를 모두 백업 내용으로 교체할까요?')) return;
  applyRestore(mode);
  els.restoreDialog.close();
});
els.csvButton.addEventListener('click', exportMonthlyCsv);
window.addEventListener('pagehide', stopCamera);

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  els.installButton.hidden = false;
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  els.installButton.hidden = true;
  showToast('바로합계가 홈 화면에 설치되었습니다.');
});
els.installButton.addEventListener('click', async () => {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    els.installButton.hidden = true;
    return;
  }
  alert('브라우저 공유 메뉴를 열고 “홈 화면에 추가”를 선택해주세요.');
});

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (isIos && !isStandalone) els.installButton.hidden = false;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {
    console.warn('오프라인 사용 준비를 완료하지 못했습니다.');
  }));
}

setMode('product');
els.purchaseDate.value = localDate();
els.dashboardMonth.value = localDate().slice(0, 7);
state.cart = JSON.parse(localStorage.getItem('quickSumCart') || '{}');
updateBackupStatus();
render();
