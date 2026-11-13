// Runs in the active tab on demand and reads only the visible results.
function readSouvenirStickers(modal, includeUnnamed = false) {
  const stickerLabel = /^sticker\s*(?:[|:·–-]\s*|\s+)(.+)$/i;
  const stickerGroup = '[data-stickers], [data-sticker-slot], [aria-label="Stickers" i]';
  const names = [];
  for (const image of modal.querySelectorAll('img')) {
    if (!image.checkVisibility({ visibilityProperty: true })) continue;
    const control = image.closest('button, [role="button"]');
    const asset = image.getAttribute('src') ?? '';
    const labels = [image.getAttribute('data-sticker-name'), image.alt, image.title,
      image.getAttribute('aria-label'), control?.getAttribute('data-sticker-name'),
      control?.getAttribute('aria-label'), control?.title,
      image.parentElement?.getAttribute('aria-label'),
      image.parentElement?.getAttribute('title'),
      image.parentElement?.textContent];
    const explicit = labels.map(label => label?.trim().match(stickerLabel)?.[1]).find(Boolean);
    const named = image.getAttribute('data-sticker-name') ?? control?.getAttribute('data-sticker-name');
    const contextual = image.closest(stickerGroup) || /(?:^|[/_])stickers?(?:[/_]|$)/i.test(asset) ||
      labels.some(label => /\(Gold\)\s*\|/i.test(label ?? ''))
      ? labels.find(label => label?.trim() && !/^stickers?$/i.test(label.trim())) : null;
    const name = (explicit ?? named ?? contextual)?.trim().replace(/\s+/g, ' ');
    if (name && !/^(?:stickers?|sticker slot\s*\d+|empty)$/i.test(name)) names.push(includeUnnamed ? { image, name } : name);
    else if (includeUnnamed && !/^\d[\d,\s]*$/.test(control?.innerText.trim() ?? '')) {
      names.push({ image, name: null });
    }
  }
  return names;
}

async function collectSouvenirStickers(result, drop, stickerNamesByImage) {
  if (!drop?.souvenir) return drop;
  const stickerText = /^Sticker\s*\|\s*(.+)$/i;
  const names = [];
  const stillSelected = () => result.modal.isConnected &&
    result.modal.innerText.match(/\bItem ID\s+(\d+)/i)?.[1] === drop.itemId;
  const tooltipNames = () => [...document.querySelectorAll('[role="tooltip"], [data-state="delayed-open"], [data-state="instant-open"], [data-state="open"]')]
    .filter(node => node.checkVisibility({ visibilityProperty: true }))
    .map(node => node.textContent.trim().match(stickerText)?.[1])
    .filter(name => name && !name.includes('\n'));
  for (const { image, name } of readSouvenirStickers(result.modal, true)) {
    if (!stillSelected()) return drop;
    if (result.thumbnails.some(button => button.contains(image))) continue;
    const asset = image.currentSrc || image.getAttribute('src');
    const knownName = name ?? (asset && stickerNamesByImage.get(asset));
    if (knownName) {
      names.push(knownName);
      continue;
    }
    const trigger = image.closest('[data-state], [aria-describedby], button, [role="button"]') ?? image.parentElement ?? image;
    const previous = new Set(tooltipNames());
    image.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    image.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
    image.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    try {
      const deadline = Date.now() + 750;
      do {
        const described = trigger.getAttribute('aria-describedby')?.split(/\s+/)
          .map(id => document.getElementById(id)?.textContent.trim().match(stickerText)?.[1]).find(Boolean);
        const label = described ?? tooltipNames().find(candidate => !previous.has(candidate));
        if (label) {
          if (stillSelected()) {
            names.push(label);
            if (asset) stickerNamesByImage.set(asset, label);
          }
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      } while (Date.now() < deadline && stillSelected());
    } finally {
      image.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }));
      image.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      trigger.dispatchEvent(new MouseEvent('mouseleave'));
    }
  }
  return stillSelected() ? { ...drop, stickers: names } : drop;
}

