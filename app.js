const storageIssues = new Map();
const storageWriteApproved = new Set();
let pendingStorageNotice = '';
const APP_VERSION = '55';
const ANONYMOUS_USAGE_KEY = 'quickSumAnonymousUsage';
const SURVEY_STATE_KEY = 'quickSumSurveyState';
const ONBOARDING_STATE_KEY = 'quickSumOnboardingState';
const ANONYMOUS_USAGE_VERSION = 1;
const ANONYMOUS_USAGE_LIMIT = 500;
const ALLOWED_USAGE_EVENTS = new Set([
  'app_start', 'ocr_start', 'ocr_success', 'ocr_failure', 'product_fields_modified', 'price_candidate_selected',
  'direct_input_used', 'cart_add', 'quantity_changed', 'discount_applied', 'discount_cancelled',
  'card_discount_approved', 'card_discount_rejected', 'purchase_save', 'receipt_check', 'backup', 'restore',
  'storage_error', 'survey_shown', 'survey_answered', 'survey_skipped'
]);
const ALLOWED_USAGE_FIELDS = new Set(['inputMethod', 'success', 'durationMs', 'modifiedFields', 'cartItemCount', 'errorType']);
const ALLOWED_MODIFIED_FIELDS = new Set(['productName', 'price', 'quantity', 'specification', 'category', 'discount']);
const ALLOWED_INPUT_METHODS = new Set(['manual', 'photo', 'live', 'barcode', 'unknown']);
const ALLOWED_ERROR_TYPES = new Set([
  'quota', 'write', 'download', 'status-write', 'unavailable', 'recognition', 'not-found', 'validation',
  'storage-prepare', 'rollback', 'commit', 'empty-cart', 'missing-store', 'purchase-write', 'cart-clear',
  'store-write', 'commit-verify'
]);
const ALLOWED_SCREEN_WIDTHS = new Set(['up-to-320', '321-360', '361-390', '391-412', 'over-412']);
const ALLOWED_NETWORK_STATES = new Set(['online', 'offline']);
let anonymousUsageUnavailable = false;

function screenWidthBucket() {
  const width = window.innerWidth || document.documentElement?.clientWidth || 0;
  if (width <= 320) return 'up-to-320';
  if (width <= 360) return '321-360';
  if (width <= 390) return '361-390';
  if (width <= 412) return '391-412';
  return 'over-412';
}

function validIsoTime(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function sanitizeStoredUsageEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !ALLOWED_USAGE_EVENTS.has(value.event)) return null;
  if (!validIsoTime(value.occurredAt) || typeof value.appVersion !== 'string' || !/^\d{1,6}$/.test(value.appVersion)) return null;
  if (!ALLOWED_SCREEN_WIDTHS.has(value.screenWidth) || !ALLOWED_NETWORK_STATES.has(value.network)) return null;
  return {
    event: value.event,
    occurredAt: value.occurredAt,
    appVersion: value.appVersion,
    screenWidth: value.screenWidth,
    network: value.network,
    ...sanitizeUsageDetails(value)
  };
}

function sanitizeUsageEnvelope(value) {
  if (!value || typeof value !== 'object' || value.version !== ANONYMOUS_USAGE_VERSION || !Array.isArray(value.events)) return null;
  const events = [];
  for (const candidate of value.events) {
    const safe = sanitizeStoredUsageEvent(candidate);
    if (safe) events.push(safe);
  }
  return { version: ANONYMOUS_USAGE_VERSION, events: events.slice(-ANONYMOUS_USAGE_LIMIT) };
}

function readAnonymousUsage() {
  const raw = localStorage.getItem(ANONYMOUS_USAGE_KEY);
  if (!raw) return { version: ANONYMOUS_USAGE_VERSION, events: [] };
  try {
    const parsed = JSON.parse(raw);
    const sanitized = sanitizeUsageEnvelope(parsed);
    if (!sanitized) throw new Error('invalid-usage-shape');
    const safeRaw = JSON.stringify(sanitized);
    if (safeRaw !== raw) {
      try { localStorage.setItem(ANONYMOUS_USAGE_KEY, safeRaw); } catch (_) {}
    }
    return sanitized;
  } catch (_) {
    anonymousUsageUnavailable = true;
    return { version: ANONYMOUS_USAGE_VERSION, events: [] };
  }
}

function sanitizeUsageDetails(details = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(details)) {
    if (!ALLOWED_USAGE_FIELDS.has(key)) continue;
    if (key === 'success' && typeof value === 'boolean') safe.success = value;
    else if (key === 'durationMs' && typeof value === 'number' && Number.isFinite(value)) safe.durationMs = Math.max(0, Math.min(300000, Math.round(value)));
    else if (key === 'cartItemCount' && typeof value === 'number' && Number.isInteger(value)) safe.cartItemCount = Math.max(0, Math.min(999, value));
    else if (key === 'modifiedFields' && Array.isArray(value)) safe.modifiedFields = [...new Set(value.filter((field) => ALLOWED_MODIFIED_FIELDS.has(field)))];
    else if (key === 'inputMethod' && ALLOWED_INPUT_METHODS.has(value)) safe.inputMethod = value;
    else if (key === 'errorType' && ALLOWED_ERROR_TYPES.has(value)) safe.errorType = value;
  }
  return safe;
}

function updateAnonymousUsageCount() {
  const target = document.getElementById('anonymousUsageCount');
  if (!target) return;
  const count = readAnonymousUsage().events.length;
  target.textContent = anonymousUsageUnavailable ? '익명 이용기록을 읽지 못했습니다. 삭제 후 다시 사용할 수 있습니다.' : `저장된 익명 이용기록 ${count.toLocaleString('ko-KR')}개`;
}

function recordUsage(eventName, details = {}) {
  if (!ALLOWED_USAGE_EVENTS.has(eventName) || anonymousUsageUnavailable) return false;
  try {
    const usage = readAnonymousUsage();
    if (anonymousUsageUnavailable) return false;
    const event = {
      event: eventName,
      occurredAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      screenWidth: screenWidthBucket(),
      network: navigator.onLine ? 'online' : 'offline',
      ...sanitizeUsageDetails(details)
    };
    usage.events = [...usage.events, event].slice(-ANONYMOUS_USAGE_LIMIT);
    localStorage.setItem(ANONYMOUS_USAGE_KEY, JSON.stringify(usage));
    updateAnonymousUsageCount();
    return true;
  } catch (_) {
    return false;
  }
}

function readSurveyState() {
  const empty = { version: 1, newPurchaseSuccessCount: 0, firstStatus: '', thirdStatus: '', responses: [] };
  const safelyClosed = { version: 1, newPurchaseSuccessCount: 3, firstStatus: 'skipped', thirdStatus: 'skipped', responses: [] };
  const raw = localStorage.getItem(SURVEY_STATE_KEY);
  if (raw === null) return empty;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1 || !Number.isSafeInteger(parsed.newPurchaseSuccessCount) || parsed.newPurchaseSuccessCount < 0) return safelyClosed;
    const statuses = new Set(['', 'shown', 'answered', 'skipped']);
    let firstStatus = statuses.has(parsed.firstStatus) ? parsed.firstStatus : 'skipped';
    let thirdStatus = statuses.has(parsed.thirdStatus) ? parsed.thirdStatus : 'skipped';
    if (parsed.newPurchaseSuccessCount >= 1 && !firstStatus) firstStatus = 'skipped';
    if (parsed.newPurchaseSuccessCount >= 3 && !thirdStatus) thirdStatus = 'skipped';
    const responses = Array.isArray(parsed.responses) ? parsed.responses.map(sanitizeSurveyResponse).filter(Boolean) : [];
    const sanitized = { version: 1, newPurchaseSuccessCount: parsed.newPurchaseSuccessCount, firstStatus, thirdStatus, responses };
    const safeRaw = JSON.stringify(sanitized);
    if (safeRaw !== raw) {
      try { localStorage.setItem(SURVEY_STATE_KEY, safeRaw); } catch (_) {}
    }
    return sanitized;
  } catch (_) {
    return safelyClosed;
  }
}

function saveSurveyState(value) {
  try {
    const sanitized = sanitizeSurveyStateForSave(value);
    if (!sanitized) return false;
    const serialized = JSON.stringify(sanitized);
    localStorage.setItem(SURVEY_STATE_KEY, serialized);
    return localStorage.getItem(SURVEY_STATE_KEY) === serialized;
  } catch (_) {
    return false;
  }
}

function safeReadStorage(key, fallback, label, validator) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (!validator(parsed)) throw new Error('invalid-shape');
    return parsed;
  } catch (_) {
    const recoveryKey = `quickSumRecovery:${key}:${Date.now()}`;
    let recoverySaved = false;
    try {
      localStorage.setItem(recoveryKey, raw);
      recoverySaved = true;
    } catch (_) {}
    storageIssues.set(key, { label, recoveryKey: recoverySaved ? recoveryKey : '', raw });
    return fallback;
  }
}

function isQuotaError(error) {
  return error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error?.code === 22 || error?.code === 1014;
}

function withoutImagesJson(value) {
  return JSON.stringify(value, (key, current) => key === 'image' ? undefined : current);
}

function storageResult(ok, code, extra = {}) {
  return { ok, code, persisted: ok, verified: Boolean(extra.verified), imageOmitted: Boolean(extra.imageOmitted), ...extra };
}

function persistStorage(key, value, label, { allowImageFallback = false } = {}) {
  if (storageIssues.has(key) && !storageWriteApproved.has(key)) {
    showToast(`${label}의 손상된 원본을 보호하기 위해 새 저장을 중단했습니다.`);
    return storageResult(false, 'protected-corrupt-source');
  }
  const verifyWrite = (serialized) => localStorage.getItem(key) === serialized;
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(key, serialized);
    if (!verifyWrite(serialized)) return storageResult(false, 'verification-failed');
    return storageResult(true, 'saved', { verified: true });
  } catch (error) {
    if (allowImageFallback && isQuotaError(error)) {
      try {
        const serialized = withoutImagesJson(value);
        localStorage.setItem(key, serialized);
        if (!verifyWrite(serialized)) return storageResult(false, 'verification-failed');
        pendingStorageNotice = '저장공간이 부족해 사진은 저장하지 않았지만 상품 정보는 안전하게 저장했습니다.';
        showToast(pendingStorageNotice);
        return storageResult(true, 'saved-without-image', { verified: true, imageOmitted: true });
      } catch (_) {}
    }
    recordUsage('storage_error', { success: false, errorType: isQuotaError(error) ? 'quota' : 'write', cartItemCount: Object.keys(state?.cart || {}).length });
    showToast(isQuotaError(error)
      ? `${label}을 저장할 공간이 부족합니다. 기존 기록은 유지됩니다. 사진 정리, 익명 이용기록 삭제 또는 전체 백업 후 다시 시도해 주세요.`
      : `${label}을 기기에 저장하지 못했습니다. 기존 기록은 변경하지 않았습니다.`, { error: true });
    showBackupReminder('storage');
    return storageResult(false, isQuotaError(error) ? 'quota-exceeded' : 'write-failed');
  }
}

const RESTORE_ROLLBACK_KEY = 'quickSumRestoreRollback';
const RESTORE_STATE_KEY = 'quickSumRestoreState';
const PURCHASE_ROLLBACK_KEY = 'quickSumPurchaseRollback';
const PURCHASE_STATE_KEY = 'quickSumPurchaseState';
const APP_DATA_KEYS = ['quickSumCatalog', 'quickSumPurchases', 'quickSumCart', 'quickSumCustomStores'];
let interruptedRestoreRecovered = false;

function captureRawStorage() {
  return Object.fromEntries(APP_DATA_KEYS.map((key) => [key, localStorage.getItem(key)]));
}

function restoreRawStorage(snapshot) {
  try {
    for (const key of APP_DATA_KEYS) {
      if (snapshot[key] === null || snapshot[key] === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, snapshot[key]);
    }
    return APP_DATA_KEYS.every((key) => localStorage.getItem(key) === (snapshot[key] ?? null));
  } catch (_) {
    return false;
  }
}

function recoverInterruptedRestore() {
  const marker = localStorage.getItem(RESTORE_STATE_KEY);
  const rollbackRaw = localStorage.getItem(RESTORE_ROLLBACK_KEY);
  if (!marker || !rollbackRaw) return;
  try {
    const transaction = JSON.parse(marker);
    if (transaction.status === 'committed') {
      localStorage.removeItem(RESTORE_STATE_KEY);
      localStorage.removeItem(RESTORE_ROLLBACK_KEY);
      return;
    }
    const snapshot = JSON.parse(rollbackRaw);
    if (restoreRawStorage(snapshot)) {
      localStorage.removeItem(RESTORE_STATE_KEY);
      localStorage.removeItem(RESTORE_ROLLBACK_KEY);
      interruptedRestoreRecovered = true;
    }
  } catch (_) {}
}

function recoverInterruptedPurchase() {
  const marker = localStorage.getItem(PURCHASE_STATE_KEY);
  const rollbackRaw = localStorage.getItem(PURCHASE_ROLLBACK_KEY);
  if (!marker || !rollbackRaw) return;
  try {
    const transaction = JSON.parse(marker);
    if (transaction.status === 'committed') {
      localStorage.removeItem(PURCHASE_STATE_KEY);
      localStorage.removeItem(PURCHASE_ROLLBACK_KEY);
      return;
    }
    const snapshot = JSON.parse(rollbackRaw);
    if (restoreRawStorage(snapshot)) {
      localStorage.removeItem(PURCHASE_STATE_KEY);
      localStorage.removeItem(PURCHASE_ROLLBACK_KEY);
    }
  } catch (_) {}
}

recoverInterruptedRestore();
recoverInterruptedPurchase();

const savedCatalog = safeReadStorage('quickSumCatalog', {}, '상품 목록', (value) => value && typeof value === 'object' && !Array.isArray(value));
const savedPurchases = safeReadStorage('quickSumPurchases', [], '구매기록', Array.isArray);
const DEFAULT_STORES = ['트레이더스', '이마트', '홈플러스', '롯데마트', '코스트코', 'GS25', 'CU', '세븐일레븐', '이마트24', '미니스톱', '스타벅스', '투썸플레이스', '메가커피', '컴포즈커피', '카페', '기타'];
const savedCustomStores = safeReadStorage('quickSumCustomStores', [], '직접 등록 매장', Array.isArray);
const savedCart = safeReadStorage('quickSumCart', {}, '장바구니', (value) => value && typeof value === 'object' && !Array.isArray(value));
const state = { mode: 'product', pendingCode: null, pendingFingerprint: '', pendingProductImage: null, pendingSimilarCode: null, pendingInputMethod: '', pendingRecognizedFields: null, promotionCode: null, pendingBackup: null, catalog: savedCatalog, cart: {}, purchases: savedPurchases, customStores: Array.isArray(savedCustomStores) ? savedCustomStores : [], stream: null, scanning: false, liveScanning: false, liveBusy: false, liveCandidate: { signature: '', count: 0 }, lastScan: { value: '', at: 0 }, ocrWorkerPromise: null, cameraRequestId: 0, cameraStarting: false, ocrTaskId: 0, photoOcrBusy: false };

