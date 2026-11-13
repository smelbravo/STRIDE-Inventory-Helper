(() => {
  const badgeClass = 'stride-helper-skin-details';
  const cardSelector = 'a[href], button, [role="button"], [data-item-id]';
  let pending = false;

  function updateCards() {
    pending = false;
    if (!/^\/(market|skins)(?:\/|$)/.test(location.pathname)) {
      document.querySelectorAll('.' + badgeClass).forEach(badge => badge.remove());
      return;
    }
    for (const card of document.querySelectorAll(cardSelector)) {
      if (!card.querySelector('img') || card.querySelector(cardSelector)) continue;
      let badge = card.querySelector('.' + badgeClass);
      const name = [...card.querySelectorAll('img[alt]')].map(img => img.alt).join(' ') +
        ' ' + [...card.childNodes].filter(node => node !== badge).map(node => node.textContent).join(' ');
      const metadata = key => card.getAttribute(key) ?? card.querySelector('[' + key + ']')?.getAttribute(key);
      const float = metadata('data-float') ?? name.match(/\bfloat\s*:?\s*([01]\.\d+)\b/i)?.[1];
      const seed = metadata('data-paint-seed') ?? metadata('data-pattern-seed') ??
        name.match(/\b(?:pattern|paint) seed\s*:?\s*(\d+)\b/i)?.[1];
      const finish = metadata('data-paint-index') ?? metadata('data-finish-catalog');
      const tags = [];
      if (float && /^\d(?:\.\d+)?$/.test(float) && Number(float) <= 1) tags.push('Float ' + float);
      if (seed && /^\d{1,3}$/.test(seed)) {
        tags.push('Seed ' + seed);
        const tier = globalThis.strideCaseHardenedTier(name, Number(seed));
        if (tier) tags.push(tier.tier ? (tier.gemKind === 'gold' ? 'Gold Gem' : 'Blue Gem') + ' · T' + tier.tier : tier.label);
      }
      const phase = globalThis.strideDopplerPhase(name, finish);
      if (phase) tags.push(phase);
      if (!tags.length) {
        badge?.remove();
        continue;
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = badgeClass;
        card.append(badge);
      }
      const label = tags.join('  •  ');
      if (badge.textContent !== label) badge.textContent = label;
    }
  }

  new MutationObserver(() => {
    if (!pending) {
      pending = true;
      setTimeout(updateCards, 150);
    }
  }).observe(document.body, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['alt', 'href', 'data-float', 'data-paint-seed', 'data-pattern-seed', 'data-paint-index', 'data-finish-catalog']
  });
  updateCards();
})();
