const savedCatalog = JSON.parse(localStorage.getItem('quickSumCatalog') || '{}');
const savedPurchases = JSON.parse(localStorage.getItem('quickSumPurchases') || '[]');
const state = { mode: 'product', pendingCode: null, pendingProductImage: null, promotionCode: null, pendingBackup: null, catalog: savedCatalog, cart: {}, purchases: savedPurchases, stream: null, scanning: false, lastScan: { value: '', at: 0 }, ocrWorkerPromise: null };

const $ = (id) => document.getElementById(id);
const els = {
  video: $('video'), cameraStage: $('cameraStage'), cameraPlaceholder: $('cameraPlaceholder'), cameraButton: $('cameraButton'), captureScanButton: $('captureScanButton'),
  productPhotoButton: $('productPhotoButton'), productPhoto: $('productPhoto'), productPhotoReady: $('productPhotoReady'), productPhotoPreview: $('productPhotoPreview'), productDialogPreview: $('productDialogPreview'),
  scanInsight: $('scanInsight'), scanInsightName: $('scanInsightName'), scanInsightDetail: $('scanInsightDetail'), scanInsightPrice: $('scanInsightPrice'), scanInsightSource: $('scanInsightSource'),
  switchModeButton: $('switchModeButton'), modeBadge: $('modeBadge'), scannerTitle: $('scannerTitle'), scanStatus: $('scanStatus'),
  quantityForm: $('quantityForm'), quantityInput: $('quantityInput'), quantityLabel: $('quantityLabel'), quantitySubmit: $('quantitySubmit'), cartList: $('cartList'), emptyState: $('emptyState'),
  grandTotal: $('grandTotal'), totalCount: $('totalCount'), resetButton: $('resetButton'), dialog: $('productDialog'),
  productForm: $('productForm'), productName: $('productName'), productWeight: $('productWeight'), productCategory: $('productCategory'), productPrice: $('productPrice'), dialogCode: $('dialogCode'),
  detectedDiscountPanel: $('detectedDiscountPanel'), detectedDiscountType: $('detectedDiscountType'), detectedDiscountValue: $('detectedDiscountValue'), detectedDiscountCondition: $('detectedDiscountCondition'), detectedFinalPrice: $('detectedFinalPrice'), discountRequirementBadge: $('discountRequirementBadge'), applyDetectedDiscount: $('applyDetectedDiscount'),
  cancelDialog: $('cancelDialog'), scanPriceDialog: $('scanPriceDialog'), toast: $('toast'),
  promotionPhotoButton: $('promotionPhotoButton'), promotionPhoto: $('promotionPhoto'), promotionDialog: $('promotionDialog'),
  discountRateButton: $('discountRateButton'), promotionForm: $('promotionForm'), promotionTitle: $('promotionTitle'), promotionProduct: $('promotionProduct'), promotionPreview: $('promotionPreview'),
  promotionText: $('promotionText'), promotionType: $('promotionType'), promotionFields: $('promotionFields'), cancelPromotion: $('cancelPromotion'),
  eventStore: $('eventStore'), eventBranch: $('eventBranch'), eventWebSearch: $('eventWebSearch'), officialEventSearch: $('officialEventSearch'), eventExplanation: $('eventExplanation'),
  installButton: $('installButton'), calculatorView: $('calculatorView'), dashboardView: $('dashboardView'),
  purchaseDate: $('purchaseDate'), purchaseStore: $('purchaseStore'), purchaseBranch: $('purchaseBranch'), savePurchaseButton: $('savePurchaseButton'), dashboardMonth: $('dashboardMonth'), dashboardStore: $('dashboardStore'),
  monthSpend: $('monthSpend'), purchaseCount: $('purchaseCount'), monthItemCount: $('monthItemCount'), topProduct: $('topProduct'), selectedStoreKpi: $('selectedStoreKpi'),
  dashboardEmpty: $('dashboardEmpty'), dashboardContent: $('dashboardContent'), monthlyChart: $('monthlyChart'),
  categoryChart: $('categoryChart'), categoryLegend: $('categoryLegend'), productRanking: $('productRanking'), historyList: $('historyList'),
  backupButton: $('backupButton'), restoreButton: $('restoreButton'), csvButton: $('csvButton'), restoreFile: $('restoreFile'),
  restoreDialog: $('restoreDialog'), restoreForm: $('restoreForm'), restoreSummary: $('restoreSummary'), cancelRestore: $('cancelRestore'), backupStatus: $('backupStatus'),
  checkoutDialog: $('checkoutDialog'), checkoutMeta: $('checkoutMeta'), checkoutItems: $('checkoutItems'), checkoutGrandTotal: $('checkoutGrandTotal'), cancelCheckout: $('cancelCheckout'), confirmPurchaseSave: $('confirmPurchaseSave'),
  advisorForm: $('advisorForm'), advisorInput: $('advisorInput'), advisorMessages: $('advisorMessages'), priceTrendList: $('priceTrendList'), valueComparisonList: $('valueComparisonList'), personalRecommendationList: $('personalRecommendationList'), storeInsightList: $('storeInsightList'), dashboardEventSearch: $('dashboardEventSearch'),
  receiptPhotoButton: $('receiptPhotoButton'), receiptPhoto: $('receiptPhoto'), receiptCheckResult: $('receiptCheckResult')
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
  els.scannerTitle.textContent = priceMode ? '가격 QR/바코드를 보여주세요' : '상품·가격표 또는 바코드를 촬영하세요';
  els.switchModeButton.textContent = priceMode ? '상품 코드 스캔' : '가격 코드 스캔';
  els.scanStatus.textContent = priceMode ? '가격만 인식하면 직전 상품에 적용합니다.' : '사진 한 장으로 상품명·가격을 입력하거나 바코드로 등록할 수 있습니다.';
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
    els.productWeight.value = '';
    els.productPrice.value = '';
    els.productDialogPreview.hidden = !state.pendingProductImage;
    if (state.pendingProductImage) els.productDialogPreview.src = state.pendingProductImage;
    els.dialog.showModal();
    return;
  }
  if (state.pendingProductImage) {
    product.image = state.pendingProductImage;
    if (state.cart[code]) state.cart[code].image = state.pendingProductImage;
    saveCatalog();
    clearPendingProductPhoto();
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
  const condition = promo.condition ? ` · ${promo.condition}` : '';
  if (promo.type === 'plus') return `${promo.buy}+${promo.free} 적용`;
  if (promo.type === 'bundle') return `${promo.count}개 ${won(promo.bundlePrice)} 적용`;
  if (promo.type === 'percent') return `${promo.percent}% 할인 적용${condition}`;
  if (promo.type === 'amount') return `${won(promo.amount)} 할인 적용${condition}`;
  return '';
}

function explainEvent(text) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return '행사표를 촬영하거나 행사 문구를 입력하면 기간과 적용 조건을 정리해드려요.';
  const notes = [];
  const detected = detectPromotion(source);
  if (detected.type !== 'none') notes.push(`확인된 혜택: ${promotionLabel(detected)}`);
  if (/구독권|구독 회원|subscription/i.test(source)) notes.push('구독권 보유 또는 등록이 필요한 행사로 보입니다.');
  if (/신세계\s*포인트|포인트\s*(?:회원|적립)/i.test(source)) notes.push('포인트 회원 인증이나 적립 조건을 확인하세요.');
  if (/카드|삼성|국민|신한|현대|농협|우리|하나/i.test(source)) notes.push('특정 결제수단 조건이 있을 수 있습니다.');
  if (/점포별|지점별|입점\s*점포|일부\s*점포|매장별/i.test(source)) notes.push('지점별 적용 여부가 다를 수 있습니다.');
  const period = source.match(/(?:행사\s*)?기간\s*[:：]?\s*([^※]{3,45})/i) || source.match(/\d{1,2}[./월]\s*\d{1,2}일?\s*(?:부터|~|-|–)\s*\d{1,2}[./월]\s*\d{1,2}일?/);
  if (period) notes.push(`확인된 기간: ${(period[1] || period[0]).trim()}`);
  if (!notes.length) notes.push('자동으로 확정할 할인 조건을 찾지 못했습니다. 웹 검색이나 매장 안내문으로 확인해주세요.');
  return `${notes.join(' ')} 적용 전 상품·기간·지점·결제 조건을 꼭 확인하세요.`;
}

function updateEventExplanation() {
  els.eventExplanation.textContent = explainEvent(els.promotionText.value);
}

function eventSearchQuery(officialOnly = false) {
  const code = state.promotionCode || state.pendingCode;
  const item = state.cart[code] || state.catalog[code];
  const store = els.eventStore.value;
  const branch = els.eventBranch.value.trim();
  const eventWords = els.promotionText.value.replace(/\s+/g, ' ').trim().slice(0, 90);
  const officialDomains = { '트레이더스': 'emart.com', '이마트': 'emart.com', '홈플러스': 'homeplus.co.kr', '롯데마트': 'lottemart.com', '코스트코': 'costco.co.kr' };
  const parts = [store, branch, item?.name, eventWords, '행사 할인 기간 조건'];
  if (officialOnly && officialDomains[store]) parts.push(`site:${officialDomains[store]}`);
  return parts.filter(Boolean).join(' ');
}