const $ = (id) => document.getElementById(id);
const els = {
  video: $('video'), cameraStage: $('cameraStage'), cameraPlaceholder: $('cameraPlaceholder'), cameraButton: $('cameraButton'), captureScanButton: $('captureScanButton'),
  liveScanButton: $('liveScanButton'), liveCameraPanel: $('liveCameraPanel'), productPhotoButton: $('productPhotoButton'), productPhoto: $('productPhoto'), manualProductButton: $('manualProductButton'), productPhotoReady: $('productPhotoReady'), productPhotoPreview: $('productPhotoPreview'), productDialogPreview: $('productDialogPreview'),
  scanInsight: $('scanInsight'), scanInsightName: $('scanInsightName'), scanInsightDetail: $('scanInsightDetail'), scanInsightPrice: $('scanInsightPrice'), scanInsightSource: $('scanInsightSource'),
  switchModeButton: $('switchModeButton'), modeBadge: $('modeBadge'), scannerTitle: $('scannerTitle'), scanStatus: $('scanStatus'),
  quantityForm: $('quantityForm'), quantityInput: $('quantityInput'), quantityLabel: $('quantityLabel'), quantitySubmit: $('quantitySubmit'), cartList: $('cartList'), emptyState: $('emptyState'),
  grandTotal: $('grandTotal'), totalCount: $('totalCount'), resetButton: $('resetButton'), dialog: $('productDialog'),
  productForm: $('productForm'), productName: $('productName'), productWeight: $('productWeight'), productCategory: $('productCategory'), productPrice: $('productPrice'), productPriceError: $('productPriceError'), productQuantity: $('productQuantity'), productSubmitButton: $('productSubmitButton'), dialogCode: $('dialogCode'), priceChangeNotice: $('priceChangeNotice'), priceChangeText: $('priceChangeText'), recognitionWarning: $('recognitionWarning'), priceCandidatePanel: $('priceCandidatePanel'), priceCandidateOptions: $('priceCandidateOptions'), similarProductPanel: $('similarProductPanel'), similarProductText: $('similarProductText'),
  detectedDiscountPanel: $('detectedDiscountPanel'), detectedDiscountType: $('detectedDiscountType'), detectedDiscountValue: $('detectedDiscountValue'), detectedDiscountError: $('detectedDiscountError'), detectedDiscountCondition: $('detectedDiscountCondition'), detectedFinalPrice: $('detectedFinalPrice'), discountRequirementBadge: $('discountRequirementBadge'), applyDetectedDiscount: $('applyDetectedDiscount'),
  cancelDialog: $('cancelDialog'), scanPriceDialog: $('scanPriceDialog'), toast: $('toast'),
  promotionPhotoButton: $('promotionPhotoButton'), promotionPhoto: $('promotionPhoto'), promotionDialog: $('promotionDialog'),
  discountRateButton: $('discountRateButton'), promotionForm: $('promotionForm'), promotionTitle: $('promotionTitle'), promotionProduct: $('promotionProduct'), promotionPreview: $('promotionPreview'),
  promotionText: $('promotionText'), promotionType: $('promotionType'), promotionFields: $('promotionFields'), promotionFieldError: $('promotionFieldError'), cancelPromotion: $('cancelPromotion'),
  eventStore: $('eventStore'), eventBranch: $('eventBranch'), eventWebSearch: $('eventWebSearch'), officialEventSearch: $('officialEventSearch'), eventExplanation: $('eventExplanation'),
  installButton: $('installButton'), calculatorView: $('calculatorView'), dashboardView: $('dashboardView'),
  purchaseDate: $('purchaseDate'), purchaseStore: $('purchaseStore'), customStoreEntry: $('customStoreEntry'), purchaseCustomStore: $('purchaseCustomStore'), saveCustomStore: $('saveCustomStore'), purchaseBranch: $('purchaseBranch'), savePurchaseButton: $('savePurchaseButton'), dashboardMonth: $('dashboardMonth'), dashboardStore: $('dashboardStore'),
  monthSpend: $('monthSpend'), purchaseCount: $('purchaseCount'), monthItemCount: $('monthItemCount'), topProduct: $('topProduct'), selectedStoreKpi: $('selectedStoreKpi'),
  dashboardEmpty: $('dashboardEmpty'), dashboardContent: $('dashboardContent'), monthlyChart: $('monthlyChart'),
  categoryChart: $('categoryChart'), categoryLegend: $('categoryLegend'), productRanking: $('productRanking'), historyList: $('historyList'),
  backupButton: $('backupButton'), restoreButton: $('restoreButton'), csvButton: $('csvButton'), restoreFile: $('restoreFile'), anonymousJsonButton: $('anonymousJsonButton'), anonymousCsvButton: $('anonymousCsvButton'), clearAnonymousButton: $('clearAnonymousButton'), clearAllDataButton: $('clearAllDataButton'), anonymousUsageCount: $('anonymousUsageCount'),
  restoreDialog: $('restoreDialog'), restoreForm: $('restoreForm'), restoreSummary: $('restoreSummary'), cancelRestore: $('cancelRestore'), backupStatus: $('backupStatus'), backupReminder: $('backupReminder'), backupReminderText: $('backupReminderText'), dismissBackupReminder: $('dismissBackupReminder'),
  checkoutDialog: $('checkoutDialog'), checkoutMeta: $('checkoutMeta'), checkoutItems: $('checkoutItems'), checkoutGrandTotal: $('checkoutGrandTotal'), cancelCheckout: $('cancelCheckout'), confirmPurchaseSave: $('confirmPurchaseSave'),
  advisorForm: $('advisorForm'), advisorInput: $('advisorInput'), advisorMessages: $('advisorMessages'), priceTrendList: $('priceTrendList'), valueComparisonList: $('valueComparisonList'), personalRecommendationList: $('personalRecommendationList'), storeInsightList: $('storeInsightList'), dashboardEventSearch: $('dashboardEventSearch'),
  receiptPhotoButton: $('receiptPhotoButton'), receiptPhoto: $('receiptPhoto'), receiptCheckResult: $('receiptCheckResult'), surveyDialog: $('surveyDialog'), surveyForm: $('surveyForm'), surveyQuestion: $('surveyQuestion'), surveyOptions: $('surveyOptions'), skipSurvey: $('skipSurvey'), closeSurvey: $('closeSurvey'),
  onboardingDialog: $('onboardingDialog'), onboardingHelpButton: $('onboardingHelpButton'), closeOnboarding: $('closeOnboarding'), startOnboarding: $('startOnboarding'), networkStatus: $('networkStatus'), retryPhotoDialog: $('retryPhotoDialog'), scannerCard: document.querySelector('.scanner-card'),
  updateNotice: $('updateNotice'), updateNoticeText: $('updateNoticeText'), laterUpdateButton: $('laterUpdateButton'), applyUpdateButton: $('applyUpdateButton')
};

const dialogReturnFocus = new WeakMap();
function isSafeFocusTarget(element) {
  if (!(element instanceof HTMLElement) || !element.isConnected || element.hidden || element.matches(':disabled')) return false;
  if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  if (element.closest('#calculatorView') && els.calculatorView?.hidden) return false;
  if (element.closest('#dashboardView') && els.dashboardView?.hidden) return false;
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return element.getClientRects().length > 0 && (element.tabIndex >= 0 || /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(element.tagName));
}

function tryFocus(element) {
  if (!isSafeFocusTarget(element)) return false;
  try { element.focus(); } catch (_) { return false; }
  return document.activeElement === element;
}

function focusCurrentViewFallback() {
  const activeTab = document.querySelector('.view-tabs button.active');
  if (tryFocus(activeTab)) return;
  const currentView = !els.dashboardView?.hidden ? els.dashboardView : els.calculatorView;
  const candidate = [...(currentView?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]') || [])].find(isSafeFocusTarget);
  if (tryFocus(candidate)) return;
  const fallback = currentView || document.querySelector('main');
  if (fallback instanceof HTMLElement) {
    if (!fallback.hasAttribute('tabindex')) fallback.setAttribute('tabindex', '-1');
    fallback.focus();
  }
}

function openAccessibleDialog(dialog, focusTarget = null) {
  if (!dialog || dialog.open) return false;
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialogReturnFocus.set(dialog, trigger);
  dialog.showModal();
  if (focusTarget) requestAnimationFrame(() => focusTarget.focus());
  return true;
}
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('close', () => {
  const target = dialogReturnFocus.get(dialog);
  dialogReturnFocus.delete(dialog);
  const restoreFocus = () => {
    if (tryFocus(target)) return;
    else focusCurrentViewFallback();
  };
  requestAnimationFrame(() => {
    restoreFocus();
    setTimeout(() => {
      if (!isSafeFocusTarget(document.activeElement)) focusCurrentViewFallback();
    }, 0);
  });
}));

const won = (value) => `${Number(value).toLocaleString('ko-KR')}원`;
const saveCatalog = (value = state.catalog) => persistStorage('quickSumCatalog', value, '상품 목록', { allowImageFallback: true });
const savePurchases = (value = state.purchases) => persistStorage('quickSumPurchases', value, '구매기록', { allowImageFallback: true });
const saveCart = (value = state.cart) => persistStorage('quickSumCart', value, '장바구니', { allowImageFallback: true });
const saveCustomStores = (value = state.customStores) => persistStorage('quickSumCustomStores', value, '직접 등록 매장');

function commitCart(nextCart, failureMessage = '장바구니를 저장하지 못했습니다. 기존 상태를 유지합니다.') {
  const result = saveCart(nextCart);
  if (!result.ok) {
    showToast(failureMessage);
    return result;
  }
  state.cart = nextCart;
  render();
  return result;
}
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

function showToast(message, options = {}) {
  els.toast.textContent = message;
  const isError = options.error ?? /못했|오류|실패|부족|올바르지|확인하지 못|복구/.test(message);
  els.toast.classList.toggle('error', isError);
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  const duration = options.duration ?? (isError ? 7000 : 2600);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), duration);
}

async function runButtonOnce(button, action) {
  if (!button || button.dataset.running === 'true') return false;
  button.dataset.running = 'true';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try { return await action(); }
  finally {
    setTimeout(() => {
      button.dataset.running = '';
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }, 250);
  }
}

function setScanStatus(message, phase = '') {
  els.scanStatus.textContent = message;
  els.scanStatus.dataset.phase = phase;
  window.dispatchEvent(new CustomEvent('barohapgye:scan-status', { detail: { phase } }));
}

function setOcrBusy(busy) {
  state.photoOcrBusy = Boolean(busy);
  els.scannerCard?.setAttribute('aria-busy', String(Boolean(busy)));
  els.productPhotoButton.disabled = Boolean(busy);
  els.liveScanButton.disabled = Boolean(busy);
}

function cameraErrorMessage(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return '카메라 권한이 허용되지 않았습니다. 브라우저의 사이트 권한에서 카메라를 허용하거나 사진 선택·직접 입력을 이용해 주세요.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return '사용할 수 있는 카메라를 찾지 못했습니다. 사진 선택 또는 직접 입력으로 계속할 수 있습니다.';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return '다른 앱이 카메라를 사용 중이거나 카메라를 시작할 수 없습니다. 다른 앱을 닫고 다시 시도하거나 사진 선택·직접 입력을 이용해 주세요.';
  if (name === 'SecurityError' || name === 'TypeError' || !window.isSecureContext) return '현재 실행 환경에서는 카메라를 열 수 없습니다. 보안 연결에서 열거나 사진 선택·직접 입력을 이용해 주세요.';
  return '카메라를 시작하지 못했습니다. 잠시 후 다시 시도하거나 사진 선택·직접 입력을 이용해 주세요.';
}

function updateNetworkStatus({ announceOnline = false } = {}) {
  if (!els.networkStatus) return;
  if (navigator.onLine) {
    els.networkStatus.textContent = '온라인 상태입니다. 사진 글자 인식 기능을 준비할 수 있습니다.';
    els.networkStatus.classList.add('online');
    els.networkStatus.hidden = !announceOnline;
    if (announceOnline) setTimeout(() => { if (navigator.onLine) els.networkStatus.hidden = true; }, 4500);
  } else {
    els.networkStatus.textContent = '현재 오프라인입니다. 기기 안의 계산·기록은 계속 사용할 수 있지만, 처음 불러오는 글자 인식 기능은 제한될 수 있습니다.';
    els.networkStatus.classList.remove('online');
    els.networkStatus.hidden = false;
  }
}

function hasExistingUserData() {
  for (const key of ['quickSumCatalog', 'quickSumCart', 'quickSumPurchases', 'quickSumCustomStores', 'quickSumLastBackup']) {
    try {
      if (localStorage.getItem(key) !== null) return true;
    } catch (_) {
      // Check every item independently so one blocked read does not hide other evidence.
    }
  }
  return false;
}

const ONBOARDING_SESSION_KEY = 'quickSumOnboardingSeenThisSession';
let onboardingSeenInMemory = false;

function readOnboardingState() {
  if (onboardingSeenInMemory) return { seen: true, valid: true, source: 'memory' };
  let persistentRaw = null;
  let persistentReadable = true;
  try {
    persistentRaw = localStorage.getItem(ONBOARDING_STATE_KEY);
  } catch (_) {
    persistentReadable = false;
  }
  if (persistentRaw !== null) {
    try {
      const parsed = JSON.parse(persistentRaw);
      return parsed?.version === 1 && parsed?.seen === true
        ? { seen: true, valid: true, source: 'persistent' }
        : { seen: true, valid: false, source: 'persistent' };
    } catch (_) {
      return { seen: true, valid: false, source: 'persistent' };
    }
  }
  try {
    if (sessionStorage.getItem(ONBOARDING_SESSION_KEY) === '1') return { seen: true, valid: true, source: 'session' };
  } catch (_) {
    // The in-memory state still prevents repetition after the user closes the guide.
  }
  return { seen: false, valid: persistentReadable };
}

function captureOnboardingFallbackSnapshot() {
  const value = sessionStorage.getItem(ONBOARDING_SESSION_KEY);
  return { existed: value !== null, value, memorySeen: onboardingSeenInMemory };
}

function restoreOnboardingFallbackSnapshot(snapshot) {
  try {
    if (snapshot.existed) sessionStorage.setItem(ONBOARDING_SESSION_KEY, snapshot.value);
    else sessionStorage.removeItem(ONBOARDING_SESSION_KEY);
    if (sessionStorage.getItem(ONBOARDING_SESSION_KEY) !== (snapshot.existed ? snapshot.value : null)) return false;
    onboardingSeenInMemory = snapshot.memorySeen;
    return true;
  } catch (_) {
    return false;
  }
}

function saveOnboardingSeen() {
  onboardingSeenInMemory = true;
  try {
    localStorage.setItem(ONBOARDING_STATE_KEY, JSON.stringify({ version: 1, seen: true }));
    return 'persistent';
  } catch (_) {
    try {
      sessionStorage.setItem(ONBOARDING_SESSION_KEY, '1');
      return 'session';
    } catch (_) {
      return 'memory';
    }
  }
}

function showOnboarding({ manual = false } = {}) {
  return openAccessibleDialog(els.onboardingDialog, manual ? els.closeOnboarding : els.startOnboarding);
}

function initializeOnboarding() {
  const onboarding = readOnboardingState();
  if (onboarding.seen) return;
  if (hasExistingUserData()) {
    saveOnboardingSeen();
    return;
  }
  showOnboarding();
}

function showSaveResultToast(defaultMessage) {
  const message = pendingStorageNotice || defaultMessage;
  pendingStorageNotice = '';
  showToast(message);
}

function setFieldError(element, message = '') {
  if (!element) return;
  element.textContent = message;
  element.hidden = !message;
  const input = element.id === 'productPriceError' ? els.productPrice
    : element.id === 'detectedDiscountError' ? els.detectedDiscountValue
      : element.closest('label')?.querySelector('input,select,textarea');
  if (input) {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

function parsePriceInput(raw) {
  const text = String(raw ?? '').trim();
  if (!text || !(/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text))) return NaN;
  const value = Number(text.replaceAll(',', ''));
  return Number.isSafeInteger(value) && value >= 1 ? value : NaN;
}

function parsePrice(raw) {
  const text = String(raw ?? '').trim();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'price')) return parsePrice(parsed.price);
  } catch (_) {}
  const match = text.match(/^(?:(?:PRICE|가격)\s*[:=]\s*)?(?:[₩￦]\s*)?(\d+|\d{1,3}(?:,\d{3})+)(?:\s*원)?$/i);
  if (!match) return NaN;
  const value = Number(match[1].replaceAll(',', ''));
  return Number.isSafeInteger(value) && value >= 1 ? value : NaN;
}

