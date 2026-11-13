const extension = globalThis.browser ?? globalThis.chrome;
const form = document.querySelector('#record');
const save = form.querySelector('button');
const filter = document.querySelector('#filter');
const historyList = document.querySelector('#history');
const totals = document.querySelector('#totals');
const exportButton = document.querySelector('#export');
const status = document.querySelector('#status');
const number = new Intl.NumberFormat('pt-PT');
const date = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
let records = [];

function visibleRecords() {
  const query = filter.value.trim().toLocaleLowerCase('pt-PT');
  return records.filter(record => record.box.toLocaleLowerCase('pt-PT').includes(query));
}

function render() {
  const visible = visibleRecords();
  const count = visible.reduce((sum, record) => sum + record.count, 0);
  const cost = visible.reduce((sum, record) => sum + record.cost, 0);
  const value = visible.reduce((sum, record) => sum + record.value, 0);
  totals.textContent = visible.length
    ? `${number.format(count)} aberturas · ${number.format(cost)} gastas · ${number.format(value)} em drops · saldo de ${number.format(value - cost)} moedas`
    : 'Nenhuma abertura registada para esta pesquisa.';
  historyList.replaceChildren(...visible.slice(0, 50).map(record => {
    const entry = document.createElement('li');
    entry.textContent = `${record.box} ×${number.format(record.count)} · ${date.format(record.createdAt)} · saldo de ${number.format(record.value - record.cost)} moedas`;
    return entry;
  }));
  if (visible.length > 50) {
    const note = document.createElement('li');
    note.textContent = 'A lista mostra os 50 registos mais recentes. O CSV inclui todos os resultados.';
    historyList.append(note);
  }
  exportButton.disabled = visible.length === 0;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(form);
  const box = data.get('box').trim();
  if (!box) {
    status.textContent = 'Introduz o nome da caixa.';
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
    status.textContent = 'Abertura registada.';
  } catch {
    status.textContent = 'Não foi possível guardar a abertura.';
  } finally {
    save.disabled = false;
  }
});

filter.addEventListener('input', render);
exportButton.addEventListener('click', () => {
  const rows = visibleRecords().map(({ box, count, cost, value, createdAt }) => {
    const safeBox = /^[=+\-@]/.test(box) ? "'" + box : box;
    return [new Date(createdAt).toISOString(), '"' + safeBox.replaceAll('"', '""') + '"', count, cost, value, value - cost].join(';');
  });
  const url = URL.createObjectURL(new Blob(['\uFEFF', ['data;caixa;aberturas;custo;valor_drops;saldo', ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'stride-aberturas.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function initialize() {
  try {
    ({ records = [] } = await extension.storage.local.get('records'));
    render();
    save.disabled = false;
  } catch {
    status.textContent = 'Não foi possível carregar o histórico.';
  }
}

initialize();
