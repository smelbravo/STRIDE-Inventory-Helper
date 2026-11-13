// Runs in the active tab on demand and reads only the visible results.
function readStrideResult(includeControls = false, caseName = '') {
  const visible = element => element.checkVisibility({ visibilityProperty: true });
  const text = element => element.innerText.trim().replace(/\s+/g, ' ');
  const buttons = [...document.querySelectorAll('button, [role="button"]')].filter(visible);
  const sell = /^Sell(?: all)?\s+(\d+(?:[, ]\d{3})*)$/i;
  const repeat = /^Open\s+(\d+)\s+more\D+(\d+(?:[, ]\d{3})*)$/i;
  const all = buttons.filter(button => /^Sell all\s/i.test(text(button)) && sell.test(text(button)));
  const sellButtons = all.length ? all : buttons.filter(button => sell.test(text(button)));
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
  if (!repeatMatch || (!caseName && headings.length !== 1)) return null;
  const box = caseName || text(headings[0]);
  const count = Number(repeatMatch[1]);
  if (!all.length && count !== 1) return null;
  const cost = Number(repeatMatch[2].replace(/[, ]/g, ''));
  const value = Number(text(sellButton).match(sell)[1].replace(/[, ]/g, ''));
  if (!box || box.length > 140 || ![1, 2, 3, 5].includes(count) ||
      !Number.isSafeInteger(cost) || cost > 1e12 || !Number.isSafeInteger(value) || value > 1e12) return null;
  const data = { box, count, cost, value };
  if (!includeControls) return data;
  const id = container.innerText.match(/Item ID\s+(\d+)/i) ??
    container.parentElement?.innerText.match(/Item ID\s+(\d+)/i) ??
    container.parentElement?.parentElement?.innerText.match(/Item ID\s+(\d+)/i);
  const button = buttons.find(button => container.contains(button) && repeat.test(text(button)));
  if (!id || !button) return null;
  let modal = container;
  while (modal && !/Item ID\s+\d+/i.test(modal.innerText)) modal = modal.parentElement;
  const drops = [...(modal?.querySelectorAll('button img[alt], [role="button"] img[alt]') ?? [])]
    .filter(image => visible(image) && image.alt.trim())
    .map(image => image.alt.trim());
  if (!drops.length && count === 1) {
    const title = modal?.querySelector('h1,h2,h3,[role="heading"]')?.innerText.trim();
    if (title) drops.push(title);
  }
  return { data: { ...data, itemId: id[1] }, button, drops };
}

function prepareCase(selectSingle, expected, diagnose = false) {
  const { box, url } = expected ?? {};
  if (!box || url !== location.origin + location.pathname) {
    return diagnose ? { failure: 'autoCaseRoute' } : null;
  }
  const normalize = value => value.replace(/[\u200B-\u200F\u2060\uFEFF]/g, '').trim().replace(/\s+/g, ' ');
  const buttons = [...document.querySelectorAll('button, [role="button"]')].filter(button => button.checkVisibility());
  const labels = button => [button.innerText, button.textContent, button.getAttribute('aria-label') ?? ''].map(normalize);
  const price = /^OPEN\s*[^\p{L}\d]*(\d+(?:[, ]\d{3})*)$/iu;
  const open = buttons.find(button => labels(button).some(label => price.test(label)));
  const failure = !open ? 'autoOpenControl'
    : open.matches(':disabled, [aria-disabled="true"]') ? 'autoOpenDisabled' : null;
  if (failure) return diagnose ? { failure } : null;
  const cost = Number(labels(open).find(label => price.test(label)).match(price)[1].replace(/[, ]/g, ''));
  const unitPrices = [...normalize(document.body.innerText).matchAll(/(?<!\d)(\d+(?:[, ]\d{3})*)\s*per case\b/gi)]
    .map(match => Number(match[1].replace(/[, ]/g, '')));
  if (selectSingle && !unitPrices.includes(cost)) {
    const quantityPattern = /^(?:[×✕✖x]\s*)?([1235])$/i;
    for (let row = open.parentElement; row && row !== document.body; row = row.parentElement) {
      const quantities = new Map();
      for (const element of row.querySelectorAll('button, [role], [tabindex], span, div, label')) {
        const match = labels(element).map(label => label.match(quantityPattern)).find(Boolean);
        if (!match || !element.checkVisibility()) continue;
        const control = element.closest('button, [role], [tabindex], label') ?? element;
        if (row.contains(control) && !quantities.has(match[1])) quantities.set(match[1], control);
      }
      if (['1', '2', '3', '5'].every(quantity => quantities.has(quantity)) &&
          new Set(quantities.values()).size === 4) {
        quantities.get('1').click();
        break;
      }
    }
  }
  if (!unitPrices.includes(cost) || !Number.isSafeInteger(cost) || cost <= 0) {
    return diagnose ? { failure: 'autoPriceMismatch' } : null;
  }
  return { box, url, count: 1, cost, button: open };
}

