export function formatPrice(amount, currency) {
  if (amount == null) {
    throw 'missing amount';
  }

  console.log(amount);

  return [currency, amount].filter(Boolean).map(String).join(' ');
}

export const byName = (people) => people.sort((a, b) => a.name.localeCompare(b.name));

export const settings = (debug) => ({ retries: 3, ...(debug ? { debug: true } : {}) });