function readStrideResult(includeControls = false, caseName = '') {
  const visible = element => element.checkVisibility({ visibilityProperty: true });
  const text = element => element.innerText.trim().replace(/\s+/g, ' ');
  const buttons = [...document.querySelectorAll('button, [role="button"]')].filter(visible);
  const sell = /^Sell(?: all)?\s+(\d+(?:[, ]\d{3})*)$/i;
  const repeat = /^Open\s+(?:another|(\d+)\s+more)\D+(\d+(?:[, ]\d{3})*)$/i;
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
  const count = Number(repeatMatch[1] ?? 1);
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
  const rarityPattern = /\b(Consumer Grade|Industrial Grade|Mil-Spec Grade|Restricted|Classified|Covert|Contraband|Extraordinary|High Grade|Remarkable|Exotic)\b/i;
  const inspect = () => {
    const title = modal?.querySelector('h1,h2,h3,[role="heading"]')?.innerText.trim();
    const itemId = modal?.innerText.match(/Item ID\s+(\d+)/i)?.[1];
    const rarity = modal?.innerText.match(rarityPattern)?.[1] ?? '';
    const details = modal?.innerText ?? '';
    const float = details.match(/\bFloat\s+([01]\.\d+|[01])\b/i)?.[1];
    const seed = details.match(/\bPattern Seed\s+(\d+)\b/i)?.[1];
    const finish = details.match(/\bFinish Catalog\s*:?\s*(\d+)\b/i)?.[1];
    const sellControls = [...(modal?.querySelectorAll('button, [role="button"]') ?? [])]
      .filter(control => visible(control) && /^Sell\s+\d+(?:[, ]\d{3})*$/i.test(text(control)));
    const sellControl = sellControls.length === 1 ? sellControls[0] : null;
    const sellValue = sellControl ? text(sellControl).match(sell)[1] : undefined;
    const souvenir = /^Souvenir\s/i.test(title ?? '') || /\bSouvenir\s*:?\s+Yes\b/i.test(details);
    const stickers = modal && souvenir ? readSouvenirStickers(modal) : [];
    return title && itemId ? {
      name: title, itemId, rarity, float, seed, finish, souvenir, stickers,
      quickSell: sellValue === undefined ? null : Number(sellValue.replace(/[, ]/g, ''))
    } : null;
  };
  const imageControls = [...(modal?.querySelectorAll('button, [role="button"]') ?? [])]
    .filter(control => visible(control) && control.querySelector('img'));
  const priceLabel = /^\d+(?:[, ]\d{3})*$/;
  const strips = [...new Set(imageControls.filter(control => priceLabel.test(text(control)))
    .map(control => control.parentElement))].map(parent => imageControls.filter(control =>
    control.parentElement === parent && (!text(control) || priceLabel.test(text(control)))));
  const matchingStrips = strips.filter(strip => strip.length === count);
  const thumbnails = matchingStrips.length === 1 ? matchingStrips[0] : [];
  const drops = [...(modal?.querySelectorAll('button img[alt], [role="button"] img[alt]') ?? [])]
    .filter(image => visible(image) && image.alt.trim())
    .map(image => image.alt.trim());
  if (!drops.length && count === 1) {
    const title = modal?.querySelector('h1,h2,h3,[role="heading"]')?.innerText.trim();
    if (title) drops.push(title);
  }
  return { data: { ...data, itemId: id[1] }, button, drops, thumbnails, inspect, modal };
}

