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
let language = 'en';
let messages = translations.en;
let number;
let date;
let statusKey;
let records = [];

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
    const updated = [record, ...records];
    await extension.storage.local.set({ records: updated });
    records = updated;
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

// Runs in the active tab on demand and reads only the visible results.
function readStrideResult() {
  const visible = element => element.checkVisibility({ visibilityProperty: true });
  const text = element => element.innerText.trim().replace(/\s+/g, ' ');
  const buttons = [...document.querySelectorAll('button, [role="button"]')].filter(visible);
  const sell = /^Sell all\s+(\d+(?:[, ]\d{3})*)$/i;
  const repeat = /^Open\s+(\d+)\s+more\D+(\d+(?:[, ]\d{3})*)$/i;
  const sellButtons = buttons.filter(button => sell.test(text(button)));
  if (sellButtons.length !== 1) return null;
  const sellButton = sellButtons[0];
  let container = sellButton.parentElement;
  let repeatMatch;
  while (container && container !== document.body) {
    const matches = buttons.filter(button => container.contains(button))
      .map(button => text(button).match(repeat)).filter(Boolean);
    if (matches.length > 1) return null;
    if (matches.length === 1) {
      [repeatMatch] = matches;
      break;
    }
    container = container.parentElement;
  }
  const headings = [...document.querySelectorAll('h1')].filter(visible);
  if (!repeatMatch || headings.length !== 1) return null;
  const box = text(headings[0]);
  const count = Number(repeatMatch[1]);
  const cost = Number(repeatMatch[2].replace(/[, ]/g, ''));
  const value = Number(text(sellButton).match(sell)[1].replace(/[, ]/g, ''));
  if (!box || box.length > 140 || ![1, 2, 3, 5].includes(count) ||
      !Number.isSafeInteger(cost) || cost > 1e12 || !Number.isSafeInteger(value) || value > 1e12) return null;
  return { box, count, cost, value };
}

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
    if (statusKey === 'languageError') setStatus();
  } catch {
    applyLanguage(previousLanguage);
    setStatus('languageError');
  } finally {
    languageSelect.disabled = false;
  }
});

async function initialize() {
  const defaultLanguage = /^pt(?:-|$)/i.test(navigator.language) ? 'pt-PT' : 'en';
  try {
    const stored = await extension.storage.local.get(['records', 'language']);
    records = stored.records ?? [];
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