function openEventSearch(officialOnly = false) {
  const query = eventSearchQuery(officialOnly);
  const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  showToast(officialOnly ? '공식 사이트 중심 검색을 열었습니다.' : '매장 행사 검색을 열었습니다.');
}

function discountedUnitPrice(item) {
  return item.promotion?.type === 'percent'
    ? Math.round(item.price * (1 - item.promotion.percent / 100))
    : item.price;
}

function cartPriceMeta(item) {
  const weight = item.weight ? ` · ${escapeHtml(item.weight)}` : '';
  if (item.promotion?.type !== 'percent') return `단가 ${won(item.price)}${weight}`;
  return `단가 <s>${won(item.price)}</s> → <strong>${won(discountedUnitPrice(item))}</strong>${weight}`;
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
  els.savePurchaseButton.disabled = items.length === 0;
  els.cartList.innerHTML = items.map((item) => `
    <article class="cart-item" data-code="${escapeHtml(item.code)}">
      <div class="cart-product-main">${item.image ? `<img class="cart-product-image" src="${item.image}" alt="">` : ''}<div><h3>${escapeHtml(item.name)}</h3><p class="cart-meta">${cartPriceMeta(item)}</p>${item.promotion ? `<span class="promotion-tag">${escapeHtml(promotionLabel(item.promotion))}</span>` : ''}<button class="item-discount-button" data-action="discount" type="button">할인율</button></div></div>
      <div class="item-total">${promotionTotal(item) !== item.price * item.quantity ? `<s>${won(item.price * item.quantity)}</s><strong>${won(promotionTotal(item))}</strong>` : won(promotionTotal(item))}
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
  const image = typeof value.image === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/.test(value.image) && value.image.length <= 400000 ? value.image : undefined;
  const weight = typeof value.weight === 'string' ? value.weight.slice(0, 40) : '';
  return { name: value.name.slice(0, 200), price, weight, category: typeof value.category === 'string' ? value.category.slice(0, 80) : '미분류', ...(image ? { image } : {}) };
}

function parseProductAndPrice(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const priced = [];
  for (const line of lines) {
    for (const match of line.matchAll(/(?:₩|￦)\s*(\d{1,3}(?:,\d{3})+|\d{3,7})(?!\d)|(?<!\d)(\d{1,3}(?:,\d{3})+|\d{3,7})\s*원|(?<!\d)(\d{1,3}(?:,\d{3})+)(?!\d)/g)) {
      const value = Number((match[1] || match[2] || match[3]).replaceAll(',', ''));
      if (value >= 100 && value <= 10000000) priced.push({ value, line, score: /행사|할인|판매|회원|최종|구매가/.test(line) ? 2 : 1 });
    }
  }
  priced.sort((a, b) => b.value - a.value || b.score - a.score);
  const nameCandidates = lines.map((line, index) => {
    const cleaned = line
    .replace(/(?:₩|￦)?\s*\d{1,3}(?:,\d{3})+\s*원?/g, ' ')
    .replace(/\d{3,7}\s*원/g, ' ')
    .replace(/\d+(?:[.,]\d+)?\s*(?:kg|㎏|킬로그램|g|그램|ml|mL|㎖|l|L|리터)/gi, ' ')
    .replace(/[x×*]\s*\d+\s*(?:개입|개|입|팩|봉)?/gi, ' ')
    .replace(/\(?\s*\d+\s*(?:인분|개입|입|팩|봉)\s*\)?/g, ' ')
    .replace(/정상가|판매가|구매가|회원가|행사가|할인가|할인|행사|바코드|카드|포인트|기간/gi, ' ')
      .replace(/\s+/g, ' ').trim();
    let score = Math.max(0, 6 - index);
    if (/\d+(?:[.,]\d+)?\s*(?:kg|㎏|g|그램|ml|mL|㎖|l|L|리터)/i.test(line)) score += 10;
    if (/[가-힣]{3,}/.test(cleaned)) score += 9;
    if (/^[가-힣A-Za-z0-9][가-힣A-Za-z0-9 &'().+\-/]{2,45}$/.test(cleaned)) score += 4;
    if ((cleaned.match(/[^가-힣A-Za-z0-9\s&'().+\-/]/g) || []).length > 2) score -= 8;
    if (cleaned.length >= 4 && cleaned.length <= 38) score += 5;
    if (/제조|사용|원산지|정석|비법|맛 그대로|얼큰|칼칼|100g당|적립|할인/.test(line)) score -= 8;
    return { line: cleaned, score };
  }).filter(({ line }) => /[가-힣A-Za-z]{2}/.test(line) && !/^\d[\d\s.,%-]*$/.test(line))
    .sort((a, b) => b.score - a.score || Math.min(b.line.length, 45) - Math.min(a.line.length, 45));
  const weightMatch = String(text || '').match(/(\d+(?:[.,]\d+)?)\s*(kg|㎏|킬로그램|g|그램|ml|mL|㎖|l|L|리터)(?![A-Za-z])/i);
  let weightNumber = weightMatch?.[1]?.replace(',', '.') || '';
  const weightUnit = weightMatch?.[2]?.replace(/킬로그램|㎏/i, 'kg').replace(/그램/i, 'g').replace(/㎖/i, 'ml').replace(/리터/i, 'L') || '';
  if (/kg/i.test(weightUnit) && /^\d{4}$/.test(weightNumber) && Number(weightNumber) < 10000) weightNumber = `${weightNumber[0]}.${weightNumber.slice(1)}`;
  const packMatch = String(text || '').match(/[x×*]\s*(\d+)\s*(개입|개|입|팩|봉)?|\(?\s*(\d+)\s*(인분|개입|입|팩|봉)\s*\)?/i);
  const pack = packMatch ? `${packMatch[1] || packMatch[3]}${packMatch[2] || packMatch[4] || '개'}` : '';
  const weight = [weightMatch ? `${weightNumber}${weightUnit}` : '', pack].filter(Boolean).join(' × ');
  return { name: (nameCandidates[0]?.line || '').slice(0, 80), price: priced[0]?.value || '', weight, text: lines.join('\n').slice(0, 1500) };
}

function makeBinaryCanvas(source) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 4) histogram[pixels[i]]++;
  const total = canvas.width * canvas.height;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let backgroundWeight = 0, backgroundSum = 0, bestVariance = 0, threshold = 150;
  for (let i = 0; i < 256; i++) {
    backgroundWeight += histogram[i];
    if (!backgroundWeight || backgroundWeight === total) continue;
    const foregroundWeight = total - backgroundWeight;
    backgroundSum += i * histogram[i];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) { bestVariance = variance; threshold = i; }
  }
  for (let i = 0; i < pixels.length; i += 4) {
    const value = pixels[i] < threshold ? 0 : 255;
    pixels[i] = value; pixels[i + 1] = value; pixels[i + 2] = value; pixels[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function numericPriceFromText(text) {
  const candidates = [...String(text || '').matchAll(/(?<!\d)(?:\d{1,3}(?:[,.\s]\d{3})+|\d{3,7})(?!\d)/g)].map((match) => {
    const raw = match[0];
    const value = Number(raw.replace(/[^0-9]/g, ''));
    let score = /\d[,.\s]\d{3}/.test(raw) ? 4 : 0;
    if (value % 10 === 0) score += 2;
    if (value >= 1000 && value < 1000000) score += 1;
    if (value >= 1000000) score -= 2;
    return { value, score };
  }).filter(({ value }) => value >= 100 && value <= 10000000);
  candidates.sort((a, b) => b.score - a.score || b.value - a.value);
  return candidates[0]?.score >= 3 ? candidates[0].value : '';
}

function analyzeDiscountOffer(text, fallbackPrice = '') {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  const compact = source.replace(/\s+/g, '');
  const values = [...source.matchAll(/(?<!\d)(?:\d{1,3}(?:,\d{3})+|\d{3,7})(?!\d)/g)]
    .map((match) => Number(match[0].replaceAll(',', '')))
    .filter((value) => value >= 100 && value <= 10000000);
  const hasDiscountLanguage = /할인|행사가|할인가|쿠폰|회원가|특가|세일|sale|off/i.test(compact);
  const percentMatch = hasDiscountLanguage
    ? compact.match(/(?:할인|행사|쿠폰|회원|특가|세일|sale|off)[^\d%]{0,25}(\d{1,2}(?:\.\d+)?)%|(\d{1,2}(?:\.\d+)?)%[^가-힣A-Za-z0-9]{0,12}(?:할인|행사|쿠폰|회원|특가|세일|sale|off)/i)
    : null;
  const negativeMatch = compact.match(/(?:-|−|–)(\d{1,3}(?:,\d{3})+|\d{3,7})/) || compact.match(/할인(?:액)?[:：]?(\d{1,3}(?:,\d{3})+|\d{3,7})원?/);
  const sortedPrices = [...new Set(values.filter(value => value >= 500))].sort((a,b) => b-a);
  const inferredAmount = hasDiscountLanguage && sortedPrices.length >= 2 && sortedPrices[0] - sortedPrices[1] >= 100 ? sortedPrices[0] - sortedPrices[1] : 0;
  const amount = negativeMatch ? Number(negativeMatch[1].replaceAll(',', '')) : inferredAmount;
  const type = percentMatch ? 'percent' : (amount && hasDiscountLanguage ? 'amount' : 'none');
  const discountValue = percentMatch ? Number(percentMatch[1] || percentMatch[2]) : (hasDiscountLanguage ? amount : 0);
  let originalPrice = values.length ? Math.max(...values) : Number(fallbackPrice) || 0;
  if (type === 'none') originalPrice = Number(fallbackPrice) || originalPrice;
  const computedFinal = type === 'amount'
    ? Math.max(0, originalPrice - discountValue)
    : type === 'percent' ? Math.round(originalPrice * (1 - discountValue / 100)) : originalPrice;
  const matchingFinal = values.find((value) => value === computedFinal);
  const conditions = [];
  if (/신세계포인트|포인트(?:적립|회원|카드)/i.test(compact)) conditions.push('포인트 적립/회원 조건');
  if (/삼성|국민|신한|현대|롯데|농협|우리|하나|비씨|BC/i.test(compact) && /카드|결제/i.test(compact)) conditions.push('해당 카드 결제 조건');
  if (/쿠폰|앱전용/i.test(compact)) conditions.push('쿠폰 또는 앱 사용 조건');
  if (/구독권|구독회원/i.test(compact)) conditions.push('구독권/구독 회원 조건');
  if (/회원가|멤버십/i.test(compact)) conditions.push('회원/멤버십 조건');
  if (/일부점포|점포별|지점별|입점점포/i.test(compact)) conditions.push('지점별 적용 조건');
  return {
    type,
    value: discountValue,
    originalPrice,
    finalPrice: matchingFinal || computedFinal,
    conditional: conditions.length > 0,
    condition: conditions.join(' · ') || (type !== 'none' ? '별도 조건 문구 없음' : '')
  };
}

function updateDetectedDiscountPreview() {
  const type = els.detectedDiscountType.value;
  const value = Number(els.detectedDiscountValue.value) || 0;
  const price = Number(els.productPrice.value.replaceAll(',', '')) || 0;
  const finalPrice = type === 'amount' ? Math.max(0, price - value) : type === 'percent' ? Math.round(price * (1 - value / 100)) : price;
  els.detectedFinalPrice.textContent = price ? won(finalPrice) : '-';
}

function syncDiscountAutoApply() {
  const condition=els.detectedDiscountCondition.value.trim();
  const conditional=Boolean(condition)&&condition!=='별도 조건 문구 없음';
  if(els.detectedDiscountType.value!=='none'&&Number(els.detectedDiscountValue.value)>0&&!conditional) els.applyDetectedDiscount.checked=true;
}

function showDetectedDiscount(offer) {
  els.detectedDiscountPanel.hidden = offer.type === 'none';
  els.detectedDiscountType.value = offer.type;
  els.detectedDiscountValue.value = offer.value || '';
  els.detectedDiscountCondition.value = offer.condition;
  els.applyDetectedDiscount.checked = offer.type !== 'none' && !offer.conditional;
  els.discountRequirementBadge.textContent = offer.conditional ? '조건부 할인' : '조건 없는 할인';
  els.discountRequirementBadge.classList.toggle('conditional', offer.conditional);
  updateDetectedDiscountPreview();
}

async function recognizePriceNumbers(worker, canvas) {
  try {
    els.scanStatus.textContent = '큰 가격 숫자를 다시 확인하는 중입니다…';
    await worker.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '0123456789,.' });
    const result = await worker.recognize(makeBinaryCanvas(canvas));
    return numericPriceFromText(result.data.text);
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '', preserve_interword_spaces: '1' }).catch(() => {});
  }
}

function inferCategory(name) {
  const text = String(name || '');
  if (/소고기|쇠고기|한우|돼지|삼겹|목살|갈비|닭고기|오리|육류|스테이크/i.test(text)) return '축산';
  if (/생선|고등어|갈치|연어|참치|새우|오징어|문어|조개|수산/i.test(text)) return '수산';
  if (/사과|배\b|포도|딸기|수박|참외|귤|오렌지|바나나|채소|야채|상추|양파|감자|고구마/i.test(text)) return '농산';
  if (/빵|베이글|케이크|도넛|크루아상|머핀|베이커리/i.test(text)) return '베이커리';
  if (/스타벅스|투썸|메가커피|컴포즈|이디야|빽다방|카페/i.test(text)) return '카페';
  if (/커피|라떼|음료|주스|콜라|사이다|생수|우유|차\b/i.test(text)) return '음료';
  if (/세제|휴지|샴푸|비누|치약|물티슈|청소/i.test(text)) return '생활용품';
  if (/사료|간식.*(?:견|묘)|반려|강아지|고양이/i.test(text)) return '반려동물';
  if (/화장품|크림|로션|영양제|비타민/i.test(text)) return '건강·미용';
  return '식품';
}

function normalizedProductName(value) {
  return String(value || '').toLowerCase().replace(/\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|개입|입)/gi, '').replace(/[^가-힣a-z0-9]/g, '');
}

function cleanRecognizedProductName(value) {
  const text=String(value||'').replace(/^[\d\W_]+|[\W_]+$/g,' ').replace(/\s+/g,' ').trim();
  const korean=(text.match(/[가-힣]/g)||[]).length, latin=(text.match(/[A-Za-z]/g)||[]).length;
  const latinTokens=text.match(/[A-Za-z]{1,}/g)||[];
  if(korean>=2 && latin>korean && latinTokens.length>=5){const koreanOnly=(text.match(/[가-힣]{2,}/g)||[]).join(' ');const kind=productKind(koreanOnly,'');return kind||koreanOnly;}
  return text;
}

function findCatalogMatch(name) {
  const target = normalizedProductName(name);
  if (target.length < 3) return null;
  let partial = null;
  for (const [code, product] of Object.entries(state.catalog)) {
    const candidate = normalizedProductName(product.name);
    if (candidate === target) return { code, product };
    if (!partial && Math.min(candidate.length, target.length) >= 5 && (candidate.includes(target) || target.includes(candidate))) partial = { code, product };
  }
  return partial;
}

function findCatalogSignatureMatch(price, weight) {
  if(!price)return null; const normalizedWeight=String(weight||'').toLowerCase().replace(/\s/g,'');
  let matches=Object.entries(state.catalog).filter(([,product])=>Number(product.price)===Number(price));
  if(normalizedWeight){const exactWeight=matches.filter(([,product])=>String(product.weight||'').toLowerCase().replace(/\s/g,'')===normalizedWeight);if(exactWeight.length)matches=exactWeight;}
  return matches.length===1?{code:matches[0][0],product:matches[0][1]}:null;
}

function findRecentStorePrice(code, name) {
  const store = els.purchaseStore.value;
  const target = normalizedProductName(name);
  const records = state.purchases.slice().sort((a, b) => b.date.localeCompare(a.date));
  for (const record of records) {
    if ((record.store || '미지정') !== store) continue;
    const item = record.items.find((entry) => entry.code === code || (target && normalizedProductName(entry.name) === target));
    if (item && Number.isFinite(Number(item.price))) return Number(item.price);
  }
  return null;
}

function showScanInsight(product, source) {
  els.scanInsightName.textContent = product.name || '상품명 확인 필요';
  els.scanInsightDetail.textContent = [product.weight, product.category].filter(Boolean).join(' · ') || '정보 없음';
  els.scanInsightPrice.textContent = Number.isFinite(Number(product.price)) && Number(product.price) > 0 ? won(product.price) : '가격 확인 필요';
  els.scanInsightSource.textContent = source;
  els.scanInsight.hidden = false;
}

async function detectBarcodeFromPhoto(file) {
  if (!('BarcodeDetector' in window)) return '';
  try {
    const bitmap = await createImageBitmap(file);
    const detector = await createBarcodeDetector();
    const codes = await detector.detect(bitmap);
    bitmap.close?.();
    return codes[0]?.rawValue ? String(codes[0].rawValue).trim() : '';
  } catch (_) {
    return '';
  }
}

async function prepareOcrCanvas(file) {
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  const target = Math.min(1800, Math.max(1200, longest));
  const scale = Math.min(2, target / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  ctx.filter = 'grayscale(1) contrast(1.5)';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const sample = document.createElement('canvas');
  sample.width = 120; sample.height = 120;
  const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
  sampleCtx.drawImage(canvas, 0, 0, 120, 120);
  const pixels = sampleCtx.getImageData(0, 0, 120, 120).data;
  let detail = 0, comparisons = 0;
  for (let y = 1; y < 119; y += 2) for (let x = 1; x < 119; x += 2) {
    const i = (y * 120 + x) * 4;
    detail += Math.abs(pixels[i] - pixels[i - 4]) + Math.abs(pixels[i] - pixels[i - 480]);
    comparisons += 2;
  }
  return { canvas, lowDetail: comparisons ? detail / comparisons < 6 : false };
}

async function getProductOcrWorker() {
  if (!state.ocrWorkerPromise) {
    state.ocrWorkerPromise = Tesseract.createWorker('kor+eng', 1, {
      logger: ({ status, progress }) => {
        if (status === 'recognizing text') els.scanStatus.textContent = `필요한 정보 인식 중 ${Math.round(progress * 100)}%`;
      }
    }).then(async (worker) => {
      await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
      return worker;
    }).catch((error) => { state.ocrWorkerPromise = null; throw error; });
  }
  return state.ocrWorkerPromise;
}

function cropPriceLabelCanvas(source) {
  const cropX = Math.round(source.width * .15);
  const cropY = Math.round(source.height * .08);
  const cropWidth = Math.round(source.width * .7);
  const cropHeight = Math.round(source.height * .66);
  const scale = Math.min(3, Math.max(1.6, 2400 / Math.max(cropWidth, cropHeight)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cropWidth * scale));
  canvas.height = Math.max(1, Math.round(cropHeight * scale));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.filter = 'grayscale(1) contrast(1.75)';
  ctx.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cropTightPriceLabelCanvas(source) {
  const cropX = Math.round(source.width * .24);
  const cropY = Math.round(source.height * .18);
  const cropWidth = Math.round(source.width * .52);
  const cropHeight = Math.round(source.height * .5);
  const scale = Math.min(4, Math.max(2, 2600 / Math.max(cropWidth, cropHeight)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cropWidth * scale));
  canvas.height = Math.max(1, Math.round(cropHeight * scale));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.filter = 'grayscale(1) contrast(1.9)';
  ctx.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cropProductTitleLine(source) {
  const cropX = Math.round(source.width * .08);
  const cropY = Math.round(source.height * .14);
  const cropWidth = Math.round(source.width * .84);
  const cropHeight = Math.round(source.height * .43);
  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.filter = 'grayscale(1) contrast(2)';
  ctx.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function recognizeTitleRegion(worker, canvas) {
  try {
    els.scanStatus.textContent = '가격표의 상품명을 집중해서 읽는 중입니다…';
    await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '', preserve_interword_spaces: '1' });
    const result = await worker.recognize(canvas);
    return result.data.text || '';
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' }).catch(() => {});
  }
}

async function recognizeSingleProductTitle(worker, canvas) {
  try {
    els.scanStatus.textContent = '한글 상품명 줄을 정밀하게 읽는 중입니다…';
    await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '', preserve_interword_spaces: '1' });
    const titleCanvas = cropProductTitleLine(canvas);
    const result = await worker.recognize(titleCanvas);
    let best = result.data.text || '';
    const useful = (best.match(/[가-힣A-Za-z]{2,}/g) || []).join('').length;
    const noise = (best.match(/[^가-힣A-Za-z0-9\s.,()x×*+\-/]/g) || []).length;
    if (useful < 4 || noise > 3) {
      const alternate = await worker.recognize(makeBinaryCanvas(titleCanvas));
      const alternateText = alternate.data.text || '';
      const score = (value) => (value.match(/[가-힣]/g) || []).length * 3 + (value.match(/[A-Za-z]/g) || []).length - (value.match(/[^가-힣A-Za-z0-9\s.,()x×*+\-/]/g) || []).length * 3;
      if (score(alternateText) > score(best)) best = alternateText;
    }
    return best;
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' }).catch(() => {});
  }
}

function resizeProductPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const max = 420;
        const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', .68));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function clearPendingProductPhoto() {
  state.pendingProductImage = null;
  els.productPhotoReady.hidden = true;
  els.productPhotoPreview.removeAttribute('src');
}

async function recognizeProductPhoto(file) {
  state.pendingProductImage = await resizeProductPhoto(file);
  els.productPhotoPreview.src = state.pendingProductImage;
  els.productPhotoReady.hidden = false;
  let parsed = { name: '', price: '', weight: '', text: '' };
  let lowDetail = false;
  const barcode = await detectBarcodeFromPhoto(file);
  if (window.Tesseract) {
    try {
      els.scanStatus.textContent = '사진을 선명하게 보정하는 중입니다…';
      const prepared = await prepareOcrCanvas(file);
      lowDetail = prepared.lowDetail;
      const worker = await getProductOcrWorker();
      const result = await worker.recognize(prepared.canvas);
      const focusedLabel = cropPriceLabelCanvas(prepared.canvas);
      const tightLabel = cropTightPriceLabelCanvas(prepared.canvas);
      const titleText = await recognizeTitleRegion(worker, focusedLabel);
      const tightText = await recognizeSingleProductTitle(worker, tightLabel);
      parsed = parseProductAndPrice(`${tightText}\n${titleText}\n${result.data.text}`);
      parsed.name = cleanRecognizedProductName(parsed.name);
      const verifiedPrice = await recognizePriceNumbers(worker, tightLabel);
      if (verifiedPrice && (!parsed.price || (verifiedPrice > parsed.price * 1.5 && verifiedPrice % 10 === 0))) parsed.price = verifiedPrice;
    } catch (_) {
      parsed.text = '사진 글자 인식에 실패했습니다. 상품명과 가격을 직접 확인해주세요.';
    }
  }
  const priceReadFromPhoto = Boolean(parsed.price);
  const match = findCatalogMatch(parsed.name) || findCatalogSignatureMatch(parsed.price, parsed.weight);
  const key = parsed.name.toLowerCase().replace(/[^가-힣a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
  const code = barcode || match?.code || `photo:${key || Date.now()}`;
  const existing = state.catalog[barcode] || state.catalog[code] || match?.product;
  const recentPrice = existing ? findRecentStorePrice(code, existing.name) : null;
  if (!parsed.price && recentPrice !== null) parsed.price = recentPrice;
  if (!parsed.price && existing?.price) parsed.price = existing.price;
  if (!parsed.name && existing?.name) parsed.name = existing.name;
  if (!parsed.weight && existing?.weight) parsed.weight = existing.weight;
  const offer = analyzeDiscountOffer(parsed.text, parsed.price || existing?.price);
  if (offer.originalPrice) parsed.price = offer.originalPrice;
  state.pendingCode = code;
  els.dialogCode.textContent = '상품·가격표 사진으로 등록';
  els.productName.value = existing?.name || parsed.name;
  els.productWeight.value = existing?.weight || parsed.weight;
  els.productPrice.value = parsed.price || existing?.price || '';
  els.productCategory.value = existing?.category || inferCategory(parsed.name);
  els.productDialogPreview.src = state.pendingProductImage;
  els.productDialogPreview.hidden = false;
  showDetectedDiscount(offer);
  els.dialog.showModal();
  const shownPrice = offer.type !== 'none' ? offer.finalPrice : parsed.price;
  const source = offer.type !== 'none'
    ? (offer.conditional ? `조건부 할인 · ${offer.condition}` : '조건 없는 할인 감지')
    : (!priceReadFromPhoto && recentPrice !== null ? `${els.purchaseStore.value}의 최근 저장 가격` : (!priceReadFromPhoto && existing ? '이전에 직접 저장한 가격' : '사진에서 읽은 가격'));
  showScanInsight({ name: parsed.name, weight: parsed.weight, category: parsed.name ? inferCategory(parsed.name) : '', price: shownPrice }, source);
  els.scanStatus.textContent = `인식 결과를 확인하고 필요한 내용을 수정해주세요.${lowDetail ? ' 사진이 흐려 특히 숫자를 확인해주세요.' : ''}`;
  return false;
}

function cleanPromotion(value) {
  if (!value || typeof value !== 'object') return null;
  const type = value.type;
  const positive = (key) => Number.isFinite(Number(value[key])) && Number(value[key]) > 0 ? Number(value[key]) : null;
  if (type === 'plus' && positive('buy') && positive('free')) return { type, buy: positive('buy'), free: positive('free') };
  if (type === 'bundle' && positive('count') && positive('bundlePrice')) return { type, count: positive('count'), bundlePrice: positive('bundlePrice') };
  const condition = typeof value.condition === 'string' ? value.condition.slice(0, 160) : '';
  if (type === 'percent' && positive('percent') && positive('percent') <= 100) return { type, percent: positive('percent'), condition };
  if (type === 'amount' && positive('amount')) return { type, amount: positive('amount'), condition };
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
    return { id: String(record.id || `restored-${recordIndex}-${record.date}`).slice(0, 200), date: record.date, store: String(record.store || '미지정').slice(0, 60), branch: String(record.branch || '').slice(0, 60), items, total: items.reduce((sum, item) => sum + item.total, 0) };
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
  refreshStoreFilter();
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
  const store = els.dashboardStore.value;
  const records = state.purchases.filter((record) => record.date.startsWith(month) && (store === 'all' || (record.store || '미지정') === store));
  if (!records.length) return showToast('선택한 달의 내보낼 기록이 없습니다.');
  const rows = [['이용 날짜', '매장', '지점', '상품명', '무게·용량·구성', '품목', '단가(원)', '수량', '행사', '최종 금액(원)']];
  for (const record of records) for (const item of record.items) rows.push([record.date, record.store || '미지정', record.branch || '', item.name, item.weight || '', item.category || '미분류', item.price, item.quantity, promotionLabel(item.promotion) || '없음', item.total]);
  const csv = '\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  downloadFile(csv, `barohapgye-expenses-${month}.csv`, 'text/csv;charset=utf-8');
  showToast(`${month} 지출 내역을 내보냈습니다.`);
}

function updateBackupStatus() {
  const date = localStorage.getItem('quickSumLastBackup');
  els.backupStatus.textContent = date ? `마지막 백업: ${date}` : '아직 백업하지 않았습니다.';
}

function openPurchaseSummary() {
  const items = Object.values(state.cart);
  if (!items.length) return showToast('저장할 상품이 없습니다.');
  if (!els.purchaseDate.value) return showToast('이용 날짜를 선택해주세요.');
  if (!els.purchaseStore.value) return showToast('이용 매장을 선택해주세요.');
  const storeName = `${els.purchaseStore.value}${els.purchaseBranch.value.trim() ? ` · ${els.purchaseBranch.value.trim()}` : ''}`;
  els.checkoutMeta.textContent = `${els.purchaseDate.value} · ${storeName} · 총 ${items.reduce((sum, item) => sum + item.quantity, 0)}개`;
  els.checkoutItems.innerHTML = items.map((item) => {
    const discounted = discountedUnitPrice(item);
    const unit = item.promotion?.type === 'percent' && discounted !== item.price
      ? `<s>${won(item.price)}</s><b>${won(discounted)}</b>`
      : `<b>${won(item.price)}</b>`;
    return `<div class="checkout-row"><span><strong>${escapeHtml(item.name)}${item.weight ? ` · ${escapeHtml(item.weight)}` : ''}</strong><small>${unit}${item.promotion ? ` · ${escapeHtml(promotionLabel(item.promotion))}` : ''}</small></span><span>${item.quantity}개</span><strong>${won(promotionTotal(item))}</strong></div>`;
  }).join('');
  els.checkoutGrandTotal.textContent = won(items.reduce((sum, item) => sum + promotionTotal(item), 0));
  els.checkoutDialog.showModal();
}

function saveCurrentPurchase() {
  const items = Object.values(state.cart);
  if (!items.length) return showToast('저장할 상품이 없습니다.');
  const record = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: els.purchaseDate.value,
    store: els.purchaseStore.value,
    branch: els.purchaseBranch.value.trim(),
    total: items.reduce((sum, item) => sum + promotionTotal(item), 0),
    items: items.map((item) => ({ code: item.code, name: item.name, weight: item.weight || '', category: item.category || '미분류', price: item.price, quantity: item.quantity, promotion: item.promotion || null, total: promotionTotal(item) }))
  };
  state.purchases.push(record);
  savePurchases();
  refreshStoreFilter();
  state.cart = {};
  state.pendingCode = null;
  resetQuantityControl();
  render();
  els.dashboardMonth.value = record.date.slice(0, 7);
  showView('dashboard');
  showToast('오늘의 전체 지출을 한 건으로 저장했습니다.');
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

function aggregateMonth(month, store = 'all') {
  const records = state.purchases.filter((record) => record.date.startsWith(month) && (store === 'all' || (record.store || '미지정') === store));
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

function drawMonthlyChart(month, store = 'all') {
  const months = monthSequence(month);
  const values = months.map((key) => aggregateMonth(key, store).total);
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

function allPurchasedItems(records = state.purchases) {
  return records.flatMap((record) => record.items.map((item) => ({ ...item, store: record.store || '미지정', branch: record.branch || '', date: record.date })));
}

function discountStats(records) {
  const items = allPurchasedItems(records);
  const original = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const paid = items.reduce((sum, item) => sum + Number(item.total), 0);
  return { original, paid, saved: Math.max(0, original - paid), rate: original > 0 ? (original - paid) / original * 100 : 0 };
}

function answerAdvisor(question) {
  const q = String(question).replace(/\s+/g, ' ').trim();
  const yearMatch = q.match(/(20\d{2})년?/);
  const year = yearMatch?.[1] || String(new Date().getFullYear());
  const records = state.purchases.filter((record) => record.date.startsWith(year));
  if (!records.length) return `${year}년의 저장된 지출 기록이 아직 없어요. 장보기를 최종 저장하면 분석할 수 있습니다.`;
  const items = allPurchasedItems(records);
  const byProduct = {}, byStore = {};
  for (const item of items) {
    byProduct[item.name] ??= { quantity: 0, amount: 0 };
    byProduct[item.name].quantity += item.quantity; byProduct[item.name].amount += item.total;
    byStore[item.store] ??= { visits: new Set(), amount: 0, products: {} };
    byStore[item.store].visits.add(item.date); byStore[item.store].amount += item.total;
    byStore[item.store].products[item.name] = (byStore[item.store].products[item.name] || 0) + item.quantity;
  }
  const products = Object.entries(byProduct).sort((a,b) => b[1].quantity-a[1].quantity);
  const stores = Object.entries(byStore).sort((a,b) => b[1].visits.size-a[1].visits.size || b[1].amount-a[1].amount);
  if (/가장.*많이.*산|자주.*산.*물품|최다.*상품/.test(q)) return `${year}년에 가장 많이 산 상품은 ‘${products[0][0]}’이며 ${products[0][1].quantity}개, 총 ${won(products[0][1].amount)}을 기록했어요.`;
  if (/매장.*상품|어떤.*매장.*뭐|잘 팔/.test(q)) return stores.slice(0,5).map(([store,data]) => { const top=Object.entries(data.products).sort((a,b)=>b[1]-a[1])[0]; return `${store}: 내 기록에서는 ${top?.[0] || '-'} ${top?.[1] || 0}개`; }).join('\n') + '\n※ 매장 전체 판매량이 아니라 내 구매 기록 기준입니다.';
  if (/자주.*(?:이용|간|가는).*매장|단골.*매장|매장.*자주/.test(q)) { const [name,data]=stores[0]; return `${year}년에 가장 자주 이용한 매장은 ${name}으로 ${data.visits.size}일 방문했고, 총 ${won(data.amount)}을 사용했어요.`; }
  if (/할인/.test(q) && /평균|년도|연도|율/.test(q)) { const s=discountStats(records); const previous=discountStats(state.purchases.filter(r=>r.date.startsWith(String(Number(year)-1)))); const comparison=previous.original?` 전년 ${previous.rate.toFixed(1)}%보다 ${(s.rate-previous.rate).toFixed(1)}%p ${s.rate>=previous.rate?'높아요':'낮아요'}.`:''; return `${year}년 기록의 평균 할인율은 ${s.rate.toFixed(1)}%예요.${comparison} 표시 단가 기준 ${won(s.original)}에서 ${won(s.saved)}을 절약해 ${won(s.paid)}을 결제했어요.`; }
  if (/행사|언제/.test(q)) { const promo=items.filter(i=>i.promotion); if(!promo.length) return `${year}년에는 저장된 행사 적용 기록이 없어요. 향후 행사는 매장·지점별로 달라 실시간 공식 정보 확인이 필요합니다.`; const months={}; promo.forEach(i=>{const m=i.date.slice(0,7);months[m]=(months[m]||0)+1;}); const best=Object.entries(months).sort((a,b)=>b[1]-a[1])[0]; return `내 기록에서는 ${best[0]}에 행사 적용 상품이 ${best[1]}건으로 가장 많았어요. 미래 행사 일정은 공개된 공식 정보와 지점 안내를 확인해야 합니다.`; }
  const namedStore=stores.find(([name])=>q.toLowerCase().includes(name.toLowerCase()));
  if(namedStore){const [name,data]=namedStore;const top=Object.entries(data.products).sort((a,b)=>b[1]-a[1])[0];return `${year}년 ${name} 이용 기록은 ${data.visits.size}일, 총 ${won(data.amount)}이에요. 가장 많이 산 상품은 ‘${top?.[0]||'-'}’ ${top?.[1]||0}개입니다.`;}
  const queryCore=normalizedProductName(q.replace(/올해|작년|금액|가격|단가|얼마|몇\s*개|구매|샀어|샀나|알려줘|보여줘|\?/g,' '));
  const matchingProducts=products.filter(([name])=>{const key=normalizedProductName(name);return queryCore.length>=2&&(key.includes(queryCore)||queryCore.includes(key));});
  if(matchingProducts.length){const names=new Set(matchingProducts.map(([name])=>name));const found=items.filter(item=>names.has(item.name)).sort((a,b)=>b.date.localeCompare(a.date));const prices=found.map(i=>Number(i.price));const quantity=found.reduce((sum,i)=>sum+i.quantity,0);const amount=found.reduce((sum,i)=>sum+i.total,0);const latest=found[0];return `‘${latest.name}’은 ${year}년에 ${quantity}개, 총 ${won(amount)} 구매했어요. 최근 단가는 ${won(latest.price)}(${latest.store}, ${latest.date})이고 기록된 단가는 최저 ${won(Math.min(...prices))}, 최고 ${won(Math.max(...prices))}, 평균 ${won(Math.round(prices.reduce((a,b)=>a+b,0)/prices.length))}이에요.`;}
  if (/인상|인하|가격.*변|올랐|내렸/.test(q)) { const trends=buildPriceTrends(); if(!trends.length) return '같은 상품을 두 번 이상 구매한 기록이 있어야 가격 변화를 계산할 수 있어요.'; const t=trends.sort((a,b)=>Math.abs(b.changeRate)-Math.abs(a.changeRate))[0]; return `${t.store}의 ‘${t.name}’ 가격은 최초 ${won(t.first)}에서 최근 ${won(t.latest)}으로 ${Math.abs(t.changeRate).toFixed(1)}% ${t.changeRate>=0?'인상':'인하'}됐어요.`; }
  if (/전체|총.*지출|얼마.*썼|소비.*요약/.test(q)) return `${year}년에는 ${records.length}번 장을 봤고 ${items.reduce((n,i)=>n+i.quantity,0)}개 상품에 총 ${won(records.reduce((s,r)=>s+r.total,0))}을 사용했어요.`;
  if (/추천|뭘.*살|다음.*구매|절약.*방법/.test(q)) { const recommendations=buildPersonalRecommendations(); return recommendations.length?recommendations.slice(0,3).map(item=>item.text).join('\n'):'반복 구매 기록과 무게·용량 정보가 더 쌓이면 구매 시기와 단위가격을 비교해 추천할 수 있어요.'; }
  return `‘${q}’에 맞는 상품이나 분석 항목을 기록에서 찾지 못했어요. 저장된 상품명을 포함해 “치아바타 가격”, “자주 이용하는 매장”, “평균 할인율”, “가격이 오른 상품”처럼 물어보세요.`;
}

function advisorSource(question) {
  if (/행사|언제|공식/.test(question)) return '내 행사 기록 · 현재 행사는 공식 확인 필요';
  if (/추천|가성비|뭘.*살/.test(question)) return '내 구매 기록 · 단위가격 계산';
  return '내 기기에 저장된 지출 기록';
}

function addAdvisorMessage(text, role, source='') {
  const div=document.createElement('div'); div.className=`advisor-message ${role}`;
  if(source){const small=document.createElement('small');small.textContent=`분석 기준 · ${source}`;div.appendChild(small);}
  div.appendChild(document.createTextNode(text)); els.advisorMessages.appendChild(div); els.advisorMessages.scrollTop=els.advisorMessages.scrollHeight;
}

function buildPriceTrends() {
  const groups={};
  for(const item of allPurchasedItems()) { const key=`${item.store}|${normalizedProductName(item.name)}`; (groups[key]??=[]).push(item); }
  return Object.values(groups).filter(list=>list.length>=2).map(list=>{list.sort((a,b)=>a.date.localeCompare(b.date));const prices=list.map(i=>Number(i.price));const first=prices[0],latest=prices.at(-1);return{name:list.at(-1).name,store:list[0].store,first,latest,average:prices.reduce((a,b)=>a+b,0)/prices.length,changeRate:first?((latest-first)/first*100):0,count:list.length};});
}

function unitInfo(weight) {
  const match=String(weight||'').match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|개입|개|입)/i); if(!match)return null;
  let amount=Number(match[1].replace(',','.')); const unit=match[2].toLowerCase();
  if(unit==='kg'||unit==='l') amount*=1000;
  return /ml|l/.test(unit)?{amount,unit:'100ml',factor:100}:{amount,unit:/개|입/.test(unit)?'1개':'100g',factor:/개|입/.test(unit)?1:100};
}

function productKind(name, category) {
  const kinds=['우유','두유','생수','콜라','커피','라면','김치','치즈','요거트','계란','달걀','휴지','세제','샴푸','고기','돼지고기','소고기','닭고기'];
  return kinds.find(k=>String(name).includes(k)) || null;
}

function buildValueComparisons() {
  const latest={}; for(const item of allPurchasedItems()){const key=`${item.store}|${normalizedProductName(item.name)}`;if(!latest[key]||latest[key].date<item.date)latest[key]=item;}
  const groups={}; for(const item of Object.values(latest)){const unit=unitInfo(item.weight);const key=productKind(item.name,item.category);if(!unit||!key)continue;(groups[key]??=[]).push({...item,unitPrice:Number(item.price)/unit.amount*unit.factor,unitLabel:unit.unit});}
  return Object.entries(groups).filter(([,list])=>list.length>=2).map(([kind,list])=>({kind,items:list.sort((a,b)=>a.unitPrice-b.unitPrice)}));
}

function buildPersonalRecommendations() {
  const items=allPurchasedItems(); const groups={};
  for(const item of items){const key=normalizedProductName(item.name);if(key)(groups[key]??=[]).push(item);}
  const today=new Date(localDate()); const recommendations=[];
  for(const list of Object.values(groups)){list.sort((a,b)=>a.date.localeCompare(b.date));const unique=[...new Set(list.map(i=>i.date))];if(unique.length>=2){const gaps=unique.slice(1).map((date,i)=>(new Date(date)-new Date(unique[i]))/86400000);const cycle=Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length);const since=Math.floor((today-new Date(unique.at(-1)))/86400000);if(cycle>0&&since>=cycle*.75)recommendations.push({score:since/cycle,text:`‘${list.at(-1).name}’은 평균 ${cycle}일 간격으로 샀고 마지막 구매 후 ${since}일 지났어요. 필요 수량과 현재 가격을 확인할 시기예요.`});}}
  for(const trend of buildPriceTrends().filter(t=>t.changeRate>=5))recommendations.push({score:1+trend.changeRate/100,text:`${trend.store}의 ‘${trend.name}’ 최근 단가가 최초 기록보다 ${trend.changeRate.toFixed(1)}% 올랐어요. 다른 매장의 단위가격도 비교해보세요.`});
  for(const group of buildValueComparisons()){const [best,next]=group.items;if(next&&next.unitPrice>best.unitPrice)recommendations.push({score:1.2,text:`${group.kind}은 현재 기록상 ‘${best.name}’이 ${best.unitLabel}당 ${won(Math.round(best.unitPrice))}으로 비교 상품보다 저렴해요.`});}
  return recommendations.sort((a,b)=>b.score-a.score);
}

function buildStoreInsights() {
  const groups={};
  for(const record of state.purchases){const name=record.store||'미지정';groups[name]??={records:[],items:[]};groups[name].records.push(record);groups[name].items.push(...record.items);}
  return Object.entries(groups).map(([store,data])=>{const products={};data.items.forEach(item=>products[item.name]=(products[item.name]||0)+item.quantity);const top=Object.entries(products).sort((a,b)=>b[1]-a[1])[0];const stats=discountStats(data.records);return{store,visits:data.records.length,total:data.records.reduce((s,r)=>s+r.total,0),average:data.records.reduce((s,r)=>s+r.total,0)/data.records.length,top,rate:stats.rate};}).sort((a,b)=>b.visits-a.visits||b.total-a.total);
}

function renderAdvancedAnalysis() {
  const trends=buildPriceTrends().sort((a,b)=>Math.abs(b.changeRate)-Math.abs(a.changeRate));
  els.priceTrendList.innerHTML=trends.length?trends.slice(0,8).map(t=>`<div class="analysis-row"><strong>${escapeHtml(t.name)}</strong><span>${escapeHtml(t.store)} · 평균 ${won(Math.round(t.average))}</span><small>${won(t.first)} → ${won(t.latest)} · ${Math.abs(t.changeRate).toFixed(1)}% ${t.changeRate>=0?'인상':'인하'}</small></div>`).join(''):'<p class="cart-meta">같은 상품의 구매 기록이 2회 이상 쌓이면 표시됩니다.</p>';
  const comparisons=buildValueComparisons();
  els.valueComparisonList.innerHTML=comparisons.length?comparisons.slice(0,6).map(group=>{const best=group.items[0];return `<div class="analysis-row best"><strong>${escapeHtml(group.kind)} 추천: ${escapeHtml(best.name)}</strong><span>${escapeHtml(best.store)} · ${best.unitLabel}당 ${won(Math.round(best.unitPrice))}</span><small>${group.items.slice(0,3).map(i=>`${escapeHtml(i.name)} ${won(Math.round(i.unitPrice))}`).join(' / ')}</small></div>`;}).join(''):'<p class="cart-meta">같은 종류의 상품에 무게·용량(g/kg/ml/L) 또는 개수를 입력하면 단위가격을 비교합니다.</p>';
  const recommendations=buildPersonalRecommendations();
  els.personalRecommendationList.innerHTML=recommendations.length?recommendations.slice(0,6).map(item=>`<div class="analysis-row best"><strong>추천</strong><span>${escapeHtml(item.text)}</span></div>`).join(''):'<p class="cart-meta">반복 구매와 가격 기록이 쌓이면 구매 시기와 절약 방법을 추천합니다.</p>';
  const stores=buildStoreInsights();
  els.storeInsightList.innerHTML=stores.length?stores.slice(0,6).map(item=>`<div class="analysis-row"><strong>${escapeHtml(item.store)}</strong><span>${item.visits}회 · 총 ${won(item.total)} · 회당 평균 ${won(Math.round(item.average))}</span><small>내가 가장 많이 산 상품: ${escapeHtml(item.top?.[0]||'-')} ${item.top?.[1]||0}개 · 평균 할인율 ${item.rate.toFixed(1)}%</small></div>`).join(''):'<p class="cart-meta">저장된 매장 이용 기록이 없습니다.</p>';
}

function receiptPriceCandidates(text) {
  const lines=String(text||'').split(/\r?\n/).map(v=>v.replace(/\s+/g,' ').trim()).filter(Boolean); const totals=[];
  for(const line of lines){const nums=[...line.matchAll(/(?<!\d)(\d{1,3}(?:,\d{3})+|\d{3,7})(?!\d)/g)].map(m=>Number(m[1].replaceAll(',',''))).filter(n=>n>=100);if(nums.length)totals.push({value:Math.max(...nums),score:/합계|결제|받을|총액|카드/.test(line)?5:0});}
  totals.sort((a,b)=>b.score-a.score||b.value-a.value); return totals[0]?.value||0;
}

async function checkReceipt(file) {
  const cart=Object.values(state.cart); if(!cart.length){showToast('먼저 장바구니에 상품을 담아주세요.');return;}
  els.receiptCheckResult.hidden=false; els.receiptCheckResult.className='receipt-check-result'; els.receiptCheckResult.innerHTML='<strong>영수증을 분석하는 중입니다…</strong>';
  try {const prepared=await prepareOcrCanvas(file);const worker=await getProductOcrWorker();await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'',preserve_interword_spaces:'1'});const result=await worker.recognize(prepared.canvas);await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'});const text=result.data.text||'';const receiptTotal=receiptPriceCandidates(text);const expected=cart.reduce((s,i)=>s+promotionTotal(i),0);const missing=cart.filter(item=>{const key=normalizedProductName(item.name);const tokens=String(item.name).match(/[가-힣]{2,}|[A-Za-z]{3,}/g)||[];return !(key&&normalizedProductName(text).includes(key))&&!tokens.some(t=>text.replace(/\s/g,'').includes(t));});const diff=receiptTotal?receiptTotal-expected:null;const ok=receiptTotal&&diff===0&&missing.length===0;els.receiptCheckResult.classList.add(ok?'ok':'warn');els.receiptCheckResult.innerHTML=`<strong>${ok?'계산 내용과 영수증이 일치합니다.':'확인이 필요한 차이가 있습니다.'}</strong><span>장바구니 예상 합계: ${won(expected)}${receiptTotal?`<br>영수증 결제 합계: ${won(receiptTotal)}<br>차이: ${diff>0?'+':''}${won(diff)}`:'<br>영수증 총액을 확실히 읽지 못했습니다.'}${missing.length?`<br>영수증에서 확인되지 않은 상품: ${missing.map(i=>escapeHtml(i.name)).join(', ')}`:''}</span>`;}catch(_){els.receiptCheckResult.classList.add('warn');els.receiptCheckResult.innerHTML='<strong>영수증을 읽지 못했습니다.</strong><span>영수증 전체가 평평하고 크게 보이도록 다시 촬영해주세요.</span>';}
}

function renderDashboard() {
  const month = els.dashboardMonth.value || localDate().slice(0, 7);
  const store = els.dashboardStore.value || 'all';
  const data = aggregateMonth(month, store);
  const ranking = Object.entries(data.products).sort((a, b) => b[1].quantity - a[1].quantity);
  els.monthSpend.textContent = won(data.total);
  els.purchaseCount.textContent = `${data.records.length}회`;
  els.monthItemCount.textContent = `${data.itemCount.toLocaleString('ko-KR')}개`;
  els.topProduct.textContent = ranking[0]?.[0] || '-';
  els.selectedStoreKpi.textContent = store === 'all' ? '전체' : store;
  els.dashboardEmpty.hidden = data.records.length > 0;
  els.dashboardContent.hidden = state.purchases.length === 0;
  if (!state.purchases.length) return;
  drawMonthlyChart(month, store);
  if (Object.keys(data.categories).length) drawCategoryChart(data.categories);
  else { const { ctx, width, height } = canvasContext(els.categoryChart, 240); ctx.fillStyle = '#8490a3'; ctx.textAlign = 'center'; ctx.fillText('선택한 달의 데이터가 없습니다.', width / 2, height / 2); els.categoryLegend.innerHTML = ''; }
  const maxQty = ranking[0]?.[1].quantity || 1;
  els.productRanking.innerHTML = ranking.length ? ranking.slice(0, 5).map(([name, value], index) => `<div class="rank-row"><span class="rank-number">${index + 1}</span><span class="rank-name">${escapeHtml(name)}</span><span class="rank-value">${value.quantity}개 · ${won(value.amount)}</span><div class="rank-bar"><span style="width:${value.quantity / maxQty * 100}%"></span></div></div>`).join('') : '<p class="cart-meta">선택한 달의 데이터가 없습니다.</p>';
  els.historyList.innerHTML = data.records.slice().sort((a, b) => b.date.localeCompare(a.date)).map((record) => `<div class="history-row" data-id="${escapeHtml(record.id)}"><time>${record.date.slice(5).replace('-', '.')}</time><span class="history-store">${escapeHtml(record.store || '미지정')}${record.branch ? ` · ${escapeHtml(record.branch)}` : ''}</span><span class="history-items">${escapeHtml(record.items.map((item) => `${item.name} ${item.quantity}개`).join(', '))}</span><strong class="history-total">${won(record.total)}</strong><button class="delete-history" type="button">삭제</button></div>`).join('') || '<p class="cart-meta">선택한 달의 기록이 없습니다.</p>';
  renderAdvancedAnalysis();
}

function refreshStoreFilter() {
  const selected = els.dashboardStore.value || 'all';
  const stores = [...new Set(state.purchases.map((record) => record.store || '미지정'))].sort((a, b) => a.localeCompare(b, 'ko'));
  els.dashboardStore.innerHTML = '<option value="all">전체 매장</option>' + stores.map((store) => `<option value="${escapeHtml(store)}">${escapeHtml(store)}</option>`).join('');
  els.dashboardStore.value = stores.includes(selected) ? selected : 'all';
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
    percent: [['percent', '할인율(%)', promo.percent ?? '', 100]], amount: [['amount', '개당 할인액(원)', promo.amount ?? '']], none: []
  };
  els.promotionFields.innerHTML = definitions[els.promotionType.value].map(([name, label, value, max]) =>
    `<label>${label}<input name="${name}" type="number" inputmode="decimal" min="1" ${max ? `max="${max}"` : ''} value="${value}" required></label>`).join('');
}

function openDiscountEditor(code) {
  const item = state.cart[code];
  if (!item) return showToast('할인을 적용할 상품을 먼저 스캔하세요.');
  state.promotionCode = code;
  state.pendingCode = code;
  els.promotionTitle.textContent = '상품 할인율을 입력하세요';
  els.promotionProduct.textContent = `${item.name} · 원래 단가 ${won(item.price)}`;
  els.promotionPreview.hidden = true;
  els.promotionText.value = '';
  updateEventExplanation();
  els.promotionType.value = 'percent';
  renderPromotionFields(item.promotion?.type === 'percent' ? item.promotion : {});
  els.promotionDialog.showModal();
  requestAnimationFrame(() => els.promotionFields.querySelector('input')?.focus());
}

async function readPromotionPhoto(file) {
  const code = state.pendingCode;
  if (!code || !state.catalog[code]) return showToast('먼저 등록된 상품을 스캔하세요.');
  state.promotionCode = code;
  els.promotionTitle.textContent = '인식된 행사 내용을 확인하세요';
  els.promotionPreview.src = URL.createObjectURL(file);
  els.promotionPreview.hidden = false;
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
    updateEventExplanation();
    els.promotionType.value = promo.type;
    renderPromotionFields(promo);
    showToast(promo.type === 'none' ? '자동 판별하지 못했어요. 직접 선택해주세요.' : '행사 내용을 찾았습니다.');
  } catch (_) {
    els.promotionText.value = '';
    updateEventExplanation();
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

async function createBarcodeDetector() {
  const wantedFormats = ['qr_code', 'ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e'];
  const supportedFormats = await BarcodeDetector.getSupportedFormats?.();
  const formats = supportedFormats?.length
    ? wantedFormats.filter((format) => supportedFormats.includes(format))
    : wantedFormats;
  return new BarcodeDetector(formats.length ? { formats } : undefined);
}

async function captureAndScan() {
  if (!state.stream) {
    await startCamera();
    if (!state.stream) return showToast('카메라를 켠 뒤 다시 눌러주세요.');
  }
  if (els.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await new Promise((resolve) => {
      const done = () => resolve();
      els.video.addEventListener('loadeddata', done, { once: true });
      setTimeout(done, 1200);
    });
  }
  if (els.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return showToast('카메라 화면이 준비되지 않았습니다. 잠시 후 다시 눌러주세요.');
  els.captureScanButton.disabled = true;
  els.cameraStage.classList.add('capturing');
  try {
    const canvas = document.createElement('canvas');
    canvas.width = els.video.videoWidth;
    canvas.height = els.video.videoHeight;
    canvas.getContext('2d', { alpha: false }).drawImage(els.video, 0, 0);
    const detector = await createBarcodeDetector();
    const codes = await detector.detect(canvas);
    if (!codes[0]?.rawValue) {
      els.scanStatus.textContent = '코드를 찾지 못했습니다. 안내선 안에 바코드나 QR을 더 크게 맞춰 다시 촬영해주세요.';
      showToast('코드를 찾지 못했어요. 가까이에서 다시 촬영해주세요.');
      return;
    }
    navigator.vibrate?.(80);
    acceptCode(codes[0].rawValue);
    els.scanStatus.textContent = '사진에서 코드를 인식했습니다.';
    showToast('촬영한 화면에서 코드를 인식했어요.');
  } catch (_) {
    showToast('촬영한 화면을 읽지 못했습니다. 다시 시도해주세요.');
  } finally {
    setTimeout(() => els.cameraStage.classList.remove('capturing'), 180);
    els.captureScanButton.disabled = false;
  }
}

async function scanLoop() {
  let detector;
  try {
    detector = await createBarcodeDetector();
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
els.captureScanButton.addEventListener('click', captureAndScan);
els.productPhotoButton.addEventListener('click', () => els.productPhoto.click());
els.productPhoto.addEventListener('change', async () => {
  const file = els.productPhoto.files[0];
  els.productPhoto.value = '';
  if (!file) return;
  els.productPhotoButton.disabled = true;
  els.productPhotoButton.textContent = '사진 분석 중…';
  try {
    const registered = await recognizeProductPhoto(file);
    showToast(registered ? '상품명과 금액을 자동 등록했어요.' : '읽지 못한 내용을 확인해주세요.');
  } catch (_) {
    showToast('상품·가격표를 읽지 못했습니다. 다시 촬영해주세요.');
  } finally {
    els.productPhotoButton.disabled = false;
    els.productPhotoButton.textContent = '📷 스캔하기';
  }
});
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
els.productPrice.addEventListener('input', updateDetectedDiscountPreview);
els.detectedDiscountType.addEventListener('change', () => { updateDetectedDiscountPreview(); syncDiscountAutoApply(); });
els.detectedDiscountValue.addEventListener('input', () => { updateDetectedDiscountPreview(); syncDiscountAutoApply(); });
els.detectedDiscountCondition.addEventListener('input', () => {
  const conditional = Boolean(els.detectedDiscountCondition.value.trim()) && els.detectedDiscountCondition.value.trim() !== '별도 조건 문구 없음';
  els.discountRequirementBadge.textContent = conditional ? '조건부 할인' : '조건 없는 할인';
  els.discountRequirementBadge.classList.toggle('conditional', conditional);
});
els.productForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = els.productName.value.trim();
  const weight = els.productWeight.value.trim();
  const price = Number(els.productPrice.value.replaceAll(',', ''));
  if (!name || !Number.isFinite(price)) return;
  const code = state.pendingCode;
  state.catalog[code] = { name, price, weight, ...(state.pendingProductImage ? { image: state.pendingProductImage } : {}) };
  state.catalog[code].category = els.productCategory.value;
  saveCatalog();
  els.dialog.close();
  clearPendingProductPhoto();
  addToCart(code);
  const discountType = els.detectedDiscountType.value;
  const discountValue = Number(els.detectedDiscountValue.value);
  if (els.applyDetectedDiscount.checked && discountType !== 'none' && discountValue > 0 && state.cart[code]) {
    state.cart[code].promotion = discountType === 'amount'
      ? { type: 'amount', amount: discountValue, condition: els.detectedDiscountCondition.value.trim() }
      : { type: 'percent', percent: Math.min(100, discountValue), condition: els.detectedDiscountCondition.value.trim() };
    render();
  }
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
els.discountRateButton.addEventListener('click', () => openDiscountEditor(state.pendingCode));
els.promotionPhoto.addEventListener('change', () => {
  const file = els.promotionPhoto.files[0];
  if (file) readPromotionPhoto(file);
  els.promotionPhoto.value = '';
});
els.promotionText.addEventListener('input', () => {
  const promo = detectPromotion(els.promotionText.value);
  if (promo.type !== 'none') { els.promotionType.value = promo.type; renderPromotionFields(promo); }
  updateEventExplanation();
});
els.eventWebSearch.addEventListener('click', () => openEventSearch(false));
els.officialEventSearch.addEventListener('click', () => openEventSearch(true));
els.promotionType.addEventListener('change', () => renderPromotionFields());
els.cancelPromotion.addEventListener('click', () => els.promotionDialog.close());
els.promotionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.promotionForm));
  const promo = { type: els.promotionType.value };
  for (const key of ['buy', 'free', 'count', 'bundlePrice', 'percent', 'amount']) if (data[key] !== undefined) promo[key] = Number(data[key]);
  if (promo.type === 'percent' && (!Number.isFinite(promo.percent) || promo.percent <= 0 || promo.percent > 100)) return showToast('할인율은 1~100 사이로 입력해주세요.');
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
  if (button.dataset.action === 'discount') {
    openDiscountEditor(code);
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
els.savePurchaseButton.addEventListener('click', openPurchaseSummary);
els.cancelCheckout.addEventListener('click', () => els.checkoutDialog.close());
els.confirmPurchaseSave.addEventListener('click', () => {
  els.checkoutDialog.close();
  saveCurrentPurchase();
});
els.dashboardMonth.addEventListener('change', renderDashboard);
els.dashboardStore.addEventListener('change', renderDashboard);
els.advisorForm.addEventListener('submit', (event) => {
  event.preventDefault(); const question=els.advisorInput.value.trim(); if(!question)return;
  addAdvisorMessage(question,'user'); addAdvisorMessage(answerAdvisor(question),'bot',advisorSource(question)); els.advisorInput.value='';
});
document.querySelector('.advisor-suggestions').addEventListener('click', (event) => {
  const button=event.target.closest('button'); if(!button)return; addAdvisorMessage(button.textContent,'user'); addAdvisorMessage(answerAdvisor(button.textContent),'bot',advisorSource(button.textContent));
});
els.dashboardEventSearch.addEventListener('click', () => {
  const store=els.dashboardStore.value==='all'?'대형마트 편의점':els.dashboardStore.value;
  window.open(`https://search.naver.com/search.naver?query=${encodeURIComponent(`${store} ${localDate().slice(0,7)} 공식 행사 할인`)}`,'_blank','noopener,noreferrer');
});
els.receiptPhotoButton.addEventListener('click', () => els.receiptPhoto.click());
els.receiptPhoto.addEventListener('change', async () => { const file=els.receiptPhoto.files[0]; if(file)await checkReceipt(file); els.receiptPhoto.value=''; });
els.historyList.addEventListener('click', (event) => {
  const button = event.target.closest('.delete-history');
  if (!button || !confirm('이 지출 기록을 삭제할까요?')) return;
  const id = button.closest('.history-row').dataset.id;
  state.purchases = state.purchases.filter((record) => record.id !== id);
  savePurchases();
  refreshStoreFilter();
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

if (window.Tesseract) {
  const warmUpOcr = () => getProductOcrWorker().catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(warmUpOcr, { timeout: 2500 });
  else setTimeout(warmUpOcr, 900);
}

setMode('product');
els.purchaseDate.value = localDate();
els.dashboardMonth.value = localDate().slice(0, 7);
state.cart = JSON.parse(localStorage.getItem('quickSumCart') || '{}');
refreshStoreFilter();
updateBackupStatus();
render();