function addToCart(code) {
  const product = state.catalog[code];
  if (!product) {
    state.pendingCode = code;
    els.priceChangeNotice.hidden = true;
    els.productSubmitButton.textContent = '등록하고 담기';
    els.dialogCode.textContent = `상품 코드: ${code}`;
    els.productName.value = '';
    els.productWeight.value = '';
    els.productPrice.value = '';
    els.productDialogPreview.hidden = !state.pendingProductImage;
    if (state.pendingProductImage) els.productDialogPreview.src = state.pendingProductImage;
    openAccessibleDialog(els.dialog, els.productName);
    return;
  }
  const current = state.cart[code];
  const nextCart = { ...state.cart, [code]: { ...(current || product), code, quantity: (current?.quantity || 0) + 1 } };
  if (!commitCart(nextCart, '상품을 장바구니에 저장하지 못했습니다. 기존 장바구니는 유지됩니다.').ok) return;
  clearPendingProductPhoto();
  selectQuantityProduct(code);
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

function calculatePromotionTotal(item, { applyPromotion = true } = {}) {
  const price = Number(item?.price);
  const quantity = Number(item?.quantity);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, code: 'invalid-price', total: null };
  if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, code: 'invalid-quantity', total: null };
  const baseTotal = price * quantity;
  const promo = item?.promotion;
  if (!applyPromotion || !promo || promo.type === 'none') return { ok: true, code: 'base', total: baseTotal };
  if (promo.type === 'plus') {
    const buy = Number(promo.buy), free = Number(promo.free);
    if (!Number.isInteger(buy) || buy < 1 || !Number.isInteger(free) || free < 1) return { ok: false, code: 'invalid-plus', total: null };
    const group = buy + free;
    return { ok: true, code: 'plus', total: price * (quantity - Math.floor(quantity / group) * free) };
  }
  if (promo.type === 'bundle') {
    const count = Number(promo.count), bundlePrice = Number(promo.bundlePrice);
    if (!Number.isInteger(count) || count < 1 || !Number.isFinite(bundlePrice) || bundlePrice <= 0) return { ok: false, code: 'invalid-bundle', total: null };
    return { ok: true, code: 'bundle', total: Math.floor(quantity / count) * bundlePrice + (quantity % count) * price };
  }
  if (promo.type === 'percent') {
    const percent = Number(promo.percent);
    if (!Number.isFinite(percent) || percent < 1 || percent > 100) return { ok: false, code: 'invalid-percent', total: null };
    return { ok: true, code: 'percent', total: Math.round(baseTotal * (1 - percent / 100)) };
  }
  if (promo.type === 'amount') {
    const amount = Number(promo.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > price) return { ok: false, code: 'invalid-amount', total: null };
    return { ok: true, code: 'amount', total: (price - amount) * quantity };
  }
  return { ok: false, code: 'invalid-promotion', total: null };
}

function promotionTotal(item, options) {
  const result = calculatePromotionTotal(item, options);
  if (result.ok) return result.total;
  const price = Number(item?.price), quantity = Number(item?.quantity);
  return Number.isFinite(price) && price > 0 && Number.isInteger(quantity) && quantity > 0 ? price * quantity : 0;
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
  if (!Number.isSafeInteger(price) || price < 1) {
    const message = '가격은 1원 이상의 정수로 입력해주세요.';
    setFieldError(els.productPriceError, message);
    setScanStatus(message, 'price-error');
    return showToast(message);
  }
  setFieldError(els.productPriceError);
  if (!state.pendingCode) return showToast('먼저 가격을 적용할 상품을 스캔하세요.');
  const existing = state.catalog[state.pendingCode];
  if (existing) {
    const nextCatalog = { ...state.catalog, [state.pendingCode]: { ...existing, price } };
    const nextCart = state.cart[state.pendingCode]
      ? { ...state.cart, [state.pendingCode]: { ...state.cart[state.pendingCode], price } }
      : state.cart;
    const catalogResult = saveCatalog(nextCatalog);
    if (!catalogResult.ok) return;
    if (nextCart !== state.cart) {
      const cartResult = saveCart(nextCart);
      if (!cartResult.ok) {
        saveCatalog(state.catalog);
        return showToast('가격 변경을 저장하지 못했습니다. 기존 가격을 유지합니다.');
      }
    }
    state.catalog = nextCatalog;
    state.cart = nextCart;
    render();
    showToast(`단가를 ${won(price)}으로 변경했어요.`);
    setMode('product');
  } else {
    els.productPrice.value = price;
    openAccessibleDialog(els.dialog, els.productName);
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
}

function downloadFile(content, filename, type) {
  let url = '';
  try {
    if (window.__downloadFailure) throw new Error('simulated-download-failure');
    url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (_) {
    if (url) URL.revokeObjectURL(url);
    return false;
  }
}

function buildAnonymousExport() {
  const usage = sanitizeUsageEnvelope(readAnonymousUsage()) || { version: ANONYMOUS_USAGE_VERSION, events: [] };
  const survey = readSurveyState();
  return {
    app: 'barohapgye-anonymous-test',
    version: ANONYMOUS_USAGE_VERSION,
    exportedAt: new Date().toISOString(),
    events: usage.events,
    surveyResponses: survey.responses.map(({ surveyId, answerId, occurredAt }) => ({ surveyId, answerId, occurredAt }))
  };
}

function exportAnonymousJson() {
  const content = JSON.stringify(buildAnonymousExport(), null, 2);
  const ok = downloadFile(content, `barohapgye-anonymous-${localDate()}.json`, 'application/json;charset=utf-8');
  showToast(ok ? '익명 이용기록 JSON 파일을 저장했습니다.' : '익명 이용기록 파일을 만들지 못했습니다. 기록은 유지됩니다.');
  return ok;
}

function buildAnonymousCsv() {
  const usage = sanitizeUsageEnvelope(readAnonymousUsage()) || { version: ANONYMOUS_USAGE_VERSION, events: [] };
  const rows = [['event','occurredAt','appVersion','inputMethod','success','durationMs','modifiedFields','cartItemCount','errorType','screenWidth','network']];
  for (const event of usage.events) rows.push([
    event.event, event.occurredAt, event.appVersion, event.inputMethod || '', event.success ?? '', event.durationMs ?? '',
    Array.isArray(event.modifiedFields) ? event.modifiedFields.join('|') : '', event.cartItemCount ?? '', event.errorType || '', event.screenWidth, event.network
  ]);
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function exportAnonymousCsv() {
  const content = buildAnonymousCsv();
  const ok = downloadFile(content, `barohapgye-anonymous-${localDate()}.csv`, 'text/csv;charset=utf-8');
  showToast(ok ? '익명 이용기록 CSV 파일을 저장했습니다.' : '익명 이용기록 파일을 만들지 못했습니다. 기록은 유지됩니다.');
  return ok;
}

function clearAnonymousUsage() {
  try {
    localStorage.removeItem(ANONYMOUS_USAGE_KEY);
    for (const key of Object.keys(localStorage)) if (key.startsWith(`${ANONYMOUS_USAGE_KEY}Corrupt:`)) localStorage.removeItem(key);
    anonymousUsageUnavailable = false;
    updateAnonymousUsageCount();
    showToast('익명 이용기록을 삭제했습니다. 설문 응답과 구매기록은 유지됩니다.');
    return true;
  } catch (_) {
    showToast('익명 이용기록을 삭제하지 못했습니다.');
    return false;
  }
}

function listQuickSumStorageKeys() {
  const keys = [];
  const length = localStorage.length;
  for (let index = 0; index < length; index += 1) {
    const key = localStorage.key(index);
    if (typeof key !== 'string') throw new Error('storage-key-read');
    if (key.startsWith('quickSum')) keys.push(key);
  }
  return [...new Set(keys)].sort();
}

function captureAllAppDataSnapshot(keys) {
  const entries = [];
  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value === null) throw new Error('storage-value-read');
    entries.push({ key, existed: true, value });
  }
  return { complete: entries.length === keys.length, keys: [...keys], entries };
}

function verifyAllAppDataSnapshot(snapshot) {
  try {
    const currentKeys = listQuickSumStorageKeys();
    if (currentKeys.length !== snapshot.keys.length || currentKeys.some((key, index) => key !== snapshot.keys[index])) return false;
    return snapshot.entries.every((entry) => localStorage.getItem(entry.key) === entry.value);
  } catch (_) {
    return false;
  }
}

function rollbackAllAppData(snapshot) {
  let operationFailed = false;
  let currentKeys = [];
  try { currentKeys = listQuickSumStorageKeys(); }
  catch (_) { operationFailed = true; }
  for (const key of currentKeys) {
    if (snapshot.keys.includes(key)) continue;
    try { localStorage.removeItem(key); }
    catch (_) { operationFailed = true; }
  }
  for (const entry of snapshot.entries) {
    try { localStorage.setItem(entry.key, entry.value); }
    catch (_) { operationFailed = true; }
  }
  return !operationFailed && verifyAllAppDataSnapshot(snapshot);
}

function readStorageForDeleteRecovery(key, fallback, label, validator) {
  try { return safeReadStorage(key, fallback, label, validator); }
  catch (_) { return fallback; }
}

function syncAppStateFromCurrentStorage() {
  state.catalog = readStorageForDeleteRecovery('quickSumCatalog', {}, '상품 목록', (value) => value && typeof value === 'object' && !Array.isArray(value));
  state.purchases = readStorageForDeleteRecovery('quickSumPurchases', [], '구매기록', Array.isArray);
  state.cart = readStorageForDeleteRecovery('quickSumCart', {}, '장바구니', (value) => value && typeof value === 'object' && !Array.isArray(value));
  state.customStores = readStorageForDeleteRecovery('quickSumCustomStores', [], '직접 등록 매장', Array.isArray);
  state.pendingCode = null;
  state.pendingBackup = null;
  activeSurveyId = '';
  try { readAnonymousUsage(); } catch (_) { anonymousUsageUnavailable = true; }
  try { readSurveyState(); } catch (_) {}
  if (els.surveyDialog.open) els.surveyDialog.close();
  refreshPurchaseStoreList();
  refreshStoreFilter();
  try { updateBackupStatus(); } catch (_) {}
  try { updateAnonymousUsageCount(); } catch (_) {}
  render();
  renderDashboard();
}

function clearAllAppData() {
  let targetKeys;
  let snapshot;
  let onboardingFallbackSnapshot;
  try {
    targetKeys = listQuickSumStorageKeys();
    snapshot = captureAllAppDataSnapshot(targetKeys);
    if (!snapshot.complete) throw new Error('incomplete-snapshot');
    onboardingFallbackSnapshot = captureOnboardingFallbackSnapshot();
  } catch (_) {
    showToast('삭제 준비 중 저장 데이터를 안전하게 확인하지 못해 삭제하지 않았습니다.');
    return false;
  }

  let deletionSucceeded = true;
  for (const key of targetKeys) {
    try { localStorage.removeItem(key); }
    catch (_) { deletionSucceeded = false; }
  }
  try {
    if (listQuickSumStorageKeys().length !== 0) deletionSucceeded = false;
  } catch (_) {
    deletionSucceeded = false;
  }
  try {
    sessionStorage.removeItem(ONBOARDING_SESSION_KEY);
    if (sessionStorage.getItem(ONBOARDING_SESSION_KEY) !== null) deletionSucceeded = false;
  } catch (_) {
    deletionSucceeded = false;
  }

  if (!deletionSucceeded) {
    const storageRollbackSucceeded = rollbackAllAppData(snapshot);
    const onboardingRollbackSucceeded = restoreOnboardingFallbackSnapshot(onboardingFallbackSnapshot);
    const rollbackSucceeded = storageRollbackSucceeded && onboardingRollbackSucceeded;
    if (rollbackSucceeded) {
      showToast('모든 데이터를 삭제하지 못했습니다. 기존 데이터는 그대로 유지됩니다.');
      return false;
    }
    syncAppStateFromCurrentStorage();
    showToast('데이터 삭제 중 오류가 발생했고 일부 데이터를 원래 상태로 복원하지 못했습니다. 화면의 현재 데이터를 확인하고, 가능한 경우 백업한 뒤 앱을 다시 실행해 주세요.');
    return false;
  }

  anonymousUsageUnavailable = false;
  storageIssues.clear();
  storageWriteApproved.clear();
  state.catalog = {};
  state.cart = {};
  state.purchases = [];
  state.customStores = [];
  state.pendingCode = null;
  state.pendingBackup = null;
  activeSurveyId = '';
  onboardingSeenInMemory = false;
  if (els.onboardingDialog.open) els.onboardingDialog.close();
  if (els.surveyDialog.open) els.surveyDialog.close();
  refreshPurchaseStoreList();
  refreshStoreFilter();
  updateBackupStatus();
  updateAnonymousUsageCount();
  render();
  renderDashboard();
  showToast('모든 데이터를 삭제했습니다. 나중에 앱을 다시 열면 새 앱 실행 기록부터 시작됩니다.');
  return true;
}

const SURVEYS = {
  first: {
    question: '오늘 바로합계가 장보기 금액을 확인하는 데 도움이 되었나요?',
    options: [
      { id: 'very_helpful', label: '매우 도움이 됨' }, { id: 'helpful', label: '도움이 됨' },
      { id: 'neutral', label: '보통' }, { id: 'not_helpful', label: '도움이 되지 않음' },
      { id: 'not_helpful_at_all', label: '전혀 도움이 되지 않음' }, { id: 'no_answer', label: '응답하지 않음' }
    ]
  },
  third: {
    question: '가장 불편했던 점은 무엇인가요?',
    options: [
      { id: 'product_recognition', label: '상품명 인식' }, { id: 'price_recognition', label: '가격 인식' },
      { id: 'processing_speed', label: '처리 속도' }, { id: 'discount_calculation', label: '할인 계산' },
      { id: 'usage_understanding', label: '사용 방법 이해' }, { id: 'manual_input', label: '직접 입력' },
      { id: 'no_particular_issue', label: '특별히 불편하지 않음' }, { id: 'other', label: '기타' },
      { id: 'no_answer', label: '응답하지 않음' }
    ]
  }
};
const SURVEY_IDS = new Set(Object.keys(SURVEYS));
const SURVEY_LEGACY_LABELS = new Map(Object.entries(SURVEYS).flatMap(([surveyId, survey]) => survey.options.map((option) => [`${surveyId}:${option.label}`, option.id])));

function validSurveyAnswer(surveyId, answerId) {
  return SURVEY_IDS.has(surveyId) && SURVEYS[surveyId].options.some((option) => option.id === answerId);
}

function sanitizeSurveyResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !SURVEY_IDS.has(value.surveyId) || !validIsoTime(value.occurredAt)) return null;
  const answerId = validSurveyAnswer(value.surveyId, value.answerId)
    ? value.answerId
    : SURVEY_LEGACY_LABELS.get(`${value.surveyId}:${value.answer}`);
  if (!validSurveyAnswer(value.surveyId, answerId)) return null;
  return { surveyId: value.surveyId, answerId, occurredAt: value.occurredAt };
}

function sanitizeSurveyStateForSave(value) {
  if (!value || typeof value !== 'object' || value.version !== 1 || !Number.isSafeInteger(value.newPurchaseSuccessCount) || value.newPurchaseSuccessCount < 0) return null;
  const statuses = new Set(['', 'shown', 'answered', 'skipped']);
  if (!statuses.has(value.firstStatus) || !statuses.has(value.thirdStatus) || !Array.isArray(value.responses)) return null;
  const responses = value.responses.map(sanitizeSurveyResponse).filter(Boolean);
  return { version: 1, newPurchaseSuccessCount: value.newPurchaseSuccessCount, firstStatus: value.firstStatus, thirdStatus: value.thirdStatus, responses };
}
let activeSurveyId = '';

function showSurvey(surveyId) {
  const survey = SURVEYS[surveyId];
  if (!survey || els.surveyDialog.open) return false;
  try {
    activeSurveyId = surveyId;
    els.surveyQuestion.textContent = survey.question;
    els.surveyOptions.innerHTML = survey.options.map((option, index) => `<label class="survey-option"><input type="radio" name="surveyAnswer" value="${escapeHtml(option.id)}" ${index === 0 ? 'required' : ''}><span>${escapeHtml(option.label)}</span></label>`).join('');
    openAccessibleDialog(els.surveyDialog);
    recordUsage('survey_shown', { success: true });
    return true;
  } catch (_) {
    activeSurveyId = '';
    return false;
  }
}

