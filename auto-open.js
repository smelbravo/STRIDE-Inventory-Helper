// Runs in the active tab on demand and reads only the visible results.
function readStrideResult(includeControls = false) {
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
  const data = { box, count, cost, value };
  if (!includeControls) return data;
  const id = container.innerText.match(/Item ID\s+(\d+)/i) ??
    container.parentElement?.innerText.match(/Item ID\s+(\d+)/i) ??
    container.parentElement?.parentElement?.innerText.match(/Item ID\s+(\d+)/i);
  const button = buttons.find(button => container.contains(button) && repeat.test(text(button)));
  if (!id || !button) return null;
  return { data: { ...data, itemId: id[1] }, button };
}

async function runCaseOpening(command, quantity = 0, expected = null) {
  const key = '__strideInventoryOpening';
  if (command === 'status') return globalThis[key]?.progress ?? null;
  if (command === 'stop') {
    if (globalThis[key]) globalThis[key].stop = true;
    return globalThis[key]?.progress ?? null;
  }

  const read = () => readStrideResult(true);
  const first = read();
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
          ready = read();
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
        const record = { box, count, cost, value: next.data.value, createdAt: Date.now() };
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
