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
let autoTab;
let autoBusy = false;
let autoProgress;
let autoError = false;
const picker = document.querySelector('#case-picker');
const caseSearch = document.querySelector('#case-search');
const catalogStatus = document.querySelector('#catalog-status');
let catalog = [];
const catalogVersion = 2;

function readCaseCatalog() {
  const category = /^(?:weapon cases|souvenir packages|collections|agents|sticker capsules|patch packs|pins|music kits|graffiti)$/i;
  const footer = /^(?:open\b|[\d,.\s]+$|[^\p{L}\d]+\s*\d)/iu;
  const clean = value => (value ?? '').trim().replace(/\s+/g, ' ');
  const isName = value => value && !category.test(value) && !footer.test(value) && value !== '★';

  return [...document.querySelectorAll('a[href]')].flatMap(anchor => {
    const url = new URL(anchor.href);
    if (url.origin !== location.origin || !/^\/cases\/[^/]+\/?$/.test(url.pathname)) return [];

    const lines = anchor.innerText.split('\n').map(clean).filter(Boolean);
    const categoryIndex = lines.findIndex(line => category.test(line));
    const cardName = categoryIndex < 0 ? '' : lines[categoryIndex + 1];
    const headings = [...anchor.querySelectorAll('h2,h3,h4')].map(heading => clean(heading.innerText));
    const imageName = clean(anchor.querySelector('img[alt]')?.alt);
    const name = [cardName, ...headings, imageName, ...lines].find(isName);
    return name ? [{ name, url: url.origin + url.pathname }] : [];
  });
}

function renderCatalog() {
  const selected = picker.value;
  const query = caseSearch.value.trim().toLowerCase();
  const matching = catalog.filter(entry => entry.name.toLowerCase().includes(query));
  picker.replaceChildren(new Option(messages.chooseCase, ''), ...matching.map(entry => new Option(entry.name, entry.url)));
  if (matching.some(entry => entry.url === selected)) picker.value = selected;
  document.querySelector('#catalog-label').hidden = !catalog.length;
  caseSearch.placeholder = messages.filter;
}

async function openStrideTab(url) {
  const tab = await extension.tabs.create({ url, active: false });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const current = await extension.tabs.get(tab.id);
    if (current.status === 'complete' && current.url !== 'about:blank') return current;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  await extension.tabs.remove(tab.id).catch(() => {});
  throw new Error();
}

caseSearch.addEventListener('input', renderCatalog);
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
    catalog = [...new Map(entries.map(entry => [entry.url, entry])).values()].sort((a, b) => a.name.localeCompare(b.name));
    await extension.storage.local.set({ catalog, catalogVersion });
    renderCatalog();
  } catch {
    catalogStatus.textContent = messages.catalogError;
  } finally {
    if (catalogTab !== undefined) await extension.tabs.remove(catalogTab).catch(() => {});
    button.disabled = false;
  }
});

function renderAuto() {
  autoForm.querySelector('[type="submit"]').disabled = autoBusy || autoProgress?.state === 'running';
  autoStop.disabled = autoProgress?.state !== 'running';
  autoStatus.textContent = autoProgress
    ? messages.autoStatus(autoProgress.done, autoProgress.total, messages.autoStates[autoProgress.state])
    : autoError ? messages[autoError] : '';
}

async function autoCommand(command, ...args) {
  const reply = await extension.tabs.sendMessage(autoTab, {
    target: 'stride-opening', command, args
  });
  if (reply.error) throw new Error(reply.error);
  return reply.result;
}

autoForm.addEventListener('submit', async event => {
  event.preventDefault();
  autoBusy = true;
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
    const tab = selected ? await openStrideTab(selected.url)
      : (await extension.tabs.query({ active: true, currentWindow: true }))[0];
    if (selected) openedTab = tab.id;
    if (/^https:\/\/stridecsgo\.net\/login(?:[/?#]|$)/.test(tab?.url ?? '')) {
      autoProgress = null;
      autoError = 'autoLogin';
      return;
    }
    if (!tab?.url || !/^https:\/\/stridecsgo\.net\/cases(?:\/|[?#]|$)/.test(tab.url)) throw new Error();
    autoTab = tab.id;
    await extension.scripting.executeScript({ target: { tabId: autoTab }, files: ['auto-open.js'] });
    failure = 'autoTabError';
    let preview;
    if (selected) {
      const deadline = Date.now() + 8000;
      do {
        await autoCommand('prepare', 0, { box: selected.name, url: selected.url });
        preview = await autoCommand('previewInitial', 0, { box: selected.name, url: selected.url });
        if (preview) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      } while (Date.now() < deadline);
      if (!preview) {
        failure = await autoCommand('diagnose', 0, { box: selected.name, url: selected.url }) ?? 'autoCatalogError';
        openedTab = undefined;
        throw new Error();
      }
    } else {
      preview = await autoCommand('preview');
    }
    const quantity = Number(autoForm.elements.quantity.value);
    failure = selected ? 'autoCatalogError' : 'autoSetup';
    if (!preview || quantity % preview.count !== 0 || !Number.isSafeInteger(quantity * preview.cost)) throw new Error();
    if (!confirm(messages.autoConfirm(number.format(quantity), number.format(quantity / preview.count * preview.cost)))) return;
    autoProgress = await autoCommand('start', quantity, preview);
    if (!autoProgress) throw new Error();
    openedTab = undefined;
    await extension.storage.local.set({ openingTab: autoTab });
    autoError = false;
  } catch {
    autoError = failure;
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
    await refreshRecords();
    applyLanguage(stored.language ?? defaultLanguage);
    save.disabled = false;
    importButton.disabled = false;
    languageSelect.disabled = false;
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