function finishSurvey(status, answerId = '') {
  if (!activeSurveyId) return false;
  const surveyId = activeSurveyId;
  const survey = SURVEYS[surveyId];
  const surveyState = readSurveyState();
  surveyState[`${surveyId}Status`] = status;
  if (status === 'answered') {
    if (!validSurveyAnswer(surveyId, answerId)) return false;
    surveyState.responses.push({ surveyId, answerId, occurredAt: new Date().toISOString() });
  }
  const saved = saveSurveyState(surveyState);
  recordUsage(status === 'answered' ? 'survey_answered' : 'survey_skipped', { success: saved });
  activeSurveyId = '';
  els.surveyDialog.close();
  return saved;
}

function handleSuccessfulPurchaseSurvey() {
  const surveyState = readSurveyState();
  surveyState.newPurchaseSuccessCount += 1;
  let surveyId = '';
  if (surveyState.newPurchaseSuccessCount === 1 && !surveyState.firstStatus) { surveyState.firstStatus = 'shown'; surveyId = 'first'; }
  else if (surveyState.newPurchaseSuccessCount === 3 && !surveyState.thirdStatus) { surveyState.thirdStatus = 'shown'; surveyId = 'third'; }
  // 표시 상태를 창보다 먼저 저장해, 설문을 띄운 상태에서 앱이 종료돼도 같은 설문을 반복하지 않는다.
  if (!saveSurveyState(surveyState)) return false;
  if (surveyId) showSurvey(surveyId);
  return true;
}

function exportBackup() {
  const backup = { app: 'barohapgye', version: 2, exportedAt: new Date().toISOString(), catalog: state.catalog, cart: state.cart, purchases: state.purchases, customStores: state.customStores };
  if (!downloadFile(JSON.stringify(backup, null, 2), `barohapgye-backup-${localDate()}.json`, 'application/json;charset=utf-8')) {
    recordUsage('backup', { success: false, errorType: 'download' });
    showToast('백업 파일을 만들지 못했습니다. 기록은 변경되지 않았습니다.');
    showBackupReminder('storage');
    return false;
  }
  try {
    localStorage.setItem('quickSumLastBackup', localDate());
    localStorage.setItem('quickSumLastBackupPurchaseCount', String(state.purchases.length));
    localStorage.removeItem('quickSumBackupReminderDismissed');
  } catch (_) {
    recordUsage('backup', { success: false, errorType: 'status-write' });
    updateBackupStatus();
    showToast('백업 파일은 만들었지만 최근 백업 날짜를 저장하지 못했습니다.');
    return false;
  }
  updateBackupStatus();
  recordUsage('backup', { success: true });
  showToast('전체 백업 파일을 저장했습니다.');
  return true;
}

