const savedCatalog = JSON.parse(localStorage.getItem('quickSumCatalog') || '{}');
const savedPurchases = JSON.parse(localStorage.getItem('quickSumPurchases') || '[]');
const state = { mode: 'product', pendingCode: null, pendingProductImage: null, promotionCode: null, pendingBackup: null, catalog: savedCatalog, cart: {}, purchases: savedPurchases, stream: null, scanning: false, lastScan: { value: '', at: 0 }, ocrWorkerPromise: null };

const $ = (id) => document.getElementById(id);
const els = {
  video: $('video'), cameraStage: $('cameraStage'), cameraPlaceholder: $('cameraPlaceholder'), cameraButton: $('cameraButton'), captureScanButton: $('captureScanButton'),
  productPhotoButton: $('productPhotoButton'), productPhoto: $('productPhoto'), productPhotoReady: $('productPhotoReady'), productPhotoPreview: $('productPhotoPreview'), productDialogPreview: $('productDialogPreview'), productOcrLabel: $('productOcrLabel'), productOcrText: $('productOcrText'),
  scanInsight: $('scanInsight'), scanInsightName: $('scanInsightName'), scanInsightDetail: $('scanInsightDetail'), scanInsightPrice: $('scanInsightPrice'), scanInsightSource: $('scanInsightSource'),
  switchModeButton: $('switchModeButton'), modeBadge: $('modeBadge'), scannerTitle: $('scannerTitle'), scanStatus: $('scanStatus'),
  quantityForm: $('quantityForm'), quantityInput: $('quantityInput'), quantityLabel: $('quantityLabel'), quantitySubmit: $('quantitySubmit'), cartList: $('cartList'), emptyState: $('emptyState'),
  grandTotal: $('grandTotal'), totalCount: $('totalCount'), resetButton: $('resetButton'), dialog: $('productDialog'),
  productForm: $('productForm'), productName: $('productName'), productWeight: $('productWeight'), productCategory: $('productCategory'), productPrice: $('productPrice'), dialogCode: $('dialogCode'),
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
  checkoutDialog: $('checkoutDialog'), checkoutMeta: $('checkoutMeta'), checkoutItems: $('checkoutItems'), checkoutGrandTotal: $('checkoutGrandTotal'), cancelCheckout: $('cancelCheckout'), confirmPurchaseSave: $('confirmPurchaseSave')
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
    els.productOcrText.value = '';
    els.productOcrLabel.hidden = true;
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
  if (promo.type === 'plus') return `${promo.buy}+${promo.free} 적용`;
  if (promo.type === 'bundle') return `${promo.count}개 ${won(promo.bundlePrice)} 적용`;
  if (promo.type === 'percent') return `${promo.percent}% 할인 적용`;
  if (promo.type === 'amount') return `${won(promo.amount)} 할인 적용`;
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
    for (const match of line.matchAll(/(?:₩|￦)\s*(\d{1,3}(?:,\d{3})+|\d{3,7})|(\d{1,3}(?:,\d{3})+|\d{3,7})\s*원|(\d{1,3}(?:,\d{3})+)/g)) {
      const value = Number((match[1] || match[2] || match[3]).replaceAll(',', ''));
      if (value >= 100 && value <= 10000000) priced.push({ value, line, score: /행사|할인|판매|회원|최종|구매가/.test(line) ? 2 : 1 });
    }
  }
  priced.sort((a, b) => b.score - a.score || a.value - b.value);
  const nameCandidates = lines.map((line) => line
    .replace(/(?:₩|￦)?\s*\d{1,3}(?:,\d{3})+\s*원?/g, ' ')
    .replace(/\d{3,7}\s*원/g, ' ')
    .replace(/정상가|판매가|구매가|회원가|행사가|할인가|할인|행사|바코드|카드|포인트|기간/gi, ' ')
    .replace(/\s+/g, ' ').trim()
  ).filter((line) => /[가-힣A-Za-z]{2}/.test(line) && !/^\d[\d\s.,%-]*$/.test(line))
    .sort((a, b) => Math.min(b.length, 45) - Math.min(a.length, 45));
  const weightMatch = String(text || '').match(/(\d+(?:[.,]\d+)?)\s*(kg|㎏|킬로그램|g|그램|ml|mL|㎖|l|L|리터)(?![A-Za-z])/i);
  const weight = weightMatch ? `${weightMatch[1].replace(',', '.')}${weightMatch[2].replace(/킬로그램|㎏/i, 'kg').replace(/그램/i, 'g').replace(/㎖/i, 'ml').replace(/리터/i, 'L')}` : '';
  return { name: (nameCandidates[0] || '').slice(0, 80), price: priced[0]?.value || '', weight, text: lines.join('\n').slice(0, 1500) };
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
  if (barcode && state.catalog[barcode]) {
    const known = state.catalog[barcode];
    const recentPrice = findRecentStorePrice(barcode, known.name);
    if (recentPrice !== null) known.price = recentPrice;
    known.image = state.pendingProductImage;
    saveCatalog();
    state.pendingCode = barcode;
    showScanInsight(known, recentPrice !== null ? `${els.purchaseStore.value}의 최근 저장 가격` : '이전에 직접 저장한 가격');
    clearPendingProductPhoto();
    addToCart(barcode);
    els.scanStatus.textContent = `${known.name} · ${won(known.price)} 자동 등록 완료`;
    return true;
  }
  if (window.Tesseract) {
    try {
      els.scanStatus.textContent = '사진을 선명하게 보정하는 중입니다…';
      const prepared = await prepareOcrCanvas(file);
      lowDetail = prepared.lowDetail;
      const worker = await getProductOcrWorker();
      const result = await worker.recognize(prepared.canvas);
      parsed = parseProductAndPrice(result.data.text);
    } catch (_) {
      parsed.text = '사진 글자 인식에 실패했습니다. 상품명과 가격을 직접 확인해주세요.';
    }
  }
  const priceReadFromPhoto = Boolean(parsed.price);
  const match = findCatalogMatch(parsed.name);
  const key = parsed.name.toLowerCase().replace(/[^가-힣a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
  const code = barcode || match?.code || `photo:${key || Date.now()}`;
  const existing = state.catalog[code] || match?.product;
  const recentPrice = existing ? findRecentStorePrice(code, existing.name) : null;
  if (!parsed.price && recentPrice !== null) parsed.price = recentPrice;
  if (!parsed.price && existing?.price) parsed.price = existing.price;
  if (!parsed.name && existing?.name) parsed.name = existing.name;
  if (!parsed.weight && existing?.weight) parsed.weight = existing.weight;
  state.pendingCode = code;
  if (parsed.name && parsed.price) {
    state.catalog[code] = {
      ...(existing || {}),
      name: parsed.name,
      price: Number(parsed.price),
      weight: parsed.weight,
      category: existing?.category || inferCategory(parsed.name),
      image: state.pendingProductImage
    };
    saveCatalog();
    const source = !priceReadFromPhoto && recentPrice !== null && Number(parsed.price) === recentPrice
      ? `${els.purchaseStore.value}의 최근 저장 가격`
      : (!priceReadFromPhoto && existing ? '이전에 직접 저장한 가격' : '사진에서 읽은 가격');
    showScanInsight(state.catalog[code], source);
    clearPendingProductPhoto();
    addToCart(code);
    els.scanStatus.textContent = `${parsed.name}${parsed.weight ? ` · ${parsed.weight}` : ''} · ${won(parsed.price)} 자동 등록 완료${lowDetail ? ' (사진이 흐려 결과를 확인해주세요)' : ''}`;
    return true;
  }
  els.dialogCode.textContent = '상품·가격표 사진으로 등록';
  els.productName.value = existing?.name || parsed.name;
  els.productWeight.value = existing?.weight || parsed.weight;
  els.productPrice.value = existing?.price ?? parsed.price;
  if (existing?.category) els.productCategory.value = existing.category;
  els.productDialogPreview.src = state.pendingProductImage;
  els.productDialogPreview.hidden = false;
  els.productOcrText.value = parsed.text || '사진에서 글자를 찾지 못했습니다.';
  els.productOcrLabel.hidden = false;
  els.dialog.showModal();
  showScanInsight({ name: parsed.name, weight: parsed.weight, category: parsed.name ? inferCategory(parsed.name) : '', price: parsed.price }, '확인 가능한 가격 근거가 부족합니다.');
  els.scanStatus.textContent = parsed.name && parsed.price
    ? '상품명과 가격을 자동 입력했습니다. 내용을 확인한 뒤 등록해주세요.'
    : '일부 내용을 읽지 못했습니다. 등록창에서 상품명과 가격을 확인해주세요.';
  return false;
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
  const rows = [['이용 날짜', '매장', '지점', '상품명', '중량·용량', '품목', '단가(원)', '수량', '행사', '최종 금액(원)']];
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