function prepareCase(selectBatch, expected, diagnose = false) {
  const { box, url } = expected ?? {};
  if (!box || url !== location.origin + location.pathname) {
    return diagnose ? { failure: 'autoCaseRoute' } : null;
  }
  const normalize = value => (value ?? '').replace(/[\u200B-\u200F\u2060\uFEFF]/g, '').trim().replace(/\s+/g, ' ');
  const groupSelector = '[role="radiogroup"][aria-label="How many to open"]';
  const groupButtons = [...document.querySelectorAll(groupSelector)]
    .map(group => group.nextElementSibling)
    .filter(button => button?.matches('button, [role="button"]'));
  const buttons = groupButtons.length ? groupButtons
    : [...document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')]
      .filter(button => button.checkVisibility());
  const labels = button => {
    const copy = button.cloneNode(true);
    for (const icon of copy.querySelectorAll('svg, img, [hidden], [aria-hidden="true"]')) icon.remove();
    return [copy.textContent, button.innerText, button.textContent, button.getAttribute('aria-label'), button.value].map(normalize);
  };
  const price = /^OPEN\s*(?:[^\p{L}\d]*|[^\p{L}\d]*coins?\s*)(\d+(?:[, .]\d{3})*)(?:\s*coins?)?$/iu;
  const pricedButtons = buttons.flatMap(button => {
    const amount = button.querySelector('span.tabular-nums > img[src="/images/coin-engraved.svg"]')?.parentElement;
    if (amount && (groupButtons.includes(button) ||
        normalize(amount.parentElement.firstChild?.textContent).toLowerCase() === 'open')) {
      const value = normalize(amount.textContent);
      if (/^\d+(?:[, .]\d{3})*$/.test(value)) {
        return [{ button, cost: Number(value.replace(/[, .]/g, '')) }];
      }
    }
    const match = labels(button).map(label => label.match(price)).find(Boolean);
    return match ? [{ button, cost: Number(match[1].replace(/[, .]/g, '')) }] : [];
  });
  const { button: open, cost } = pricedButtons.length === 1 ? pricedButtons[0] : {};
  const failure = !open ? 'autoOpenControl'
    : open.matches(':disabled, [aria-disabled="true"]') ? 'autoOpenDisabled' : null;
  if (failure) {
    const openLabels = failure === 'autoOpenControl'
      ? [...new Set(buttons.flatMap(labels).filter(label => /^open/i.test(label)))].slice(0, 4)
      : [];
    const detail = failure === 'autoOpenControl'
      ? `Groups: ${groupButtons.length}. Price matches: ${pricedButtons.length}. ${openLabels.map(label => label.slice(0, 80)).join(' / ')}`
      : '';
    const waitingForControls = failure === 'autoOpenControl' && document.hidden &&
      groupButtons.length === 0 && openLabels.length === 0;
    return diagnose ? { failure: waitingForControls ? 'autoBackgroundLoading' : failure, detail } : null;
  }
  const unitPrice = expected.unitPrice;
  if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0) return null;
  const count = expected.count;
  const batchPrice = unitPrice * count;
  if (selectBatch && cost !== batchPrice) {
    const quantityPattern = /^(?:[×✕✖x]\s*)?([1235])$/i;
    const group = open.previousElementSibling;
    if (group?.matches(groupSelector)) {
      const single = [...group.querySelectorAll('button, [role="radio"]')]
        .find(control => !control.matches(':disabled, [aria-disabled="true"]') &&
          labels(control).some(label => label.match(quantityPattern)?.[1] === String(count)));
      if (single) {
        single.click();
        return null;
      }
    }
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
        quantities.get(String(count)).click();
        break;
      }
    }
  }
  if (cost !== batchPrice || !Number.isSafeInteger(cost) || cost <= 0) {
    return diagnose ? { failure: 'autoPriceMismatch' } : null;
  }
  return { box, url, count, cost, button: open };
}

