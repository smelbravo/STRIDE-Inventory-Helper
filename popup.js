const extension = globalThis.browser ?? globalThis.chrome;
const form = document.querySelector('#record');
const save = form.querySelector('[type="submit"]');
const importButton = document.querySelector('#import-result');
const filter = document.querySelector('#filter');
const historyList = document.querySelector('#history');
const totals = document.querySelector('#totals');
const exportButton = document.querySelector('#export');
const status = document.querySelector('#status');
const languageSelect = document.querySelector('#language');
const languageStatus = document.querySelector('#language-status');
const tabs = [...document.querySelectorAll('[data-panel]')];
for (const tab of tabs) {
  tab.addEventListener('click', () => {
    for (const candidate of tabs) {
      const selected = candidate === tab;
      candidate.setAttribute('aria-pressed', String(selected));
      document.getElementById(candidate.dataset.panel).hidden = !selected;
    }
  });
}
let language = 'en';
let messages = translations.en;
let number;
let date;
let statusKey;
let records = [];
const autoForm = document.querySelector('#auto-open');
const autoStatus = document.querySelector('#auto-status');
const autoStop = document.querySelector('#auto-stop');
const showCaseTab = document.querySelector('#show-case-tab');
let loadingCaseTab;

showCaseTab.addEventListener('click', async () => {
  try {
    await extension.tabs.update(loadingCaseTab, { active: true });
  } catch {
    loadingCaseTab = undefined;
    renderAuto();
  }
});
let autoTab;
let autoBusy = false;
let autoProgress;
let autoError = false;
let autoDetail = '';
const picker = document.querySelector('#case-picker');
const caseSearch = document.querySelector('#case-search');
const caseCategory = document.querySelector('#case-category');
const catalogStatus = document.querySelector('#catalog-status');
let catalog = [];
const catalogVersion = 3;

function readCaseCatalog(categoryOnly = false) {
  const categories = {
    'weapon case': 'weapon cases', 'souvenir package': 'souvenir packages',
    collection: 'collections', agent: 'agents', 'sticker capsule': 'sticker capsules',
    'patch pack': 'patch packs', pin: 'pins', 'music kit': 'music kits', graffiti: 'graffiti'
  };
  const category = value => Object.entries(categories).find(([singular, plural]) =>
    [singular, plural].includes(value.toLowerCase()))?.[1];
  const footer = /^(?:open\b|[\d,.\s]+$|[^\p{L}\d]+\s*\d)/iu;
  const clean = value => (value ?? '').trim().replace(/\s+/g, ' ');
  const isName = value => value && !category(value) && !footer.test(value) && value !== '★';

  const kind = new URL(location.href).searchParams.get('kind');
  const activeCategory = (kind === 'cases' ? 'weapon cases' : category((kind ?? '').replace(/[-_]/g, ' '))) ??
    [...document.querySelectorAll('[aria-selected="true"], [aria-pressed="true"], [aria-current="page"], [data-state="active"]')]
      .map(element => category(clean(element.innerText).replace(/\s+[\d,]+$/, ''))).find(Boolean) ?? '';
  if (categoryOnly) return activeCategory;
  return [...document.querySelectorAll('a[href]')].flatMap(anchor => {
    const url = new URL(anchor.href);
    if (url.origin !== location.origin || !/^\/cases\/(?:[^/]+\/)*[^/]+\/?$/.test(url.pathname)) return [];

    const lines = anchor.innerText.split('\n').map(clean).filter(Boolean);
    const categoryIndex = lines.findIndex(category);
    const cardName = categoryIndex < 0 ? '' : lines[categoryIndex + 1];
    const headings = [...anchor.querySelectorAll('h2,h3,h4')].map(heading => clean(heading.innerText));
    const imageName = clean(anchor.querySelector('img[alt]')?.alt);
    const name = [cardName, ...headings, imageName, ...lines].find(isName);
    const inferred = /\bcapsule\b/i.test(name) ? 'sticker capsules'
      : /\bsouvenir package\b/i.test(name) ? 'souvenir packages' : '';
    const kind = categoryIndex < 0 ? (activeCategory || inferred) : category(lines[categoryIndex]);
    return name ? [{ name, kind, url: url.origin + url.pathname }] : [];
  });
}