function cleanProduct(value) {
  if (!value || typeof value !== 'object' || typeof value.name !== 'string') return null;
  const rawPrice = value.price;
  const price = typeof rawPrice === 'number'
    ? rawPrice
    : (typeof rawPrice === 'string' && /^\d+$/.test(rawPrice.trim()) ? Number(rawPrice.trim()) : NaN);
  if (!Number.isSafeInteger(price) || price < 1) return null;
  const image = typeof value.image === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/.test(value.image) && value.image.length <= 400000 ? value.image : undefined;
  const weight = typeof value.weight === 'string' ? value.weight.slice(0, 40) : '';
  const scanFingerprint = typeof value.scanFingerprint === 'string' ? value.scanFingerprint.slice(0, 500) : '';
  return { name: value.name.slice(0, 200), price, weight, category: typeof value.category === 'string' ? value.category.slice(0, 80) : '미분류', ...(scanFingerprint ? { scanFingerprint } : {}), ...(image ? { image } : {}) };
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
  priced.sort((a, b) => b.score - a.score || b.value - a.value);
  const priceCandidates = [];
  for (const candidate of priced) {
    if (!priceCandidates.some((item) => item.value === candidate.value)) {
      priceCandidates.push({ value: candidate.value, context: candidate.line.slice(0, 70), score: candidate.score });
    }
  }
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
  return { name: (nameCandidates[0]?.line || '').slice(0, 80), price: priceCandidates[0]?.value || '', priceCandidates: priceCandidates.slice(0, 5), weight, text: lines.join('\n').slice(0, 1500) };
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
  const hasSpecificCard = /(?:삼성|국민|신한|현대|롯데|농협|우리|하나|비씨|BC)카드/i.test(compact);
  const hasGenericCardCondition = /(?:(?:해당|행사|제휴)카드(?:로)?결제(?:시|조건)?|카드(?:로)?결제시)/i.test(compact);
  if (type !== 'none' && (hasSpecificCard || hasGenericCardCondition)) conditions.push('해당 카드 결제 조건');
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
  els.detectedDiscountPanel.hidden = false;
  els.detectedDiscountType.value = offer.type || 'none';
  els.detectedDiscountValue.value = offer.value || '';
  els.detectedDiscountCondition.value = offer.condition || '';
  els.applyDetectedDiscount.checked = offer.type !== 'none' && !offer.conditional;
  els.discountRequirementBadge.textContent = offer.type === 'none' ? '할인 없음' : (offer.conditional ? '조건부 할인' : '조건 없는 할인');
  els.discountRequirementBadge.classList.toggle('conditional', offer.conditional);
  updateDiscountControls();
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

function scanFingerprint(product) {
  const name=normalizedProductName(product?.name);
  const weight=String(product?.weight||'').toLowerCase().replace(/\s+/g,'').replace('×','x');
  const price=Number(product?.price)||0;
  return name.length>=2&&price>0?`${name}|${price}|${weight}`:'';
}

function cleanRecognizedProductName(value) {
  const text=String(value||'').replace(/^[\d\W_]+|[\W_]+$/g,' ').replace(/\s+/g,' ').trim();
  const korean=(text.match(/[가-힣]/g)||[]).length, latin=(text.match(/[A-Za-z]/g)||[]).length;
  const latinTokens=text.match(/[A-Za-z]{1,}/g)||[];
  if(korean>=2 && latin>korean && latinTokens.length>=5){const koreanOnly=(text.match(/[가-힣]{2,}/g)||[]).join(' ');const kind=productKind(koreanOnly,'');return kind||koreanOnly;}
  return text;
}

function findCatalogMatch(name, weight = '') {
  const target = normalizedProductName(name);
  if (target.length < 3) return null;
  const targetWeight = String(weight || '').replace(/\s+/g, '').toLowerCase();
  for (const [code, product] of Object.entries(state.catalog)) {
    const candidate = normalizedProductName(product.name);
    const candidateWeight = String(product.weight || '').replace(/\s+/g, '').toLowerCase();
    if (candidate === target && (!targetWeight || !candidateWeight || candidateWeight === targetWeight)) return { code, product };
  }
  return null;
}

function findSimilarCatalogProduct(name) {
  const target = normalizedProductName(name);
  if (target.length < 3) return null;
  for (const [code, product] of Object.entries(state.catalog)) {
    const candidate = normalizedProductName(product.name);
    if (candidate === target || (Math.min(candidate.length, target.length) >= 5 && (candidate.includes(target) || target.includes(candidate)))) return { code, product };
  }
  return null;
}

function refreshSimilarProductChoice() {
  if (!state.pendingProductImage || !String(state.pendingCode || '').startsWith('photo:')) return;
  const similar = findSimilarCatalogProduct(els.productName.value);
  state.pendingSimilarCode = similar?.code || null;
  els.similarProductPanel.hidden = !similar;
  if (similar) {
    els.similarProductText.textContent = `기존: ${similar.product.name}${similar.product.weight ? ` · ${similar.product.weight}` : ''} · ${won(similar.product.price)}`;
    els.productForm.querySelector('input[name="productMatchChoice"][value="new"]').checked = true;
  }
}

function findCatalogFingerprintMatch(fingerprint) {
  if(!fingerprint)return null;
  const matches=Object.entries(state.catalog).filter(([,product])=>product.scanFingerprint===fingerprint||scanFingerprint(product)===fingerprint);
  return matches.length===1?{code:matches[0][0],product:matches[0][1]}:null;
}

function selectedPurchaseStore() {
  return els.purchaseStore.value === '__custom__' ? els.purchaseCustomStore.value.trim() : els.purchaseStore.value;
}

function saveDirectStore() {
  const store = els.purchaseCustomStore.value.trim();
  if (!store) return showToast('저장할 매장 이름을 입력해주세요.');
  if (!state.customStores.includes(store) && !DEFAULT_STORES.includes(store)) {
    const nextStores = [...state.customStores, store].sort((a, b) => a.localeCompare(b, 'ko'));
    if (!saveCustomStores(nextStores).ok) return;
    state.customStores = nextStores;
  }
  refreshPurchaseStoreList();
  els.purchaseStore.value = store;
  els.customStoreEntry.hidden = true;
  els.purchaseCustomStore.value = '';
  refreshStoreFilter();
  renderDashboard();
  showToast(`‘${store}’ 매장을 저장했습니다.`);
  return store;
}

function findRecentStorePrice(code, name) {
  const store = selectedPurchaseStore();
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
    if (!window.Tesseract?.createWorker) throw new Error('ocr-runtime-unavailable');
    const workerPath = new URL('./vendor/tesseract/worker.min.js', window.location.href).href;
    const corePath = new URL('./vendor/tesseract/core/', window.location.href).href;
    const langPath = new URL('./vendor/tesseract/lang/', window.location.href).href;
    state.ocrWorkerPromise = Tesseract.createWorker('kor+eng', 1, {
      workerPath,
      corePath,
      langPath,
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

function renderPriceCandidates(candidates = [], selectedPrice = '') {
  const unique = candidates.filter((candidate, index, list) => candidate?.value > 0 && list.findIndex((item) => item.value === candidate.value) === index).slice(0, 5);
  els.priceCandidatePanel.hidden = unique.length < 2;
  els.priceCandidateOptions.innerHTML = unique.map((candidate) => `<button class="price-candidate-option${Number(selectedPrice) === candidate.value ? ' selected' : ''}" type="button" data-price="${candidate.value}"><strong>${won(candidate.value)}</strong><small>${escapeHtml(candidate.context || '가격표에서 감지')}</small></button>`).join('');
}

function showRecognitionWarnings(parsed) {
  const messages = [];
  if (!String(parsed?.name || '').trim()) messages.push('상품명을 인식하지 못했습니다. 상품명을 직접 입력해 주세요.');
  if (!(Number(parsed?.price) > 0)) messages.push('가격을 정확하게 인식하지 못했습니다. 장바구니에 담기 전에 실제 가격을 확인해 주세요.');
  els.recognitionWarning.textContent = messages.join(' ');
  els.recognitionWarning.hidden = messages.length === 0;
}

function updateDiscountControls() {
  const type = els.detectedDiscountType.value;
  const enabled = type === 'amount' || type === 'percent';
  els.detectedDiscountValue.disabled = !enabled;
  els.applyDetectedDiscount.disabled = !enabled;
  els.detectedDiscountValue.min = enabled ? '1' : '0';
  if (type === 'percent') els.detectedDiscountValue.max = '100';
  else els.detectedDiscountValue.removeAttribute('max');
  if (!enabled) {
    els.detectedDiscountValue.value = '';
    els.applyDetectedDiscount.checked = false;
    els.discountRequirementBadge.textContent = '할인 없음';
    els.discountRequirementBadge.classList.remove('conditional');
  }
  updateDetectedDiscountPreview();
}

function openManualProductDialog() {
  stopCamera();
  clearPendingProductPhoto();
  state.pendingCode = `manual:${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.pendingFingerprint = '';
  state.pendingSimilarCode = null;
  state.pendingInputMethod = 'manual';
  state.pendingRecognizedFields = null;
  recordUsage('direct_input_used', { inputMethod: 'manual', success: true, cartItemCount: Object.keys(state.cart).length });
  els.dialogCode.textContent = '직접 입력한 내용을 확인한 뒤 장바구니에 담아주세요.';
  els.productName.value = '';
  els.productWeight.value = '';
  els.productPrice.value = '';
  els.productQuantity.value = '1';
  els.productCategory.value = '식품';
  els.productDialogPreview.hidden = true;
  els.priceChangeNotice.hidden = true;
  els.similarProductPanel.hidden = true;
  els.recognitionWarning.hidden = true;
  setFieldError(els.productPriceError);
  setFieldError(els.detectedDiscountError);
  renderPriceCandidates([]);
  showDetectedDiscount({ type: 'none', value: 0, condition: '', conditional: false });
  els.productSubmitButton.textContent = '등록하고 담기';
  openAccessibleDialog(els.dialog, els.productName);
  requestAnimationFrame(() => els.productName.focus());
}

function presentRecognizedProduct(parsed, imageData, barcode = '', lowDetail = false) {
  state.pendingProductImage=imageData;
  els.productPhotoPreview.src=imageData;els.productPhotoReady.hidden=false;
  const priceReadFromPhoto=Boolean(parsed.price);
  const fingerprint=scanFingerprint(parsed);
  const barcodeMatch=barcode&&state.catalog[barcode]?{code:barcode,product:state.catalog[barcode]}:null;
  const fingerprintMatch=!barcode?findCatalogFingerprintMatch(fingerprint):null;
  const exactMatch=barcodeMatch;
  const similarMatch=!barcode?(fingerprintMatch||findSimilarCatalogProduct(parsed.name)):null;
  const key=parsed.name.toLowerCase().replace(/[^가-힣a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70);
  const code=barcode||exactMatch?.code||`photo:${key||'product'}:${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const existing=exactMatch?.product||state.catalog[code];
  const recentPrice=existing?findRecentStorePrice(code,existing.name):null;
  if(!parsed.price&&recentPrice!==null)parsed.price=recentPrice;
  if(!parsed.price&&existing?.price)parsed.price=existing.price;
  if(!parsed.name&&existing?.name)parsed.name=existing.name;
  if(!parsed.weight&&existing?.weight)parsed.weight=existing.weight;
  const offer=analyzeDiscountOffer(parsed.text,parsed.price||existing?.price);
  if(offer.originalPrice)parsed.price=offer.originalPrice;
  state.pendingCode=code;state.pendingFingerprint=scanFingerprint(parsed)||fingerprint;state.pendingSimilarCode=similarMatch?.code||null;
  state.pendingRecognizedFields = { productName: existing?.name||parsed.name||'', price: String(parsed.price||existing?.price||''), specification: parsed.weight||existing?.weight||'', category: existing?.category||inferCategory(parsed.name), discount: offer.type };
  setFieldError(els.productPriceError);
  setFieldError(els.detectedDiscountError);
  els.similarProductPanel.hidden=!similarMatch;
  if(similarMatch){
    els.similarProductText.textContent=`기존: ${similarMatch.product.name}${similarMatch.product.weight?` · ${similarMatch.product.weight}`:''} · ${won(similarMatch.product.price)}`;
    els.productForm.querySelector('input[name="productMatchChoice"][value="new"]').checked=true;
  }
  const priceChanged=Boolean(existing&&priceReadFromPhoto&&Number(existing.price)!==Number(parsed.price));
  els.priceChangeNotice.hidden=!priceChanged;
  if(priceChanged)els.priceChangeText.textContent=`기존 ${won(existing.price)} → 현재 인식 ${won(parsed.price)}`;
  els.productSubmitButton.textContent=priceChanged?'네, 변경 가격으로 등록':'등록하고 담기';
  els.dialogCode.textContent=priceChanged?'가격 변동 확인 후 등록':'상품·가격표 인식 결과 확인';
  els.productName.value=existing?.name||parsed.name;
  els.productWeight.value=parsed.weight||existing?.weight||'';
  els.productPrice.value=parsed.price||existing?.price||'';
  els.productQuantity.value='1';
  els.productCategory.value=existing?.category||inferCategory(parsed.name);
  els.productDialogPreview.src=imageData;els.productDialogPreview.hidden=false;
  renderPriceCandidates(parsed.priceCandidates || [], els.productPrice.value);
  showRecognitionWarnings({ name: els.productName.value, price: els.productPrice.value });
  showDetectedDiscount(offer);openAccessibleDialog(els.dialog, els.productName);
  const shownPrice=offer.type!=='none'?offer.finalPrice:parsed.price;
  const source=priceChanged?'동일 상품의 가격 변동 감지':offer.type!=='none'?(offer.conditional?`조건부 할인 · ${offer.condition}`:'조건 없는 할인 감지'):(!priceReadFromPhoto&&recentPrice!==null?`${selectedPurchaseStore()}의 최근 저장 가격`:(!priceReadFromPhoto&&existing?'이전에 직접 저장한 가격':'화면에서 읽은 가격'));
  showScanInsight({name:existing?.name||parsed.name,weight:parsed.weight||existing?.weight,category:existing?.category||inferCategory(parsed.name),price:shownPrice},source);
  const hasName = Boolean(String(parsed.name || '').trim());
  const hasPrice = Number(parsed.price) > 0;
  const status = parsed.ocrFailed || (!hasName && !hasPrice)
    ? { phase: 'failed', message: '가격표 글자 인식에 실패했습니다. 다른 사진을 선택하거나 상품명과 가격을 직접 입력해 계속할 수 있습니다.' }
    : !hasName
      ? { phase: 'partial-name', message: '가격은 인식했지만 상품명을 읽지 못했습니다. 상품명을 확인해 직접 입력해 주세요.' }
      : !hasPrice
        ? { phase: 'partial-price', message: '상품명은 인식했지만 가격을 읽지 못했습니다. 실제 가격을 확인해 직접 입력해 주세요.' }
        : { phase: 'review', message: `가격표 인식이 완료되었습니다. 상품명과 가격을 확인한 후 장바구니에 등록해 주세요.${lowDetail?' 화면이 흐려 숫자를 확인해주세요.':''}` };
  setScanStatus(status.message, status.phase);
  return false;
}

async function recognizeProductPhoto(file, taskId) {
  const startedAt = performance.now();
  state.pendingInputMethod = state.pendingInputMethod || 'photo';
  recordUsage('ocr_start', { inputMethod: state.pendingInputMethod, success: true });
  setScanStatus('가격표 사진을 불러왔습니다. 글자를 분석할 준비를 하고 있습니다.', 'preparing');
  await new Promise((resolve) => requestAnimationFrame(resolve));
  if (!isCurrentOcrTask(taskId)) return { cancelled: true };
  const imageData = await resizeProductPhoto(file);
  if (!isCurrentOcrTask(taskId)) return { cancelled: true };
  state.pendingProductImage = imageData;
  els.productPhotoPreview.src = imageData;
  els.productPhotoReady.hidden = false;
  let parsed = { name: '', price: '', weight: '', text: '' };
  let lowDetail = false;
  const barcode = await detectBarcodeFromPhoto(file);
  if (!isCurrentOcrTask(taskId)) return { cancelled: true };
  if (window.Tesseract) {
    try {
      setScanStatus('가격표에서 상품명과 가격을 분석하고 있습니다.', 'processing');
      const prepared = await prepareOcrCanvas(file);
      if (!isCurrentOcrTask(taskId)) return { cancelled: true };
      lowDetail = prepared.lowDetail;
      const worker = await getProductOcrWorker();
      if (!isCurrentOcrTask(taskId)) return { cancelled: true };
      const result = await worker.recognize(prepared.canvas);
      if (!isCurrentOcrTask(taskId)) return { cancelled: true };
      const focusedLabel = cropPriceLabelCanvas(prepared.canvas);
      const tightLabel = cropTightPriceLabelCanvas(prepared.canvas);
      const titleText = await recognizeTitleRegion(worker, focusedLabel);
      if (!isCurrentOcrTask(taskId)) return { cancelled: true };
      const tightText = await recognizeSingleProductTitle(worker, tightLabel);
      if (!isCurrentOcrTask(taskId)) return { cancelled: true };
      parsed = parseProductAndPrice(`${tightText}\n${titleText}\n${result.data.text}`);
      parsed.name = cleanRecognizedProductName(parsed.name);
      const verifiedPrice = await recognizePriceNumbers(worker, tightLabel);
      if (!isCurrentOcrTask(taskId)) return { cancelled: true };
      if (verifiedPrice) {
        parsed.priceCandidates = [{ value: verifiedPrice, context: '큰 가격 숫자 집중 인식', score: 5 }, ...(parsed.priceCandidates || [])]
          .filter((candidate, index, list) => list.findIndex((item) => item.value === candidate.value) === index);
        if (!parsed.price || (verifiedPrice > parsed.price * 1.5 && verifiedPrice % 10 === 0)) parsed.price = verifiedPrice;
      }
    } catch (_) {
      if (!isCurrentOcrTask(taskId)) return { cancelled: true };
      parsed.text = '사진 글자 인식에 실패했습니다. 상품명과 가격을 직접 확인해주세요.';
      parsed.ocrFailed = true;
    }
  } else parsed.ocrFailed = true;
  if (!isCurrentOcrTask(taskId)) return { cancelled: true };
  const success = !parsed.ocrFailed && Boolean(parsed.name || Number(parsed.price) > 0);
  recordUsage(success ? 'ocr_success' : 'ocr_failure', {
    inputMethod: state.pendingInputMethod,
    success,
    durationMs: performance.now() - startedAt,
    ...(success ? {} : { errorType: window.Tesseract ? 'recognition' : 'unavailable' })
  });
  if (!isCurrentOcrTask(taskId)) return { cancelled: true };
  presentRecognizedProduct(parsed, imageData, barcode, lowDetail);
  return { cancelled: false, success };
}

function cleanPromotion(value, price = Infinity) {
  if (!value || typeof value !== 'object') return null;
  const type = value.type;
  const positive = (key) => Number.isFinite(Number(value[key])) && Number(value[key]) > 0 ? Number(value[key]) : null;
  if (type === 'plus' && Number.isInteger(positive('buy')) && Number.isInteger(positive('free'))) return { type, buy: positive('buy'), free: positive('free') };
  if (type === 'bundle' && Number.isInteger(positive('count')) && positive('bundlePrice')) return { type, count: positive('count'), bundlePrice: positive('bundlePrice') };
  const condition = typeof value.condition === 'string' ? value.condition.slice(0, 160) : '';
  if (type === 'percent' && positive('percent') && positive('percent') <= 100) return { type, percent: positive('percent'), condition };
  if (type === 'amount' && positive('amount') && positive('amount') <= price) return { type, amount: positive('amount'), condition };
  return null;
}

function validateBackup(raw) {
  if (!raw || raw.app !== 'barohapgye' || !raw.catalog || !Array.isArray(raw.purchases)) throw new Error('지원하지 않는 백업 파일입니다.');
  const catalog = {};
  for (const [code, value] of Object.entries(raw.catalog)) {
    const product = cleanProduct(value);
    if (!product || code.length > 200) throw new Error('백업에 올바르지 않은 상품 가격 또는 상품 정보가 있어 복원을 취소했습니다. 기존 데이터는 유지됩니다.');
    catalog[code] = product;
  }
  const purchases = raw.purchases.map((record, recordIndex) => {
    if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || !Array.isArray(record.items)) throw new Error('백업의 구매기록 형식이 올바르지 않아 복원을 취소했습니다. 기존 데이터는 유지됩니다.');
    const items = record.items.map((item) => {
      const product = cleanProduct(item);
      const quantity = Number(item.quantity), total = Number(item.total);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(total) || total < 0) throw new Error('백업의 구매 상품 가격 또는 수량이 올바르지 않아 복원을 취소했습니다. 기존 데이터는 유지됩니다.');
      return { ...product, code: String(item.code || '').slice(0, 200), quantity, promotion: cleanPromotion(item.promotion, product.price), total };
    });
    if (!items.length) throw new Error('상품이 없는 구매기록이 있어 복원을 취소했습니다. 기존 데이터는 유지됩니다.');
    return { id: String(record.id || `restored-${recordIndex}-${record.date}`).slice(0, 200), date: record.date, store: String(record.store || '미지정').slice(0, 60), branch: String(record.branch || '').slice(0, 60), items, total: items.reduce((sum, item) => sum + item.total, 0) };
  });
  const cart = {};
  if (raw.cart && typeof raw.cart === 'object') for (const [code, item] of Object.entries(raw.cart)) {
    const product = cleanProduct(item), quantity = Number(item?.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || code.length > 200) throw new Error('백업의 장바구니 상품 가격 또는 수량이 올바르지 않아 복원을 취소했습니다. 기존 데이터는 유지됩니다.');
    cart[code] = { ...product, code, quantity, promotion: cleanPromotion(item.promotion, product.price) };
  }
  const customStores = Array.isArray(raw.customStores) ? raw.customStores.map((name) => String(name || '').trim().slice(0, 40)).filter(Boolean) : [];
  return { catalog, purchases, cart, customStores };
}

async function prepareRestore(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('백업 파일은 10MB 이하여야 합니다.');
  state.pendingBackup = null;
  const parsed = JSON.parse(await file.text());
  const validatedBackup = validateBackup(parsed);
  state.pendingBackup = validatedBackup;
  els.restoreSummary.textContent = `상품 ${Object.keys(state.pendingBackup.catalog).length}개, 지출 기록 ${state.pendingBackup.purchases.length}건을 확인했습니다.`;
  openAccessibleDialog(els.restoreDialog);
}

function applyRestore(mode) {
  const backup = state.pendingBackup;
  if (!backup) return false;
  let nextCatalog, nextPurchases, nextCart, nextCustomStores;
  if (mode === 'replace') {
    nextCatalog = backup.catalog;
    nextPurchases = backup.purchases;
    nextCart = backup.cart;
    nextCustomStores = backup.customStores;
  } else {
    nextCatalog = { ...backup.catalog, ...state.catalog };
    const knownIds = new Set(state.purchases.map((record) => record.id));
    nextPurchases = [...state.purchases, ...backup.purchases.filter((record) => !knownIds.has(record.id))];
    nextCart = Object.fromEntries(Object.entries(state.cart).map(([code, item]) => [code, { ...item }]));
    for (const [code, item] of Object.entries(backup.cart)) {
      if (nextCart[code]) nextCart[code].quantity += item.quantity;
      else nextCart[code] = item;
    }
    nextCustomStores = [...new Set([...state.customStores, ...backup.customStores])];
  }
  const snapshot = captureRawStorage();
  try {
    const serializedSnapshot = JSON.stringify(snapshot);
    localStorage.setItem(RESTORE_ROLLBACK_KEY, serializedSnapshot);
    if (localStorage.getItem(RESTORE_ROLLBACK_KEY) !== serializedSnapshot) throw new Error('rollback-verify');
    localStorage.setItem(RESTORE_STATE_KEY, JSON.stringify({ status: 'preparing', at: Date.now() }));
  } catch (_) {
    localStorage.removeItem(RESTORE_STATE_KEY);
    localStorage.removeItem(RESTORE_ROLLBACK_KEY);
    showToast('안전한 복원 공간이 부족합니다. 기존 데이터는 변경하지 않았습니다.');
    recordUsage('restore', { success: false, errorType: 'storage-prepare' });
    return false;
  }
  const results = [
    saveCatalog(nextCatalog),
    savePurchases(nextPurchases),
    saveCart(nextCart),
    saveCustomStores(nextCustomStores)
  ];
  if (results.some((result) => !result.ok)) {
    const rolledBack = restoreRawStorage(snapshot);
    if (rolledBack) {
      localStorage.removeItem(RESTORE_STATE_KEY);
      localStorage.removeItem(RESTORE_ROLLBACK_KEY);
      showToast('복원을 완료하지 못해 기존 데이터를 그대로 유지했습니다.');
    } else {
      showToast('복원 상태를 완전히 확인하지 못했습니다. 앱을 종료하지 말고 기존 백업을 보관해주세요.');
    }
    recordUsage('restore', { success: false, errorType: rolledBack ? 'write' : 'rollback' });
    return false;
  }
  try {
    const committedMarker = JSON.stringify({ status: 'committed', at: Date.now() });
    localStorage.setItem(RESTORE_STATE_KEY, committedMarker);
    if (localStorage.getItem(RESTORE_STATE_KEY) !== committedMarker) throw new Error('commit-marker-verify');
  } catch (_) {
    const rolledBack = restoreRawStorage(snapshot);
    if (rolledBack) {
      localStorage.removeItem(RESTORE_STATE_KEY);
      localStorage.removeItem(RESTORE_ROLLBACK_KEY);
      showToast('복원을 완료하지 못해 기존 데이터를 그대로 유지했습니다.');
    } else showToast('복원 상태를 완전히 확인하지 못했습니다. 앱을 종료하지 말고 기존 백업을 보관해주세요.');
    recordUsage('restore', { success: false, errorType: rolledBack ? 'commit' : 'rollback' });
    return false;
  }
  state.catalog = JSON.parse(localStorage.getItem('quickSumCatalog') || '{}');
  state.purchases = JSON.parse(localStorage.getItem('quickSumPurchases') || '[]');
  state.cart = JSON.parse(localStorage.getItem('quickSumCart') || '{}');
  state.customStores = JSON.parse(localStorage.getItem('quickSumCustomStores') || '[]');
  localStorage.removeItem(RESTORE_STATE_KEY);
  localStorage.removeItem(RESTORE_ROLLBACK_KEY);
  refreshPurchaseStoreList();
  refreshStoreFilter();
  state.pendingBackup = null;
  state.pendingCode = null;
  resetQuantityControl();
  render(); renderDashboard();
  recordUsage('restore', { success: true });
  showToast('백업 데이터를 가져왔습니다.');
  return true;
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
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-');
    els.backupStatus.textContent = `최근 백업: ${year}년 ${month}월 ${day}일`;
  } else els.backupStatus.textContent = '아직 백업하지 않았습니다.';
  showBackupReminder();
}

function backupReminderReason(forcedReason = '') {
  if (forcedReason === 'storage') return { key: `storage:${localDate()}`, text: '저장공간 문제를 확인했습니다. 현재 기록을 백업해 두는 것이 좋습니다.' };
  const lastDate = localStorage.getItem('quickSumLastBackup');
  const lastCount = Number(localStorage.getItem('quickSumLastBackupPurchaseCount')) || 0;
  const added = Math.max(0, state.purchases.length - lastCount);
  if (!lastDate && state.purchases.length >= 5) return { key: `first:${Math.floor(state.purchases.length / 5)}`, text: '저장된 구매기록이 늘었습니다. 중요한 기록을 처음 백업해 주세요.' };
  if (lastDate && added >= 3) return { key: `added:${lastDate}:${Math.floor(added / 3)}`, text: `최근 백업 후 구매기록이 ${added}건 추가되었습니다. 새 백업을 권장합니다.` };
  if (lastDate && /^\d{4}-\d{2}-\d{2}$/.test(lastDate)) {
    const elapsedDays = Math.floor((new Date(`${localDate()}T00:00:00`) - new Date(`${lastDate}T00:00:00`)) / 86400000);
    if (elapsedDays >= 30) return { key: `age:${lastDate}`, text: '마지막 백업 후 30일 이상 지났습니다. 최신 기록을 백업해 주세요.' };
  }
  return null;
}

function showBackupReminder(forcedReason = '') {
  if (!els.backupReminder) return;
  const reason = backupReminderReason(forcedReason);
  const dismissed = localStorage.getItem('quickSumBackupReminderDismissed');
  els.backupReminder.hidden = !reason || dismissed === reason?.key;
  if (reason) {
    els.backupReminder.dataset.reminderKey = reason.key;
    els.backupReminderText.textContent = reason.text;
  } else {
    els.backupReminder.removeAttribute('data-reminder-key');
    els.backupReminderText.textContent = '';
  }
}

function openPurchaseSummary() {
  const items = Object.values(state.cart);
  if (!items.length) return showToast('저장할 상품이 없습니다.');
  if (!els.purchaseDate.value) return showToast('이용 날짜를 선택해주세요.');
  const selectedStore = selectedPurchaseStore();
  if (!selectedStore) return showToast('이용 매장을 선택하거나 직접 입력해주세요.');
  const storeName = `${selectedStore}${els.purchaseBranch.value.trim() ? ` · ${els.purchaseBranch.value.trim()}` : ''}`;
  els.checkoutMeta.textContent = `${els.purchaseDate.value} · ${storeName} · 총 ${items.reduce((sum, item) => sum + item.quantity, 0)}개`;
  els.checkoutItems.innerHTML = items.map((item) => {
    const discounted = discountedUnitPrice(item);
    const unit = item.promotion?.type === 'percent' && discounted !== item.price
      ? `<s>${won(item.price)}</s><b>${won(discounted)}</b>`
      : `<b>${won(item.price)}</b>`;
    return `<div class="checkout-row"><span><strong>${escapeHtml(item.name)}${item.weight ? ` · ${escapeHtml(item.weight)}` : ''}</strong><small>${unit}${item.promotion ? ` · ${escapeHtml(promotionLabel(item.promotion))}` : ''}</small></span><span>${item.quantity}개</span><strong>${won(promotionTotal(item))}</strong></div>`;
  }).join('');
  els.checkoutGrandTotal.textContent = won(items.reduce((sum, item) => sum + promotionTotal(item), 0));
  openAccessibleDialog(els.checkoutDialog);
}

function saveCurrentPurchase() {
  const items = Object.values(state.cart);
  if (!items.length) { recordUsage('purchase_save', { success: false, errorType: 'empty-cart', cartItemCount: 0 }); return showToast('저장할 상품이 없습니다.'); }
  const store = selectedPurchaseStore();
  if (!store) { recordUsage('purchase_save', { success: false, errorType: 'missing-store', cartItemCount: items.length }); return showToast('이용 매장을 선택하거나 직접 입력해주세요.'); }
  const addsCustomStore = els.purchaseStore.value === '__custom__' && !state.customStores.includes(store);
  const nextCustomStores = addsCustomStore ? [...state.customStores, store].sort((a, b) => a.localeCompare(b, 'ko')) : state.customStores;
  const record = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: els.purchaseDate.value,
    store,
    branch: els.purchaseBranch.value.trim(),
    total: items.reduce((sum, item) => sum + promotionTotal(item), 0),
    items: items.map((item) => ({ code: item.code, name: item.name, weight: item.weight || '', category: item.category || '미분류', price: item.price, quantity: item.quantity, promotion: item.promotion || null, total: promotionTotal(item) }))
  };
  const nextPurchases = [...state.purchases, record];
  const snapshot = captureRawStorage();
  try {
    const serializedSnapshot = JSON.stringify(snapshot);
    localStorage.setItem(PURCHASE_ROLLBACK_KEY, serializedSnapshot);
    if (localStorage.getItem(PURCHASE_ROLLBACK_KEY) !== serializedSnapshot) throw new Error('purchase-rollback-verify');
    const marker = JSON.stringify({ status: 'preparing', at: Date.now() });
    localStorage.setItem(PURCHASE_STATE_KEY, marker);
    if (localStorage.getItem(PURCHASE_STATE_KEY) !== marker) throw new Error('purchase-marker-verify');
  } catch (_) {
    localStorage.removeItem(PURCHASE_STATE_KEY);
    localStorage.removeItem(PURCHASE_ROLLBACK_KEY);
    showToast('안전한 저장 공간이 부족합니다. 장바구니는 그대로 유지됩니다.');
    recordUsage('purchase_save', { success: false, errorType: 'storage-prepare', cartItemCount: items.length });
    return false;
  }
  const rollbackPurchase = () => {
    const rolledBack = restoreRawStorage(snapshot);
    if (rolledBack) {
      localStorage.removeItem(PURCHASE_STATE_KEY);
      localStorage.removeItem(PURCHASE_ROLLBACK_KEY);
    }
    return rolledBack;
  };
  const purchaseResult = savePurchases(nextPurchases);
  if (!purchaseResult.ok) {
    const rolledBack = rollbackPurchase();
    showToast(rolledBack
      ? '지출 기록을 저장하지 못했습니다. 장바구니는 그대로 유지됩니다. 잠시 후 다시 저장해주세요.'
      : '저장 복구가 필요합니다. 앱을 다시 열면 이전 장바구니 상태를 자동으로 복구합니다.');
    recordUsage('purchase_save', { success: false, errorType: 'purchase-write', cartItemCount: items.length });
    return false;
  }
  const cartResult = saveCart({});
  if (!cartResult.ok) {
    const rolledBack = rollbackPurchase();
    showToast(rolledBack
      ? '저장 과정을 완료하지 못해 이전 상태로 되돌렸습니다. 장바구니는 유지됩니다.'
      : '저장 복구가 필요합니다. 앱을 다시 열면 이전 장바구니 상태를 자동으로 복구합니다.');
    recordUsage('purchase_save', { success: false, errorType: 'cart-clear', cartItemCount: items.length });
    return false;
  }
  const storeResult = addsCustomStore ? saveCustomStores(nextCustomStores) : storageResult(true, 'saved', { verified: true });
  if (!storeResult.ok) {
    const rolledBack = rollbackPurchase();
    showToast(rolledBack
      ? '저장 과정을 완료하지 못해 이전 상태로 되돌렸습니다. 장바구니는 유지됩니다.'
      : '저장 복구가 필요합니다. 앱을 다시 열면 이전 장바구니 상태를 자동으로 복구합니다.');
    recordUsage('purchase_save', { success: false, errorType: 'store-write', cartItemCount: items.length });
    return false;
  }
  try {
    const committedMarker = JSON.stringify({ status: 'committed', at: Date.now() });
    localStorage.setItem(PURCHASE_STATE_KEY, committedMarker);
    if (localStorage.getItem(PURCHASE_STATE_KEY) !== committedMarker) throw new Error('purchase-commit-verify');
  } catch (_) {
    const rolledBack = rollbackPurchase();
    showToast(rolledBack
      ? '저장 완료를 확인하지 못해 이전 상태로 되돌렸습니다. 장바구니는 유지됩니다.'
      : '저장 복구가 필요합니다. 앱을 다시 열면 이전 장바구니 상태를 자동으로 복구합니다.');
    recordUsage('purchase_save', { success: false, errorType: 'commit-verify', cartItemCount: items.length });
    return false;
  }
  state.purchases = nextPurchases;
  if (addsCustomStore) {
    state.customStores = nextCustomStores;
    refreshPurchaseStoreList();
    els.purchaseStore.value = store;
    els.purchaseCustomStore.value = '';
    els.customStoreEntry.hidden = true;
  }
  refreshStoreFilter();
  state.cart = {};
  state.pendingCode = null;
  els.purchaseBranch.value = '';
  resetQuantityControl();
  render();
  els.dashboardMonth.value = record.date.slice(0, 7);
  showView('dashboard');
  localStorage.removeItem(PURCHASE_STATE_KEY);
  localStorage.removeItem(PURCHASE_ROLLBACK_KEY);
  showToast('오늘의 전체 지출을 한 건으로 저장했습니다.');
  recordUsage('purchase_save', { success: true, cartItemCount: items.length });
  handleSuccessfulPurchaseSurvey();
  return true;
}

function resetQuantityControl() {
  els.quantityLabel.textContent = '같은 상품 수량 입력';
  els.quantityInput.value = '';
  els.quantityInput.disabled = true;
  els.quantitySubmit.disabled = true;
}

function showView(view) {
  const dashboard = view === 'dashboard';
  if (dashboard && (state.cameraStarting || state.stream || state.liveScanning || state.liveBusy || state.photoOcrBusy)) {
    stopCamera({ status: '카메라를 종료하고 지출·백업 화면으로 이동했습니다.' });
  }
  els.calculatorView.hidden = dashboard;
  els.dashboardView.hidden = !dashboard;
  document.querySelectorAll('.view-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  const activeTab = document.querySelector('.view-tabs button.active');
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialogReturnFocus.set(dialog, activeTab));
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
  const startedAt=performance.now();
  const cart=Object.values(state.cart); if(!cart.length){recordUsage('receipt_check',{success:false,durationMs:0,errorType:'empty-cart',cartItemCount:0});showToast('먼저 장바구니에 상품을 담아주세요.');return;}
  els.receiptCheckResult.hidden=false; els.receiptCheckResult.className='receipt-check-result'; els.receiptCheckResult.innerHTML='<strong>영수증을 분석하는 중입니다…</strong>';
  try {const prepared=await prepareOcrCanvas(file);const worker=await getProductOcrWorker();await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'',preserve_interword_spaces:'1'});const result=await worker.recognize(prepared.canvas);await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'});const text=result.data.text||'';const receiptTotal=receiptPriceCandidates(text);const expected=cart.reduce((s,i)=>s+promotionTotal(i),0);const missing=cart.filter(item=>{const key=normalizedProductName(item.name);const tokens=String(item.name).match(/[가-힣]{2,}|[A-Za-z]{3,}/g)||[];return !(key&&normalizedProductName(text).includes(key))&&!tokens.some(t=>text.replace(/\s/g,'').includes(t));});const diff=receiptTotal?receiptTotal-expected:null;const ok=receiptTotal&&diff===0&&missing.length===0;els.receiptCheckResult.classList.add(ok?'ok':'warn');els.receiptCheckResult.innerHTML=`<strong>${ok?'계산 내용과 영수증이 일치합니다.':'확인이 필요한 차이가 있습니다.'}</strong><span>장바구니 예상 합계: ${won(expected)}${receiptTotal?`<br>영수증 결제 합계: ${won(receiptTotal)}<br>차이: ${diff>0?'+':''}${won(diff)}`:'<br>영수증 총액을 확실히 읽지 못했습니다.'}${missing.length?`<br>영수증에서 확인되지 않은 상품: ${missing.map(i=>escapeHtml(i.name)).join(', ')}`:''}</span>`;recordUsage('receipt_check',{success:Boolean(receiptTotal),durationMs:performance.now()-startedAt,...(receiptTotal?{}:{errorType:'not-found'}),cartItemCount:cart.length});}catch(_){recordUsage('receipt_check',{success:false,durationMs:performance.now()-startedAt,errorType:'recognition',cartItemCount:cart.length});els.receiptCheckResult.classList.add('warn');els.receiptCheckResult.innerHTML='<strong>영수증을 읽지 못했습니다.</strong><span>영수증 전체가 평평하고 크게 보이도록 다시 촬영해주세요.</span>';}
}