async function runCaseOpening(command, quantity = 0, expected = null, readStickerTooltips = false) {
  const key = '__strideInventoryOpening';
  if (command === 'status') return globalThis[key]?.progress ?? null;
  if (command === 'sellVisibleDrop') {
    const session = globalThis[key];
    if (!session || session.progress.state === 'running' || location.href !== session.url) return false;
    const recorded = session.progress.drops.find(drop => drop.itemId === expected?.itemId);
    if (!recorded || recorded.quickSell == null || recorded.quickSell !== expected.quickSell) return false;
    if (session.progress.soldIds?.includes(recorded.itemId)) return 'sold';
    if (session.requestedSales?.has(recorded.itemId)) return 'pending';
    const result = readStrideResult(true, recorded.name);
    let current = result?.inspect();
    if (result && current?.itemId !== recorded.itemId) {
      for (const thumbnail of result.thumbnails) {
        if (!thumbnail.isConnected || location.href !== session.url) break;
        thumbnail.click();
        await new Promise(resolve => setTimeout(resolve, 100));
        current = result.inspect();
        if (current?.itemId === recorded.itemId) break;
      }
    }
    if (location.href !== session.url || session.progress.state === 'running' ||
        current?.itemId !== recorded.itemId || current.quickSell !== recorded.quickSell) return false;
    const sellButton = [...result.modal.querySelectorAll('button')].find(button =>
      button.checkVisibility({ visibilityProperty: true }) && !button.disabled &&
      /^Sell\s+\d+(?:[, ]\d{3})*$/i.test(button.innerText.trim()));
    if (!sellButton) return false;
    if (session.requestedSales?.has(recorded.itemId)) return 'pending';
    session.requestedSales ??= new Set();
    session.requestedSales.add(recorded.itemId);
    sellButton.click();
    // STRIDE can replace the label on the same button with an inline confirmation.
    const confirmationDeadline = Date.now() + 1500;
    while (Date.now() < confirmationDeadline && sellButton.isConnected) {
      if (location.href !== session.url || globalThis[key] !== session ||
          result.inspect()?.itemId !== recorded.itemId) break;
      if (/^Are you sure\?$/i.test(sellButton.innerText.trim()) &&
          !sellButton.disabled && sellButton.getAttribute('aria-disabled') !== 'true' &&
          sellButton.checkVisibility({ visibilityProperty: true })) {
        sellButton.click();
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const resultDeadline = Date.now() + 6000;
    while (Date.now() < resultDeadline && location.href === session.url && globalThis[key] === session) {
      const updated = readStrideResult(true, recorded.name);
      // A sale switches the selected item and reduces the value of the remaining batch.
      const remainingValue = result.data.value - recorded.quickSell;
      const selected = result.inspect();
      const oneLeft = remainingValue > 0 && selected?.itemId && selected.itemId !== recorded.itemId &&
        selected.quickSell === remainingValue && ![...result.modal.querySelectorAll('button')]
          .some(button => /^Sell all\s/i.test(button.innerText.trim()) &&
            button.checkVisibility({ visibilityProperty: true }));
      const batchEmpty = remainingValue === 0 && !result.modal.isConnected &&
        /^Selling(?:…|\.\.\.)?$/i.test(sellButton.innerText.trim());
      if (batchEmpty || oneLeft || (updated && updated.data.itemId !== recorded.itemId &&
          updated.data.value === remainingValue)) {
        (session.progress.soldIds ??= []).push(recorded.itemId);
        return 'sold';
      }
      // A rejected sale restores the original button and leaves the item selected.
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (sellButton.isConnected && /^Sell\s+\d/i.test(sellButton.innerText.trim()) &&
        result.inspect()?.itemId === recorded.itemId) session.requestedSales.delete(recorded.itemId);
    return 'pending';
  }
  if (command === 'stop') {
    if (globalThis[key]) globalThis[key].stop = true;
    return globalThis[key]?.progress ?? null;
  }
  if (command === 'caseDetails') {
    const id = location.pathname.match(/^\/cases\/(\d+)\/?$/)?.[1];
    if (location.origin !== 'https://stridecsgo.net' || !id || expected?.url !== location.origin + location.pathname) {
      throw new Error('The case address does not match the selected case.');
    }
    const response = await fetch('https://api.stridecsgo.net/v2/cases/' + id, {
      credentials: 'include', redirect: 'error', headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('Case details returned HTTP ' + response.status + '.');
    const data = await response.json();
    if (String(data.id) !== id || data.openable !== true || !Array.isArray(data.openCounts) ||
        !Number.isSafeInteger(data.price) || data.price <= 0) {
      throw new Error('The API did not confirm a price for opening one case.');
    }
    const count = [5, 3, 2, 1].find(size => data.openCounts.includes(size) && quantity % size === 0);
    if (!count) throw new Error('No supported batch size divides the requested total.');
    return { ...expected, count, unitPrice: data.price };
  }

  const read = () => readStrideResult(true, expected?.initial ? expected.box : '');
  if (command === 'diagnose') {
    const diagnosis = prepareCase(false, expected, true);
    return diagnosis?.failure ? diagnosis : null;
  }
  if (command === 'prepare') {
    if (expected.skipAnimation) {
      const label = [...document.querySelectorAll('label')].find(element => /quick open.*skip animation/i.test(element.textContent));
      const toggle = label?.control ?? label?.querySelector('input[type="checkbox"], [role="switch"], button[aria-pressed]');
      if (toggle && (toggle.checked === false || toggle.getAttribute('aria-checked') === 'false' ||
          toggle.getAttribute('aria-pressed') === 'false')) toggle.click();
    }
    prepareCase(true, expected);
    return null;
  }
  const initial = expected?.initial || command === 'previewInitial' ? prepareCase(false, expected) : null;
  const first = initial
    ? { data: { box: initial.box, url: initial.url, count: initial.count, cost: initial.cost, initial: true, unitPrice: expected.unitPrice }, button: initial.button }
    : read();
  if (command === 'previewInitial') return initial ? first.data : null;
  if (command === 'preview') return first?.data ?? null;
  if (globalThis[key]?.progress.state === 'running' || !first ||
      JSON.stringify(first.data) !== JSON.stringify(expected) ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000 ||
      quantity % first.data.count !== 0) return null;

  const session = { url: location.href, stop: false, progress: { done: 0, total: quantity, state: 'running', drops: [] } };
  globalThis[key] = session;
  const originalUrl = location.href;
  const store = (globalThis.browser ?? globalThis.chrome).storage.local;

  async function run() {
    const stickerNamesByImage = new Map();
    let current = first;
    try {
      while (session.progress.done < quantity && !session.stop) {
        const readyDeadline = Date.now() + 10000;
        let ready;
        while (!session.stop) {
          if (location.href !== originalUrl) throw new Error('failed');
          if (current.data.initial) {
            const control = prepareCase(false, first.data);
            ready = control && { data: { box: control.box, url: control.url, count: control.count, cost: control.cost, initial: true }, button: control.button };
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
        const items = new Map();
        const firstDrop = next.inspect();
        if (firstDrop) {
          items.set(firstDrop.itemId, readStickerTooltips ? await collectSouvenirStickers(next, firstDrop, stickerNamesByImage) : firstDrop);
        }
        if (next.thumbnails.length === count) {
          for (const thumbnail of next.thumbnails) {
            if (location.href !== originalUrl || !thumbnail.isConnected) break;
            thumbnail.click();
            await new Promise(resolve => setTimeout(resolve, 80));
            const drop = next.inspect();
            if (drop && !items.has(drop.itemId)) {
              items.set(drop.itemId, readStickerTooltips ? await collectSouvenirStickers(next, drop, stickerNamesByImage) : drop);
            }
          }
        }
        const dropItems = [...items.values()];
        const drops = dropItems.length === count ? dropItems.map(drop => drop.name) : next.drops;
        const record = { box, count, cost, value: next.data.value, drops, dropItems, createdAt: Date.now() };
        await store.set({ ['opening:' + next.data.itemId]: record });
        session.progress.done += count;
        session.progress.drops.push(...dropItems);
        current = read() ?? next;
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