function renderCatalog() {
  const selected = picker.value;
  const category = caseCategory.value;
  const query = caseSearch.value.trim().toLowerCase();
  caseCategory.replaceChildren(new Option(messages.allCategories, ''), ...Object.entries(messages.caseCategories)
    .map(([key, label]) => new Option(label, key)));
  caseCategory.value = category;
  document.querySelector('#category-hint').textContent = category && !catalog.some(entry => entry.kind === category)
    ? messages.catalogCategoryHint : '';
  const matching = catalog.filter(entry => (!category || entry.kind === category) && entry.name.toLowerCase().includes(query));
  picker.replaceChildren(new Option(matching.length ? messages.chooseCatalogItem : messages.noCatalogItems, ''),
    ...matching.map(entry => new Option(entry.name, entry.url)));
  if (matching.some(entry => entry.url === selected)) picker.value = selected;
  document.querySelector('#catalog-label').hidden = !catalog.length;
}

async function openStrideTab(url, keepOnTimeout = false) {
  const tab = await extension.tabs.create({ url, active: false });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const current = await extension.tabs.get(tab.id);
    if (current.status === 'complete' && current.url && current.url !== 'about:blank') return current;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!keepOnTimeout) await extension.tabs.remove(tab.id).catch(() => {});
  throw new Error(keepOnTimeout ? messages.autoTabTimeout : messages.catalogError);
}

caseSearch.addEventListener('input', renderCatalog);
caseCategory.addEventListener('change', renderCatalog);
document.querySelector('#load-catalog').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  catalogStatus.textContent = '';
  let catalogTab;
  try {
    const [activeTab] = await extension.tabs.query({ active: true, currentWindow: true });
    let tab = activeTab;
    if (!/^https:\/\/stridecsgo\.net\/cases\/?(?:[?#]|$)/.test(tab?.url ?? '')) {
      tab = await openStrideTab('https://stridecsgo.net/cases');
      catalogTab = tab.id;
    }
    if (/^https:\/\/stridecsgo\.net\/login(?:[/?#]|$)/.test(tab.url ?? '')) {
      catalogStatus.textContent = messages.catalogLogin;
      return;
    }
    let entries = [];
    for (let attempt = 0; attempt < 16 && !entries.length; attempt++) {
      const [{ result }] = await extension.scripting.executeScript({
        target: { tabId: tab.id },
        func: readCaseCatalog
      });
      entries = result;
      if (!entries.length) await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!entries.length) {
      catalogStatus.textContent = messages.catalogEmpty;
      return;
    }
    const merged = new Map(catalog.map(entry => [entry.url, entry]));
    for (const entry of entries) {
      merged.set(entry.url, { ...entry, kind: entry.kind || merged.get(entry.url)?.kind || '' });
    }
    catalog = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
    await extension.storage.local.set({ catalog, catalogVersion });
    renderCatalog();
    await syncCatalogCategory(tab).catch(() => {});
  } catch {
    catalogStatus.textContent = messages.catalogError;
  } finally {
    if (catalogTab !== undefined) await extension.tabs.remove(catalogTab).catch(() => {});
    button.disabled = false;
  }
});

const sessionRarity = document.querySelector('#session-rarity');
const selectedDrops = new Set();
let renderedDrops = '';
sessionRarity.addEventListener('change', renderAuto);
function dropSummary(drop) {
  return [drop.name, drop.rarity, '#' + drop.itemId,
    drop.float == null ? '' : 'Float ' + drop.float,
    drop.seed == null ? '' : messages.dropSeed + ' ' + drop.seed,
    drop.quickSell == null ? '' : 'Quick Sell ' + number.format(drop.quickSell)
  ].filter(Boolean).join(' · ');
}

document.querySelector('#select-visible-drops').addEventListener('click', () => {
  for (const drop of autoProgress?.drops ?? []) {
    if (drop.itemId && (!sessionRarity.value || drop.rarity === sessionRarity.value)) selectedDrops.add(drop.itemId);
  }
  renderedDrops = '';
  renderAuto();
});
document.querySelector('#copy-all-drops').addEventListener('click', () =>
  copyDrops((autoProgress?.drops ?? []).filter(drop => drop.itemId).map(dropSummary)));
document.querySelector('#copy-session-items').addEventListener('click', async () => {
  const ids = (autoProgress?.drops ?? []).filter(drop => selectedDrops.has(drop.itemId)).map(drop => drop.itemId);
  await copyDrops(ids);
});

async function copyDrops(lines) {
  const status = document.querySelector('#session-selection-status');
  if (!lines.length) {
    status.textContent = messages.noSelectedDrops;
    return;
  }
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    status.textContent = messages.dropDetailsCopied;
  } catch {
    status.textContent = messages.dropIdsCopyError;
  }
}

function renderAuto() {
  autoForm.querySelector('[type="submit"]').disabled = autoBusy || autoProgress?.state === 'running';
  autoStop.disabled = autoProgress?.state !== 'running';
  showCaseTab.hidden = autoBusy || loadingCaseTab === undefined;
  autoStatus.textContent = autoProgress
    ? messages.autoStatus(autoProgress.done, autoProgress.total, messages.autoStates[autoProgress.state])
    : autoError ? [messages[autoError], autoDetail].filter(Boolean).join(' ') : '';
  const drops = (autoProgress?.drops ?? []).filter(drop => drop?.itemId);
  const details = document.querySelector('#session-drops');
  const list = document.querySelector('#session-drop-list');
  details.hidden = drops.length === 0;
  if (drops.length && autoProgress.state === 'complete' && details.dataset.opened !== 'true') {
    details.open = true;
    details.dataset.opened = 'true';
  }
  if (!drops.length) delete details.dataset.opened;
  const rarity = sessionRarity.value;
  const signature = JSON.stringify([drops, rarity, messages.allDropRarities]);
  if (renderedDrops !== signature) {
    renderedDrops = signature;
    const rarities = [...new Set(drops.map(drop => drop.rarity).filter(Boolean))].sort();
    sessionRarity.replaceChildren(new Option(messages.allDropRarities, ''), ...rarities.map(value => new Option(value, value)));
    sessionRarity.value = rarities.includes(rarity) ? rarity : '';
    const items = document.createDocumentFragment();
    for (const drop of drops) {
      if (sessionRarity.value && drop.rarity !== sessionRarity.value) continue;
      const item = document.createElement('li');
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedDrops.has(drop.itemId);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedDrops.add(drop.itemId);
        else selectedDrops.delete(drop.itemId);
      });
      label.className = 'session-drop';
      label.append(checkbox, dropSummary(drop));
      item.append(label);
      if (/^(?:★\s*)?(?:StatTrak™\s*)?(?:[^|]*\bKnife\b|[^|]*\bBayonet\b|Karambit|Shadow Daggers|Talon|Kukri)\s*(?:\||$)/i.test(drop.name)) {
        item.className = 'session-knife';
      }
      items.append(item);
    }
    list.replaceChildren(items);
  }
}