function renderDashboard() {
  showBackupReminder();
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

function allStoreNames() {
  return [...new Set([...DEFAULT_STORES, ...state.customStores, ...state.purchases.map((record) => record.store || '미지정'), '미지정'])]
    .map((name) => String(name || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'));
}

function refreshPurchaseStoreList() {
  const before = els.purchaseStore.value;
  const customValue = els.purchaseCustomStore.value;
  const stores = [...new Set([...DEFAULT_STORES, ...state.customStores])];
  els.purchaseStore.innerHTML = stores.map((store) => `<option value="${escapeHtml(store)}">${escapeHtml(store)}</option>`).join('') + '<option value="__custom__">직접 입력</option>';
  els.purchaseStore.value = stores.includes(before) ? before : '__custom__';
  els.purchaseCustomStore.value = customValue;
  els.customStoreEntry.hidden = els.purchaseStore.value !== '__custom__';
}

function refreshStoreFilter() {
  const selected = els.dashboardStore.value || 'all';
  const stores = allStoreNames();
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
  setFieldError(els.promotionFieldError);
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
  openAccessibleDialog(els.promotionDialog);
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
  openAccessibleDialog(els.promotionDialog);
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

function stopMediaStream(stream) {
  try { stream?.getTracks?.().forEach((track) => { try { track.stop(); } catch (_) {} }); } catch (_) {}
}

function nextOcrTask() {
  state.ocrTaskId += 1;
  return state.ocrTaskId;
}

function isCurrentOcrTask(taskId) {
  return taskId === state.ocrTaskId;
}

function stopCamera({ invalidateOcr = true, status = '' } = {}) {
  state.cameraRequestId += 1;
  state.cameraStarting = false;
  if (invalidateOcr) nextOcrTask();
  state.scanning = false;
  state.liveScanning = false;
  state.liveBusy = false;
  state.liveCandidate = { signature: '', count: 0 };
  stopMediaStream(state.stream);
  state.stream = null;
  try { els.video.pause?.(); } catch (_) {}
  els.video.srcObject = null;
  els.cameraPlaceholder.hidden = false;
  els.cameraStage.classList.remove('active', 'capturing');
  els.cameraButton.textContent = '카메라 켜기';
  els.liveCameraPanel.classList.remove('live-visible');
  els.liveScanButton.classList.remove('active');
  els.liveScanButton.textContent = '◎ 갖다 대고 무음 자동 인식';
  if (invalidateOcr && state.photoOcrBusy) {
    state.photoOcrBusy = false;
    els.scannerCard?.setAttribute('aria-busy', 'false');
  }
  els.cameraButton.disabled = false;
  if (!state.photoOcrBusy) {
    els.liveScanButton.disabled = false;
    els.productPhotoButton.disabled = false;
  }
  if (status) setScanStatus(status, 'cancelled');
}

async function startCamera(barcodeMode = true) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const message = '이 브라우저나 기기에서는 카메라를 사용할 수 없습니다. 가격표 사진 선택 또는 상품 직접 입력으로 계속해 주세요.';
    setScanStatus(message, 'camera-unsupported');
    showToast(message, { error: true });
    return false;
  }
  if (barcodeMode && !('BarcodeDetector' in window)) {
    const message = '이 브라우저는 카메라 바코드 인식을 지원하지 않습니다. 가격표 사진 선택 또는 상품 직접 입력을 이용해 주세요.';
    setScanStatus(message, 'barcode-unsupported');
    showToast(message, { error: true });
    return false;
  }
  stopCamera({ status: '' });
  const requestId = ++state.cameraRequestId;
  state.cameraStarting = true;
  let requestedStream = null;
  setScanStatus('가격표·바코드 인식을 위해 카메라 권한을 요청합니다. 허용하지 않아도 사진 선택과 직접 입력을 사용할 수 있습니다.', 'camera-request');
  els.cameraButton.disabled = true;
  els.liveScanButton.disabled = true;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  try {
    requestedStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });
    if (requestId !== state.cameraRequestId) {
      stopMediaStream(requestedStream);
      return false;
    }
    state.stream = requestedStream;
    els.video.srcObject = requestedStream;
    await els.video.play();
    if (requestId !== state.cameraRequestId) {
      stopMediaStream(requestedStream);
      if (state.stream === requestedStream) stopCamera({ invalidateOcr: false });
      return false;
    }
    const track = requestedStream.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() || {};
    if (capabilities.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    }
    els.cameraPlaceholder.hidden = true;
    els.cameraStage.classList.add('active');
    els.cameraButton.textContent = '카메라 끄기';
    setScanStatus('바코드나 QR이 초록색 안내선 안에 크게 보이도록 가까이 대주세요.', 'camera-ready');
    state.scanning = barcodeMode;
    if (barcodeMode) void scanLoop();
    return true;
  } catch (error) {
    if (requestId !== state.cameraRequestId) {
      stopMediaStream(requestedStream);
      return false;
    }
    const message = cameraErrorMessage(error);
    if (state.stream === requestedStream) stopCamera({ invalidateOcr: false });
    else stopMediaStream(requestedStream);
    setScanStatus(message, 'camera-error');
    showToast(message, { error: true });
    return false;
  } finally {
    if (requestId === state.cameraRequestId) {
      state.cameraStarting = false;
      els.cameraButton.disabled = false;
      if (!state.photoOcrBusy) els.liveScanButton.disabled = false;
    }
  }
}

