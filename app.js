const form = document.querySelector('#profit-form');
const currencySelect = document.querySelector('#currency');
const taxProfile = document.querySelector('#tax-profile');
const localeByCurrency = { RUB: 'ru-RU', BYN: 'be-BY', KZT: 'kk-KZ', AMD: 'hy-AM', KGS: 'ky-KG', UZS: 'uz-UZ' };
const supportedCurrencies = ['RUB', 'BYN', 'KZT', 'AMD', 'KGS', 'UZS'];
let currency = supportedCurrencies.includes(localStorage.getItem('cm-currency')) ? localStorage.getItem('cm-currency') : 'RUB';
currencySelect.value = currency;

const value = (name) => Math.max(0, Number(new FormData(form).get(name)) || 0);
const money = (amount) => new Intl.NumberFormat(localeByCurrency[currency] || 'ru-RU', { style: 'currency', currency, maximumFractionDigits: currency === 'BYN' ? 2 : 0 }).format(amount);
const percent = (amount) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(amount);

function applyTaxProfile() {
  const field = form.elements.namedItem('tax');
  const notes = {
    ru_usn_income: 'УСН «Доходы»: налог считается с полной суммы продажи до удержания комиссии маркетплейса.',
    ru_usn_profit: 'УСН «Доходы − расходы»: здесь показана приближённая оценка с положительной прибыли до налога. Итог зависит от подтверждённых расходов.',
    none: 'Автоматический налог отключён. Добавьте налог вручную в «Прочие расходы», если это необходимо.',
    custom: 'Для другой страны укажите собственную ставку. Сейчас база — выручка; расширенный профиль настраивается в личном кабинете.'
  };
  if (taxProfile.value === 'ru_usn_income') field.value = 6;
  if (taxProfile.value === 'ru_usn_profit') field.value = 15;
  if (taxProfile.value === 'none') field.value = 0;
  document.querySelector('#tax-note').textContent = notes[taxProfile.value];
}

function calculate() {
  const price = value('price'), cost = value('cost'), commissionRate = value('commission') / 100;
  const logistics = value('logistics'), handling = value('handling'), ads = value('ads');
  const taxRate = value('tax') / 100, buyoutRate = Math.min(1, Math.max(.01, value('buyout') / 100));
  const returnExpense = ((1 - buyoutRate) / buyoutRate) * value('returnLogistics');
  const other = value('other'), commission = price * commissionRate;
  const beforeTax = price - commission - cost - logistics - handling - ads - returnExpense - other;
  const tax = taxProfile.value === 'ru_usn_profit' ? Math.max(0, beforeTax) * taxRate : price * taxRate;
  const expenses = commission + cost + logistics + handling + ads + returnExpense + other + tax;
  const profit = price - expenses, margin = price ? profit / price * 100 : 0;
  const effectiveRate = commissionRate + (taxProfile.value === 'ru_usn_profit' ? 0 : taxRate);
  const fixed = cost + logistics + handling + ads + returnExpense + other;
  const breakEven = effectiveRate < 1 ? fixed / (1 - effectiveRate) : Infinity;

  document.querySelector('#profit').textContent = money(profit);
  document.querySelector('#margin').textContent = `${percent(margin)}%`;
  document.querySelector('#expenses').textContent = money(expenses);
  document.querySelector('#commission-value').textContent = money(commission);
  document.querySelector('#tax-value').textContent = money(tax);
  document.querySelector('#break-even').textContent = Number.isFinite(breakEven) ? money(breakEven) : 'Недостижима';
  document.querySelector('#profit-100').textContent = money(profit * 100);
  ['#profit', '#margin', '#expenses', '#commission-value', '#tax-value', '#break-even', '#profit-100'].forEach(selector => {
    const element = document.querySelector(selector);
    element.classList.remove('value-pop');
    requestAnimationFrame(() => element.classList.add('value-pop'));
  });
  document.querySelector('#verdict').textContent = profit < 0 ? 'Товар продаётся в убыток' : margin < 10 ? 'Запас маржи слишком мал' : 'Экономика товара положительная';
  document.querySelector('#verdict').className = `profit-state ${profit < 0 ? 'negative' : 'positive'}`;
  localStorage.setItem('chistaya-marzha-values', JSON.stringify(Object.fromEntries(new FormData(form).entries())));
}

function setCurrency() {
  currency = currencySelect.value;
  localStorage.setItem('cm-currency', currency);
  document.querySelectorAll('[data-currency-label]').forEach(el => { el.textContent = currency; });
  const demo = { RUB: 284930, BYN: 9650, KZT: 1480000, AMD: 1240000, KGS: 284000, UZS: 39200000 }[currency];
  document.querySelector('#hero-money').textContent = money(demo);
  calculate();
}

form.addEventListener('input', calculate);
taxProfile.addEventListener('change', () => { applyTaxProfile(); calculate(); });
currencySelect.addEventListener('change', setCurrency);
document.querySelector('#reset-button').addEventListener('click', () => { form.reset(); localStorage.removeItem('chistaya-marzha-values'); applyTaxProfile(); calculate(); });
document.querySelector('#copy-button').addEventListener('click', async (event) => {
  const summary = `Чистая прибыль: ${document.querySelector('#profit').textContent}\nМаржа: ${document.querySelector('#margin').textContent}\nРасходы: ${document.querySelector('#expenses').textContent}`;
  try { await navigator.clipboard.writeText(summary); event.currentTarget.textContent = 'Расчёт скопирован'; setTimeout(() => { event.currentTarget.textContent = 'Скопировать расчёт'; }, 1500); } catch { event.currentTarget.textContent = 'Не удалось скопировать'; }
});

try {
  const saved = JSON.parse(localStorage.getItem('chistaya-marzha-values'));
  if (saved) Object.entries(saved).forEach(([name, savedValue]) => { const field = form.elements.namedItem(name); if (field) field.value = savedValue; });
} catch { localStorage.removeItem('chistaya-marzha-values'); }
setCurrency();

const revealTargets = document.querySelectorAll('.logos, .calc-panel, .result-panel, .section-head, .feature-grid article, .rate-grid article, .cta');
revealTargets.forEach((element, index) => {
  element.classList.add('reveal');
  element.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
});
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
  }), { threshold: .12 });
  revealTargets.forEach(element => observer.observe(element));
} else revealTargets.forEach(element => element.classList.add('is-visible'));