async function syncCatalogCategory(tab) {
  if (!/^https:\/\/stridecsgo\.net\/cases\/?(?:[?#]|$)/.test(tab?.url ?? '')) return;
  const previous = caseCategory.value;
  const [{ result }] = await extension.scripting.executeScript({
    target: { tabId: tab.id }, func: readCaseCatalog, args: [true]
  });
  if (caseCategory.value !== previous || (result && !Object.hasOwn(messages.caseCategories, result))) return;
  caseCategory.value = result;
  renderCatalog();
}

async function autoCommand(command, ...args) {
  const reply = await extension.tabs.sendMessage(autoTab, {
    target: 'stride-opening', command, args
  }, { frameId: 0 });
  if (!reply) throw new Error('No response from the case page.');
  if (reply.error) {
    const error = new Error(reply.error);
    error.casePage = true;
    throw error;
  }
  return reply.result;
}

autoForm.addEventListener('submit', async event => {
  event.preventDefault();
  autoBusy = true;
  autoDetail = '';
  loadingCaseTab = undefined;
  renderAuto();
  let openedTab;
  let failure = 'autoSetup';
  try {
    const selected = catalog.find(entry => entry.url === picker.value);
    if (selected) {
      failure = 'autoPermission';
      const access = { origins: ['https://stridecsgo.net/*'] };
      // Firefox requires the request to run directly in the submit gesture.
      const granted = await extension.permissions.request(access);
      if (!granted) throw new Error();
      failure = 'autoTabError';
    }
    const [activeTab] = await extension.tabs.query({ active: true, currentWindow: true });
    let tab = activeTab;
    if (selected && activeTab?.url?.split(/[?#]/, 1)[0] !== selected.url) {
      tab = await openStrideTab(selected.url, true);
      openedTab = tab.id;
    }
    if (/^https:\/\/stridecsgo\.net\/login(?:[/?#]|$)/.test(tab?.url ?? '')) {
      autoProgress = null;
      autoError = 'autoLogin';
      return;
    }
    if (!tab?.url || !/^https:\/\/stridecsgo\.net\/cases(?:\/|[?#]|$)/.test(tab.url)) {
      failure = selected ? 'autoCaseRoute' : 'autoSetup';
      if (selected) openedTab = undefined;
      throw new Error();
    }
    autoTab = tab.id;
    await extension.scripting.executeScript({ target: { tabId: autoTab }, files: ['auto-open.js'] });
    failure = 'autoTabError';
    const quantity = Number(autoForm.elements.quantity.value);
    let preview;
    if (selected) {
      const details = await autoCommand('caseDetails', quantity, { box: selected.name, url: selected.url, skipAnimation: autoForm.elements.skipAnimation.checked });
      const deadline = Date.now() + 8000;
      do {
        await autoCommand('prepare', 0, details);
        preview = await autoCommand('previewInitial', 0, details);
        if (preview) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      } while (Date.now() < deadline);
      if (!preview) {
        const diagnosis = await autoCommand('diagnose', 0, details);
        failure = diagnosis?.failure ?? 'autoCatalogError';
        autoDetail = diagnosis?.detail ?? '';
        if (failure === 'autoBackgroundLoading') {
          loadingCaseTab = tab.id;
          autoDetail = '';
        }
        openedTab = undefined;
        throw new Error();
      }
    } else {
      preview = await autoCommand('preview');
    }
    failure = selected ? 'autoCatalogError' : 'autoSetup';
    if (!preview || quantity % preview.count !== 0 || !Number.isSafeInteger(quantity * preview.cost)) throw new Error();
    if (!confirm(messages.autoConfirm(number.format(quantity), number.format(quantity / preview.count * preview.cost)))) return;
    autoProgress = await autoCommand('start', quantity, preview);
    if (!autoProgress) throw new Error();
    openedTab = undefined;
    await extension.storage.local.set({ openingTab: autoTab });
    autoError = false;
  } catch (error) {
    autoError = error.casePage ? 'autoPageError' : failure;
    if (error.message) autoDetail = error.message.slice(0, 240);
    if (error.casePage) openedTab = undefined;
    autoProgress = null;
  } finally {
    if (openedTab !== undefined) await extension.tabs.remove(openedTab).catch(() => {});
    autoBusy = false;
    renderAuto();
  }
});

autoStop.addEventListener('click', async () => {
  try {
    await autoCommand('stop');
  } catch {
    autoProgress = null;
    autoError = 'autoSetup';
    renderAuto();
  }
});

async function refreshAuto() {
  if (autoBusy) return;
  try {
    const { openingTab } = await extension.storage.local.get('openingTab');
    const tab = openingTab !== undefined ? await extension.tabs.get(openingTab)
      : (await extension.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab?.url || !/^https:\/\/stridecsgo\.net\/cases(?:\/|[?#]|$)/.test(tab.url)) return;
    autoTab = tab.id;
    autoProgress = await autoCommand('status');
    renderAuto();
  } catch {
    // This tab has no opening session yet.
  }
}

async function refreshRecords() {
  const stored = await extension.storage.local.get();
  const automatic = Object.entries(stored).filter(([key]) => key.startsWith('opening:')).map(([, record]) => record);
  records = [...(stored.records ?? []), ...automatic].sort((a, b) => b.createdAt - a.createdAt);
}


function setStatus(key) {
  statusKey = key;
  status.textContent = key ? messages[key] : '';
}

function applyLanguage(nextLanguage) {
  language = nextLanguage === 'pt-PT' ? 'pt-PT' : 'en';
  messages = translations[language];
  number = new Intl.NumberFormat(language);
  date = new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' });
  document.documentElement.lang = language;
  languageSelect.value = language;
  for (const element of document.querySelectorAll('[data-text]')) {
    element.textContent = messages[element.dataset.text];
  }
  setStatus(statusKey);
  renderCatalog();
  renderAuto();
  render();
}

function visibleRecords() {
  const query = filter.value.trim().toLocaleLowerCase(language);
  return records.filter(record => record.box.toLocaleLowerCase(language).includes(query));
}

function render() {
  const visible = visibleRecords();
  const count = visible.reduce((sum, record) => sum + record.count, 0);
  const cost = visible.reduce((sum, record) => sum + record.cost, 0);
  const value = visible.reduce((sum, record) => sum + record.value, 0);
  totals.textContent = visible.length
    ? messages.totals(number.format(count), number.format(cost), number.format(value), number.format(value - cost))
    : messages.empty;
  historyList.replaceChildren(...visible.slice(0, 50).map(record => {
    const entry = document.createElement('li');
    entry.textContent = `${record.box} ×${number.format(record.count)} · ${date.format(record.createdAt)} · ${messages.balance(number.format(record.value - record.cost))}`;
    if (record.drops?.length) {
      const drops = document.createElement('div');
      drops.textContent = record.drops.join(' · ');
      entry.append(drops);
    }
    return entry;
  }));
  if (visible.length > 50) {
    const note = document.createElement('li');
    note.textContent = messages.limit;
    historyList.append(note);
  }
  exportButton.disabled = visible.length === 0;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(form);
  const box = data.get('box').trim();
  if (!box) {
    setStatus('missingBox');
    form.elements.box.focus();
    return;
  }
  save.disabled = true;
  const record = {
    box,
    count: Number(data.get('count')),
    cost: Number(data.get('cost')),
    value: Number(data.get('value')),
    createdAt: Date.now()
  };
  try {
    const stored = await extension.storage.local.get("records");
    const updated = [record, ...(stored.records ?? [])];
    await extension.storage.local.set({ records: updated });
    await refreshRecords();
    form.elements.value.value = '';
    filter.value = '';
    render();
    setStatus('saved');
  } catch {
    setStatus('saveError');
  } finally {
    save.disabled = false;
  }
});

filter.addEventListener('input', render);

importButton.addEventListener('click', async () => {
  importButton.disabled = true;
  try {
    const [tab] = await extension.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/^https:\/\/stridecsgo\.net\/cases(?:\/|[?#]|$)/.test(tab.url)) {
      setStatus('importPage');
      return;
    }
    const [{ result } = {}] = await extension.scripting.executeScript({
      target: { tabId: tab.id },
      func: readStrideResult
    });
    if (!result) {
      setStatus('importMissing');
      return;
    }
    for (const [field, value] of Object.entries(result)) form.elements[field].value = value;
    setStatus('importReady');
  } catch {
    setStatus('importMissing');
  } finally {
    importButton.disabled = false;
  }
});

exportButton.addEventListener('click', () => {
  const rows = visibleRecords().map(({ box, count, cost, value, createdAt }) => {
    const safeBox = /^[=+\-@]/.test(box) ? "'" + box : box;
    return [new Date(createdAt).toISOString(), '"' + safeBox.replaceAll('"', '""') + '"', count, cost, value, value - cost].join(';');
  });
  const url = URL.createObjectURL(new Blob(['\uFEFF', [messages.csvHeader, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = messages.csvFilename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

languageSelect.addEventListener('change', async () => {
  const previousLanguage = language;
  applyLanguage(languageSelect.value);
  languageSelect.disabled = true;
  try {
    await extension.storage.local.set({ language });
    languageStatus.textContent = '';
  } catch {
    applyLanguage(previousLanguage);
    languageStatus.textContent = messages.languageError;
  } finally {
    languageSelect.disabled = false;
  }
});

async function initialize() {
  const defaultLanguage = /^pt(?:-|$)/i.test(navigator.language) ? 'pt-PT' : 'en';
  try {
    const stored = await extension.storage.local.get(['language', 'catalog', 'catalogVersion']);
    catalog = stored.catalogVersion === catalogVersion ? (stored.catalog ?? []) : [];
    applyLanguage(stored.language ?? defaultLanguage);
    void extension.tabs.query({ active: true, currentWindow: true })
      .then(([tab]) => syncCatalogCategory(tab)).catch(() => {});
    languageSelect.disabled = false;
    await refreshRecords();
    render();
    save.disabled = false;
    importButton.disabled = false;
  } catch {
    applyLanguage(defaultLanguage);
    setStatus('loadError');
  }
}

initialize();

void refreshAuto();
setInterval(refreshAuto, 750);
extension.storage.onChanged.addListener(async changes => {
  if (!Object.keys(changes).some(key => key.startsWith('opening:'))) return;
  await refreshRecords();
  render();
});