function videoFrameCanvas() {
  if(els.video.readyState<HTMLMediaElement.HAVE_CURRENT_DATA)return null;
  const canvas=document.createElement('canvas');canvas.width=els.video.videoWidth;canvas.height=els.video.videoHeight;
  canvas.getContext('2d',{alpha:false}).drawImage(els.video,0,0);return canvas;
}

function canvasFile(canvas) {
  return new Promise(resolve=>canvas.toBlob(blob=>resolve(blob?new File([blob],`live-${Date.now()}.jpg`,{type:'image/jpeg'}):null),'image/jpeg',.9));
}

function cropLiveGuideCanvas(source) {
  const video = els.video.getBoundingClientRect();
  const guide = els.video.parentElement.querySelector('.scan-frame').getBoundingClientRect();
  if (!video.width || !video.height || !guide.width || !guide.height) return null;
  // The centered cover preview hides part of the original camera frame.
  const cover = Math.max(video.width / source.width, video.height / source.height);
  const left = video.left + (video.width - source.width * cover) / 2;
  const top = video.top + (video.height - source.height * cover) / 2;
  const cropX = Math.max(0, Math.floor((guide.left + 3 - left) / cover));
  const cropY = Math.max(0, Math.floor((guide.top + 3 - top) / cover));
  const cropWidth = Math.min(source.width, Math.ceil((guide.right - 3 - left) / cover)) - cropX;
  const cropHeight = Math.min(source.height, Math.ceil((guide.bottom - 3 - top) / cover)) - cropY;
  if (cropWidth <= 0 || cropHeight <= 0) return null;
  const scale=Math.min(2,1600/Math.max(cropWidth,cropHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(cropWidth*scale));canvas.height=Math.max(1,Math.round(cropHeight*scale));
  const ctx=canvas.getContext('2d',{alpha:false});ctx.filter='grayscale(1) contrast(1.55)';ctx.drawImage(source,cropX,cropY,cropWidth,cropHeight,0,0,canvas.width,canvas.height);return canvas;
}

async function readLiveCandidate(canvas, taskId) {
  const focused = cropLiveGuideCanvas(canvas);
  if (!focused) return {};
  const worker = await getProductOcrWorker();
  if (!isCurrentOcrTask(taskId)) return {};
  await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'',preserve_interword_spaces:'1'});
  if (!isCurrentOcrTask(taskId)) return {};
  const result = await worker.recognize(focused);
  if (!isCurrentOcrTask(taskId)) return {};
  const parsed = parseProductAndPrice(result.data.text || '');
  parsed.name = cleanRecognizedProductName(parsed.name);
  if (!parsed.name && parsed.price > 0) {
    const title = await worker.recognize(cropProductTitleLine(focused));
    if (!isCurrentOcrTask(taskId)) return {};
    parsed.name = cleanRecognizedProductName(parseProductAndPrice(title.data.text || '').name);
  }
  await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'});
  return parsed;
}

async function liveTextScanLoop(taskId) {
  if (!isCurrentOcrTask(taskId) || !state.liveScanning || !state.stream) return;
  if (!state.liveBusy) {
    state.liveBusy = true;
    const startedAt = performance.now();
    recordUsage('ocr_start', { inputMethod: 'live', success: true });
    try {
      const canvas = videoFrameCanvas();
      if (canvas) {
        if (!isCurrentOcrTask(taskId)) return;
        setScanStatus('화면에 보이는 내용을 한 번에 빠르게 읽는 중입니다…', 'processing');
        const parsed = await readLiveCandidate(canvas, taskId);
        if (!isCurrentOcrTask(taskId)) return;
        if (parsed.name || Number(parsed.price) > 0) {
          state.pendingInputMethod = 'live';
          const file = await canvasFile(canvas);
          if (!isCurrentOcrTask(taskId)) return;
          const imageData = file ? await resizeProductPhoto(file) : '';
          if (!isCurrentOcrTask(taskId)) return;
          recordUsage('ocr_success', { inputMethod: 'live', success: true, durationMs: performance.now() - startedAt });
          stopCamera({ invalidateOcr: false });
          if (imageData && isCurrentOcrTask(taskId)) presentRecognizedProduct(parsed, imageData, '', false);
          return;
        }
        recordUsage('ocr_failure', { inputMethod: 'live', success: false, durationMs: performance.now() - startedAt, errorType: 'not-found' });
        setScanStatus('상품명과 가격을 읽지 못했습니다. 다시 맞추거나 상품 직접 입력을 이용해주세요.', 'failed');
      }
    } catch (_) {
      if (!isCurrentOcrTask(taskId)) return;
      recordUsage('ocr_failure', { inputMethod: 'live', success: false, durationMs: performance.now() - startedAt, errorType: 'recognition' });
      setScanStatus('글자를 읽지 못했습니다. 가격표 사진 불러오기 또는 상품 직접 입력으로 계속할 수 있습니다.', 'failed');
    } finally {
      if (isCurrentOcrTask(taskId)) state.liveBusy = false;
    }
  }
  if (isCurrentOcrTask(taskId) && state.liveScanning) setTimeout(() => liveTextScanLoop(taskId), 350);
}