async function runCaseOpening(command, quantity = 0, expected = null) {
  const key = '__strideInventoryOpening';
  if (command === 'status') return globalThis[key]?.progress ?? null;
  if (command === 'stop') {
    if (globalThis[key]) globalThis[key].stop = true;
    return globalThis[key]?.progress ?? null;
  }

  const read = () => readStrideResult(true, expected?.initial ? expected.box : '');
  if (command === 'diagnose') return prepareCase(false, expected, true)?.failure ?? null;
  if (command === 'prepare') {
    prepareCase(true, expected);
    return null;
  }
  const initial = expected?.initial || command === 'previewInitial' ? prepareCase(false, expected) : null;
  const first = initial
    ? { data: { box: initial.box, url: initial.url, count: 1, cost: initial.cost, initial: true }, button: initial.button }
    : read();
  if (command === 'previewInitial') return initial ? first.data : null;
  if (command === 'preview') return first?.data ?? null;
  if (globalThis[key]?.progress.state === 'running' || !first ||
      JSON.stringify(first.data) !== JSON.stringify(expected) ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000 ||
      quantity % first.data.count !== 0) return null;

  const session = { stop: false, progress: { done: 0, total: quantity, state: 'running' } };
  globalThis[key] = session;
  const originalUrl = location.href;
  const store = (globalThis.browser ?? globalThis.chrome).storage.local;

  async function run() {
    let current = first;
    try {
      while (session.progress.done < quantity && !session.stop) {
        const readyDeadline = Date.now() + 10000;
        let ready;
        while (!session.stop) {
          if (location.href !== originalUrl) throw new Error('failed');
          if (current.data.initial) {
            const control = prepareCase(false, first.data);
            ready = control && { data: { box: control.box, url: control.url, count: 1, cost: control.cost, initial: true }, button: control.button };
          } else {
            ready = read();
          }
          if (ready && (ready.data.itemId !== current.data.itemId ||
              ready.data.box !== first.data.box || ready.data.count !== first.data.count ||
              ready.data.cost > first.data.cost)) throw new Error('changed');
          if (ready && !ready.button.matches(':disabled, [aria-disabled="true"]')) break;
          if (Date.now() >= readyDeadline) throw new Error('unavailable');
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (session.stop) break;
        current = ready;
        current.button.click();
        const deadline = Date.now() + 45000;
        let next;
        do {
          await new Promise(resolve => setTimeout(resolve, 250));
          if (location.href !== originalUrl) throw new Error();
          next = read();
          if (Date.now() >= deadline) throw new Error('unconfirmed');
        } while (!next || next.data.itemId === current.data.itemId);
        if (next.data.box !== first.data.box) throw new Error();

        const { box, count, cost } = current.data;
        const record = { box, count, cost, value: next.data.value, drops: next.drops, createdAt: Date.now() };
        await store.set({ ['opening:' + next.data.itemId]: record });
        session.progress.done += count;
        current = next;
      }
      session.progress.state = session.progress.done === quantity ? 'complete' : 'stopped';
    } catch (error) {
      session.progress.state = ['changed', 'unavailable', 'unconfirmed'].includes(error.message)
        ? error.message : 'failed';
    }
  }

  void run();
  return session.progress;
}

// Keep commands in the same content-script context as the opening session.
if (!globalThis.__strideOpeningListener) {
  const runtime = (globalThis.browser ?? globalThis.chrome).runtime;
  runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== runtime.id || message?.target !== 'stride-opening') return false;
    runCaseOpening(message.command, ...message.args).then(
      result => respond({ result }),
      error => respond({ error: error.message })
    );
    return true;
  });
  globalThis.__strideOpeningListener = true;
}
