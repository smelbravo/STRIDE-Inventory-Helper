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
const autoForm = document.querySelector('#auto-open');
const autoStatus = document.querySelector('#auto-status');
const autoStop = document.querySelector('#auto-stop');
let autoTab;
let autoBusy = false;
let autoProgress;
let autoError = false;

function renderAuto() {
  autoForm.querySelector('[type="submit"]').disabled = autoBusy || autoProgress?.state === 'running';
  autoStop.disabled = autoProgress?.state !== 'running';
  autoStatus.textContent = autoProgress
    ? messages.autoStatus(autoProgress.done, autoProgress.total, messages.autoStates[autoProgress.state])
    : autoError ? messages.autoSetup : '';
}

async function autoCommand(command, ...args) {
  const [{ result } = {}] = await extension.scripting.executeScript({
    target: { tabId: autoTab }, func: (action, params) => runCaseOpening(action, ...params),
    args: [command, args]
  });
  return result;
}

autoForm.addEventListener('submit', async event => {
  event.preventDefault();
  autoBusy = true;
  renderAuto();
  try {
    const [tab] = await extension.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/^https:\/\/stridecsgo\.net\/cases(?:\/|[?#]|$)/.test(tab.url)) throw new Error();
    autoTab = tab.id;
    await extension.scripting.executeScript({ target: { tabId: autoTab }, files: ['auto-open.js'] });
    const preview = await autoCommand('preview');
    const quantity = Number(autoForm.elements.quantity.value);
    if (!preview || quantity % preview.count !== 0 || !Number.isSafeInteger(quantity * preview.cost)) throw new Error();
    if (!confirm(messages.autoConfirm(number.format(quantity), number.format(quantity / preview.count * preview.cost)))) return;
    autoProgress = await autoCommand('start', quantity, preview);
    if (!autoProgress) throw new Error();
    autoError = false;
  } catch {
    autoError = true;
    autoProgress = null;
  } finally {
    autoBusy = false;
    renderAuto();
  }
});

autoStop.addEventListener('click', async () => {
  try {
    await autoCommand('stop');
  } catch {
    autoProgress = null;
    autoError = true;
    renderAuto();
  }
});

async function refreshAuto() {
  if (autoBusy) return;
  try {
    const [tab] = await extension.tabs.query({ active: true, currentWindow: true });
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
    const stored = await extension.storage.local.get('language');
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