async function toggleLiveScan() {
  if (state.liveScanning) { stopCamera({ status: '무음 자동 인식을 중지했습니다.' }); return; }
  stopCamera();
  els.liveCameraPanel.classList.add('live-visible'); els.liveScanButton.classList.add('active'); els.liveScanButton.textContent='자동 인식 중지';
  const started = await startCamera(false);
  if (!started || !state.stream) return;
  const taskId = nextOcrTask();
  state.liveScanning=true; state.liveCandidate={signature:'',count:0};
  setScanStatus('상품명과 가격을 초록색 사각형 안에 맞춰 주세요. 잠시 후 자동 인식합니다.', 'camera-ready');
  els.cameraStage.scrollIntoView({ block: 'center', behavior: 'instant' });
  // Give the preview time to paint and the user a moment to align the label.
  setTimeout(() => {
    if (isCurrentOcrTask(taskId) && state.liveScanning) void liveTextScanLoop(taskId);
  }, 1200);
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

els.cameraButton.addEventListener('click', () => state.stream ? stopCamera({ status: '카메라를 종료했습니다.' }) : startCamera());
els.liveScanButton.addEventListener('click', toggleLiveScan);
els.manualProductButton.addEventListener('click', () => { stopCamera({ status: '카메라를 종료하고 직접 입력으로 전환했습니다.' }); openManualProductDialog(); });
els.productPhotoButton.addEventListener('click', () => { stopCamera({ status: '카메라를 종료하고 사진 선택으로 전환했습니다.' }); els.productPhoto.click(); });
els.productPhoto.addEventListener('cancel', () => setScanStatus('사진 선택을 취소했습니다. 기존 장바구니는 그대로 유지됩니다.', 'cancelled'));
els.productPhoto.addEventListener('change', async () => {
  const file = els.productPhoto.files[0];
  if (!file) return setScanStatus('사진 선택을 취소했습니다. 기존 장바구니는 그대로 유지됩니다.', 'cancelled');
  stopCamera();
  const taskId = nextOcrTask();
  setScanStatus('가격표 사진을 선택했습니다. 인식을 시작합니다.', 'selected');
  state.pendingInputMethod = 'photo';
  setOcrBusy(true);
  try {
    await recognizeProductPhoto(file, taskId);
  } catch (_) {
    if (!isCurrentOcrTask(taskId)) return;
    showToast('가격표 사진을 읽지 못했습니다. 사진을 다시 선택하거나 상품 직접 입력으로 계속해 주세요.', { error: true });
    setScanStatus('가격표 글자 인식에 실패했습니다. 사진 재선택 또는 상품 직접 입력으로 계속할 수 있습니다.', 'failed');
  } finally {
    if (isCurrentOcrTask(taskId)) {
      els.productPhoto.value = '';
      setOcrBusy(false);
    }
  }
});
els.captureScanButton.addEventListener('click', captureAndScan);
els.switchModeButton.addEventListener('click', () => setMode(state.mode === 'product' ? 'price' : 'product'));
els.quantityForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const item = state.cart[state.pendingCode];
  const quantity = Number(els.quantityInput.value);
  if (!item || !Number.isInteger(quantity) || quantity < 1) return showToast('수량을 1개 이상 입력해주세요.');
  const nextCart = { ...state.cart, [state.pendingCode]: { ...item, quantity } };
  if (!commitCart(nextCart, '수량 변경을 저장하지 못했습니다. 기존 수량을 유지합니다.').ok) return;
  recordUsage('quantity_changed', { success: true, modifiedFields: ['quantity'], cartItemCount: Object.keys(state.cart).length });
  showToast(`${item.name} 수량을 ${quantity}개로 변경했어요.`);
});
els.productName.addEventListener('input', () => { showRecognitionWarnings({ name: els.productName.value, price: els.productPrice.value }); refreshSimilarProductChoice(); });
els.productWeight.addEventListener('input', refreshSimilarProductChoice);
els.productPrice.addEventListener('input', () => {
  setFieldError(els.productPriceError);
  updateDetectedDiscountPreview();
  showRecognitionWarnings({ name: els.productName.value, price: els.productPrice.value });
});
els.priceCandidateOptions.addEventListener('click', (event) => {
  const button = event.target.closest('[data-price]');
  if (!button) return;
  els.productPrice.value = button.dataset.price;
  recordUsage('price_candidate_selected', { inputMethod: state.pendingInputMethod || 'photo', success: true, modifiedFields: ['price'] });
  els.priceCandidateOptions.querySelectorAll('.price-candidate-option').forEach((option) => option.classList.toggle('selected', option === button));
  if (els.detectedDiscountType.value !== 'none') {
    els.applyDetectedDiscount.checked = false;
    els.discountRequirementBadge.textContent = '할인 적용 재확인';
    els.discountRequirementBadge.classList.add('conditional');
    showToast('가격 후보를 변경했습니다. 할인 적용 여부를 다시 확인해주세요.');
  }
  updateDetectedDiscountPreview();
  showRecognitionWarnings({ name: els.productName.value, price: els.productPrice.value });
});
els.detectedDiscountType.addEventListener('change', () => { updateDiscountControls(); syncDiscountAutoApply(); });
els.detectedDiscountValue.addEventListener('input', () => { setFieldError(els.detectedDiscountError); updateDetectedDiscountPreview(); syncDiscountAutoApply(); });
els.detectedDiscountCondition.addEventListener('input', () => {
  const conditional = Boolean(els.detectedDiscountCondition.value.trim()) && els.detectedDiscountCondition.value.trim() !== '별도 조건 문구 없음';
  els.discountRequirementBadge.textContent = conditional ? '조건부 할인' : '조건 없는 할인';
  els.discountRequirementBadge.classList.toggle('conditional', conditional);
});
els.productForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (els.productForm.dataset.submitting === 'true') return;
  els.productForm.dataset.submitting = 'true';
  queueMicrotask(() => { els.productForm.dataset.submitting = ''; });
  const name = els.productName.value.trim();
  const weight = els.productWeight.value.trim();
  const price = parsePriceInput(els.productPrice.value);
  const quantity = Number(els.productQuantity.value);
  if (!name) { showToast('상품명을 입력해주세요.'); els.productName.focus(); return; }
  if (!Number.isSafeInteger(price) || price < 1) {
    const message = '가격은 1원 이상의 정수로 입력해주세요.';
    setFieldError(els.productPriceError, message);
    showToast(message);
    els.productPrice.focus();
    showRecognitionWarnings({ name, price });
    return;
  }
  setFieldError(els.productPriceError);
  if (!Number.isInteger(quantity) || quantity < 1) { showToast('수량은 1개 이상의 정수로 입력해주세요.'); els.productQuantity.focus(); return; }
  const discountType = els.detectedDiscountType.value;
  const discountRaw = els.detectedDiscountValue.value.trim();
  const discountValue = Number(discountRaw);
  if (discountType !== 'none' && (!discountRaw || !Number.isFinite(discountValue) || discountValue <= 0)) {
    const message = discountType === 'percent' ? '할인율은 1~100 사이로 입력해주세요.' : '0원 할인은 적용할 수 없습니다. 할인을 지우려면 할인 없음을 선택해주세요.';
    setFieldError(els.detectedDiscountError, message);
    showToast(message);
    els.detectedDiscountValue.focus();
    return;
  }
  if (discountType === 'percent' && discountValue > 100) {
    const message = '할인율은 1~100 사이로 입력해주세요.';
    setFieldError(els.detectedDiscountError, message);
    showToast(message);
    els.detectedDiscountValue.focus();
    return;
  }
  if (discountType === 'amount' && !Number.isInteger(discountValue)) {
    const message = '개당 할인액은 소수 없이 원 단위 정수로 입력해주세요.';
    setFieldError(els.detectedDiscountError, message);
    showToast(message);
    els.detectedDiscountValue.focus();
    return;
  }
  if (discountType === 'amount' && discountValue > price) {
    const message = '개당 할인액은 상품의 개당 가격보다 클 수 없습니다.';
    setFieldError(els.detectedDiscountError, message);
    showToast(message);
    els.detectedDiscountValue.focus();
    return;
  }
  setFieldError(els.detectedDiscountError);
  const recognized = state.pendingRecognizedFields;
  const modifiedFields = recognized ? [
    recognized.productName !== name ? 'productName' : '',
    recognized.price !== String(price) ? 'price' : '',
    recognized.specification !== weight ? 'specification' : '',
    recognized.category !== els.productCategory.value ? 'category' : '',
    recognized.discount !== discountType ? 'discount' : ''
  ].filter(Boolean) : [];
  const cardCondition = discountType !== 'none' && /카드/.test(els.detectedDiscountCondition.value);
  const matchChoice = els.productForm.querySelector('input[name="productMatchChoice"]:checked')?.value || 'new';
  const code = matchChoice === 'existing' && state.pendingSimilarCode
    ? state.pendingSimilarCode
    : state.pendingCode || `manual:${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const confirmedProduct = { name, price, weight, category: els.productCategory.value, scanFingerprint: state.pendingFingerprint || scanFingerprint({name,price,weight}) };
  const existingCartItem = state.cart[code];
  const nextCatalog = { ...state.catalog, [code]: confirmedProduct };
  const nextCartItem = { ...(existingCartItem || {}), ...confirmedProduct, code, quantity: (existingCartItem?.quantity || 0) + quantity };
  nextCartItem.promotion = els.applyDetectedDiscount.checked && discountType !== 'none'
    ? (discountType === 'amount'
      ? { type: 'amount', amount: discountValue, condition: els.detectedDiscountCondition.value.trim() }
      : { type: 'percent', percent: discountValue, condition: els.detectedDiscountCondition.value.trim() })
    : null;
  const nextCart = { ...state.cart, [code]: nextCartItem };
  const catalogResult = saveCatalog(nextCatalog);
  if (!catalogResult.ok) return;
  const cartResult = saveCart(nextCart);
  if (!cartResult.ok) {
    const rollback = saveCatalog(state.catalog);
    showToast(rollback.ok
      ? '상품을 기기에 저장하지 못했습니다. 기존 장바구니는 변경되지 않았습니다.'
      : '저장 상태를 완전히 확인하지 못했습니다. 앱을 종료하지 말고 백업 후 기록을 확인해주세요.');
    return;
  }
  state.catalog = nextCatalog;
  state.cart = nextCart;
  els.dialog.close();
  clearPendingProductPhoto();
  state.pendingSimilarCode = null;
  selectQuantityProduct(code);
  render();
  if (modifiedFields.length) recordUsage('product_fields_modified', { inputMethod: state.pendingInputMethod || 'unknown', success: true, modifiedFields, cartItemCount: Object.keys(state.cart).length });
  recordUsage('cart_add', { inputMethod: state.pendingInputMethod || 'barcode', success: true, cartItemCount: Object.keys(state.cart).length });
  if (discountType !== 'none') recordUsage(els.applyDetectedDiscount.checked ? 'discount_applied' : 'discount_cancelled', { success: true, cartItemCount: Object.keys(state.cart).length });
  if (cardCondition) recordUsage(els.applyDetectedDiscount.checked ? 'card_discount_approved' : 'card_discount_rejected', { success: true, cartItemCount: Object.keys(state.cart).length });
  state.pendingRecognizedFields = null;
  setMode('product');
  setScanStatus('확인한 상품을 장바구니에 등록했습니다.', 'registered');
  showSaveResultToast(`${name} ${quantity}개를 장바구니에 등록했습니다.`);
});
els.cancelDialog.addEventListener('click', () => { els.dialog.close(); clearPendingProductPhoto(); });
els.retryPhotoDialog.addEventListener('click', () => {
  els.dialog.close();
  stopCamera();
  setScanStatus('새 가격표 사진을 선택해 주세요.', 'cancelled');
  requestAnimationFrame(() => els.productPhoto.click());
});
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
els.cancelPromotion.addEventListener('click', () => { recordUsage('discount_cancelled', { success: true, cartItemCount: Object.keys(state.cart).length }); els.promotionDialog.close(); });
els.promotionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.promotionForm));
  const promo = { type: els.promotionType.value };
  for (const key of ['buy', 'free', 'count', 'bundlePrice', 'percent', 'amount']) if (data[key] !== undefined) promo[key] = Number(data[key]);
  const item = state.cart[state.promotionCode];
  if (!item) return showToast('장바구니에서 상품을 찾지 못했어요.');
  const promotionError = promo.type === 'percent' && (!Number.isFinite(promo.percent) || promo.percent < 1 || promo.percent > 100)
    ? '할인율은 1~100 사이로 입력해주세요.'
    : promo.type === 'amount' && (!Number.isFinite(promo.amount) || promo.amount < 0)
      ? '정액 할인은 0원 이상의 정수로 입력해주세요.'
      : promo.type === 'amount' && !Number.isInteger(promo.amount)
        ? '정액 할인은 소수 없이 원 단위 정수로 입력해주세요.'
        : promo.type === 'amount' && promo.amount === 0
          ? '0원 할인은 적용할 수 없습니다. 할인을 지우려면 행사 없음을 선택해주세요.'
          : promo.type === 'amount' && promo.amount > item.price
            ? '정액 할인은 개당 적용되므로 상품의 개당 가격보다 클 수 없습니다.'
            : promo.type === 'plus' && (!Number.isInteger(promo.buy) || promo.buy < 1 || !Number.isInteger(promo.free) || promo.free < 1)
              ? '행사 수량은 1개 이상의 정수로 입력해주세요.'
              : promo.type === 'bundle' && (!Number.isInteger(promo.count) || promo.count < 1 || !Number.isFinite(promo.bundlePrice) || promo.bundlePrice <= 0)
                ? '묶음 수량과 가격을 올바르게 입력해주세요.'
                : '';
  if (promotionError) {
    setFieldError(els.promotionFieldError, promotionError);
    showToast(promotionError);
    return;
  }
  setFieldError(els.promotionFieldError);
  const nextCart = { ...state.cart, [state.promotionCode]: { ...item, promotion: promo.type === 'none' ? null : promo } };
  if (!commitCart(nextCart, '할인 변경을 저장하지 못했습니다. 기존 할인을 유지합니다.').ok) return;
  recordUsage(promo.type === 'none' ? 'discount_cancelled' : 'discount_applied', { success: true, cartItemCount: Object.keys(state.cart).length });
  els.promotionDialog.close();
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
  const nextCart = { ...state.cart, [code]: { ...state.cart[code], quantity: state.cart[code].quantity + (button.dataset.action === 'plus' ? 1 : -1) } };
  if (nextCart[code].quantity <= 0) {
    delete nextCart[code];
  }
  if (!commitCart(nextCart).ok) return;
  if (!state.cart[code]) {
    if (state.pendingCode === code) {
      state.pendingCode = null;
      els.quantityLabel.textContent = '같은 상품 수량 입력';
      els.quantityInput.value = '';
      els.quantityInput.disabled = true;
      els.quantitySubmit.disabled = true;
    }
  } else selectQuantityProduct(code);
});
els.resetButton.addEventListener('click', () => {
  if (!Object.keys(state.cart).length || confirm('장바구니의 모든 상품을 지울까요?')) {
    if (!commitCart({}, '장바구니를 비우지 못했습니다. 기존 상품을 유지합니다.').ok) return;
    state.pendingCode = null;
    resetQuantityControl();
  }
});
document.querySelectorAll('.view-tabs button').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
els.savePurchaseButton.addEventListener('click', openPurchaseSummary);
els.purchaseStore.addEventListener('change', () => {
  const isCustom = els.purchaseStore.value === '__custom__';
  els.customStoreEntry.hidden = !isCustom;
  if (isCustom) els.purchaseCustomStore.focus();
  else { els.purchaseCustomStore.value = ''; els.purchaseBranch.value = ''; }
});
els.saveCustomStore.addEventListener('click', saveDirectStore);
els.purchaseCustomStore.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); saveDirectStore(); }
});
els.cancelCheckout.addEventListener('click', () => els.checkoutDialog.close());
els.confirmPurchaseSave.addEventListener('click', () => runButtonOnce(els.confirmPurchaseSave, () => {
  els.checkoutDialog.close();
  return saveCurrentPurchase();
}));
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
  const nextPurchases = state.purchases.filter((record) => record.id !== id);
  if (!savePurchases(nextPurchases).ok) return;
  state.purchases = nextPurchases;
  refreshStoreFilter();
  renderDashboard();
});
els.backupButton.addEventListener('click', () => runButtonOnce(els.backupButton, exportBackup));
els.dismissBackupReminder.addEventListener('click', () => {
  const key = els.backupReminder.dataset.reminderKey;
  if (key) {
    try { localStorage.setItem('quickSumBackupReminderDismissed', key); } catch (_) {}
  }
  els.backupReminder.hidden = true;
});
els.restoreButton.addEventListener('click', () => els.restoreFile.click());
els.restoreFile.addEventListener('cancel', () => showToast('백업 파일 선택을 취소했습니다. 기존 데이터는 변경되지 않았습니다.'));
els.restoreFile.addEventListener('change', async () => {
  const file = els.restoreFile.files[0];
  if (!file) return showToast('백업 파일 선택을 취소했습니다. 기존 데이터는 변경되지 않았습니다.');
  try { await prepareRestore(file); }
  catch (error) {
    recordUsage('restore', { success: false, errorType: 'validation' });
    const message = error?.message?.includes('기존 데이터는 유지됩니다')
      ? error.message
      : error instanceof SyntaxError
        ? '백업 파일 내용을 읽을 수 없습니다. 기존 데이터는 변경되지 않았습니다.'
        : '호환되는 바로합계 백업 파일이 아닙니다. 기존 데이터는 변경되지 않았습니다.';
    showToast(message, { error: true });
  }
  finally { els.restoreFile.value = ''; }
});
els.cancelRestore.addEventListener('click', () => { state.pendingBackup = null; els.restoreDialog.close(); showToast('복원을 취소했습니다. 기존 데이터는 변경되지 않았습니다.'); });
els.restoreForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const submitButton = els.restoreForm.querySelector('button[type="submit"]');
  runButtonOnce(submitButton, () => {
    const mode = new FormData(els.restoreForm).get('restoreMode');
    if (mode === 'replace' && !confirm('현재 데이터를 모두 백업 내용으로 교체할까요?')) return false;
    const restored = applyRestore(mode);
    if (restored) els.restoreDialog.close();
    return restored;
  });
});
els.csvButton.addEventListener('click', exportMonthlyCsv);
els.anonymousJsonButton.addEventListener('click', () => runButtonOnce(els.anonymousJsonButton, exportAnonymousJson));
els.anonymousCsvButton.addEventListener('click', () => runButtonOnce(els.anonymousCsvButton, exportAnonymousCsv));
els.clearAnonymousButton.addEventListener('click', () => {
  if (confirm('이 기기에 저장된 익명 이용기록을 모두 삭제할까요? 구매기록과 설문 응답은 유지됩니다.')) clearAnonymousUsage();
});
els.clearAllDataButton.addEventListener('click', () => runButtonOnce(els.clearAllDataButton, () => {
  if (!confirm('상품·장바구니·구매기록·익명 이용기록·설문 응답을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return false;
  return clearAllAppData();
}));
els.surveyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (els.surveyForm.dataset.submitting === 'true') return;
  els.surveyForm.dataset.submitting = 'true';
  queueMicrotask(() => { els.surveyForm.dataset.submitting = ''; });
  const selected = new FormData(els.surveyForm).get('surveyAnswer');
  const answerId = String(selected || '');
  if (!validSurveyAnswer(activeSurveyId, answerId)) return showToast('응답을 선택하거나 건너뛰기를 눌러주세요.');
  finishSurvey('answered', answerId);
});
els.skipSurvey.addEventListener('click', () => finishSurvey('skipped'));
els.closeSurvey.addEventListener('click', () => finishSurvey('skipped'));
els.surveyDialog.addEventListener('cancel', (event) => { event.preventDefault(); finishSurvey('skipped'); });
const finishOnboarding = () => {
  saveOnboardingSeen();
  if (els.onboardingDialog.open) els.onboardingDialog.close();
};
els.onboardingHelpButton.addEventListener('click', () => showOnboarding({ manual: true }));
els.closeOnboarding.addEventListener('click', finishOnboarding);
els.startOnboarding.addEventListener('click', finishOnboarding);
els.onboardingDialog.addEventListener('cancel', (event) => { event.preventDefault(); finishOnboarding(); });
window.addEventListener('offline', () => updateNetworkStatus());
window.addEventListener('online', () => updateNetworkStatus({ announceOnline: true }));
window.addEventListener('pagehide', () => stopCamera());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state.cameraStarting || state.stream || state.liveScanning || state.liveBusy || state.photoOcrBusy)) stopCamera();
});

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

let waitingServiceWorker = null;
let serviceWorkerRegistration = null;
let updateReloadRequested = false;
let updateReloading = false;
let updateApplyTimer = null;
let updateAttemptId = 0;
let updateWorkerStateHandler = null;
let updateAttemptWorker = null;
let updateMessagePort = null;
const UPDATE_APPLY_TIMEOUT_MS = 12000;

function importantWorkInProgress() {
  return Boolean(
    state.cameraStarting || state.photoOcrBusy || state.liveBusy || state.liveScanning || state.scanning
    || document.querySelector('[data-running="true"], [aria-busy="true"]')
  );
}

function showServiceWorkerUpdate(worker) {
  if (!worker || !navigator.serviceWorker.controller || !els.updateNotice) return;
  waitingServiceWorker = worker;
  els.updateNoticeText.textContent = '새 버전이 준비되었습니다. 진행 중인 작업을 저장한 뒤 다시 시작해 주세요.';
  els.updateNotice.hidden = false;
  els.applyUpdateButton.disabled = false;
}

function clearUpdateAttempt() {
  if (updateApplyTimer) clearTimeout(updateApplyTimer);
  updateApplyTimer = null;
  if (updateAttemptWorker && updateWorkerStateHandler) {
    try { updateAttemptWorker.removeEventListener('statechange', updateWorkerStateHandler); } catch (_) {}
  }
  updateAttemptWorker = null;
  updateWorkerStateHandler = null;
  try { updateMessagePort?.close?.(); } catch (_) {}
  updateMessagePort = null;
}

function recoverUpdateAttempt(attemptId) {
  if (attemptId !== updateAttemptId || updateReloading || !updateReloadRequested) return;
  updateAttemptId += 1;
  clearUpdateAttempt();
  updateReloadRequested = false;
  const currentWaiting = serviceWorkerRegistration?.waiting || null;
  waitingServiceWorker = currentWaiting;
  if (els.applyUpdateButton) els.applyUpdateButton.disabled = false;
  if (els.updateNotice) els.updateNotice.hidden = false;
  if (els.updateNoticeText) {
    els.updateNoticeText.textContent = '업데이트를 적용하지 못했습니다. 현재 작업은 유지되며 다시 시도할 수 있습니다.';
  }
  serviceWorkerRegistration?.update?.().then(() => {
    if (serviceWorkerRegistration.waiting) showServiceWorkerUpdate(serviceWorkerRegistration.waiting);
  }).catch(() => {});
}

function watchServiceWorkerRegistration(registration) {
  serviceWorkerRegistration = registration;
  if (registration.waiting) showServiceWorkerUpdate(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) showServiceWorkerUpdate(installing);
    });
  });
}

els.laterUpdateButton?.addEventListener('click', () => { els.updateNotice.hidden = true; });
els.applyUpdateButton?.addEventListener('click', () => {
  if (!waitingServiceWorker || updateReloadRequested) return;
  if (importantWorkInProgress()) {
    els.updateNoticeText.textContent = '진행 중인 작업을 먼저 마친 뒤 새 버전을 적용해 주세요.';
    showToast('진행 중인 작업이 있어 업데이트를 잠시 미뤘습니다. 작업을 마친 뒤 다시 눌러주세요.');
    return;
  }
  clearUpdateAttempt();
  const worker = waitingServiceWorker;
  updateAttemptWorker = worker;
  const attemptId = ++updateAttemptId;
  updateReloadRequested = true;
  els.applyUpdateButton.disabled = true;
  els.updateNoticeText.textContent = '새 버전을 적용하고 있습니다. 잠시만 기다려 주세요.';
  updateApplyTimer = setTimeout(() => recoverUpdateAttempt(attemptId), UPDATE_APPLY_TIMEOUT_MS);
  updateWorkerStateHandler = () => {
    if (attemptId === updateAttemptId && worker.state === 'redundant') recoverUpdateAttempt(attemptId);
  };
  try { worker.addEventListener('statechange', updateWorkerStateHandler); } catch (_) {}
  try {
    if (typeof MessageChannel === 'function') {
      const channel = new MessageChannel();
      updateMessagePort = channel.port1;
      channel.port1.onmessage = (event) => {
        if (attemptId !== updateAttemptId || event.data?.type !== 'BAROHAPGYE_ACTIVATE_UPDATE_ACK') return;
        els.updateNoticeText.textContent = '새 버전 활성화를 확인하고 있습니다. 잠시만 기다려 주세요.';
      };
      worker.postMessage({ type: 'BAROHAPGYE_ACTIVATE_UPDATE' }, [channel.port2]);
    } else {
      worker.postMessage({ type: 'BAROHAPGYE_ACTIVATE_UPDATE' });
    }
  } catch (_) {
    recoverUpdateAttempt(attemptId);
  }
});

function handleServiceWorkerControllerChange(reload = () => window.location.reload()) {
    if (!updateReloadRequested || updateReloading) return false;
    clearUpdateAttempt();
    updateReloading = true;
    reload();
    return true;
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => handleServiceWorkerControllerChange());
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js')
    .then(watchServiceWorkerRegistration)
    .catch(() => {
      if (els.networkStatus) {
        els.networkStatus.textContent = '오프라인 사용 준비를 완료하지 못했습니다. 현재 화면의 계산과 직접 입력은 계속 사용할 수 있습니다.';
        els.networkStatus.hidden = false;
      }
    }));
}

// Large OCR resources are loaded from local files only when OCR is first used.

setMode('product');
els.purchaseDate.value = localDate();
els.dashboardMonth.value = localDate().slice(0, 7);
for (const [key, issue] of storageIssues) {
  const approved = confirm(`${issue.label} 데이터를 읽지 못했습니다. 원본은 복구용으로 보존했습니다. 이 항목을 건너뛰고 새 데이터 저장을 허용할까요?`);
  if (approved) storageWriteApproved.add(key);
}
if (storageIssues.size) showToast('일부 저장 데이터를 읽지 못했지만 나머지 기록으로 앱을 계속 실행합니다.');
if (interruptedRestoreRecovered) showToast('완료되지 않은 복원을 취소하고 이전 데이터를 복구했습니다.');
state.cart = savedCart;
refreshPurchaseStoreList();
refreshStoreFilter();
updateBackupStatus();
updateAnonymousUsageCount();
updateNetworkStatus();
initializeOnboarding();
recordUsage('app_start', { success: true, cartItemCount: Object.keys(state.cart).length });
render();
