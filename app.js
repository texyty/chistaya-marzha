const form = document.querySelector('#profit-form');
const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

function value(name) {
  return Math.max(0, Number(new FormData(form).get(name)) || 0);
}

function calculate() {
  const price = value('price');
  const cost = value('cost');
  const commissionRate = value('commission') / 100;
  const logistics = value('logistics');
  const handling = value('handling');
  const ads = value('ads');
  const taxRate = value('tax') / 100;
  const buyoutRate = Math.min(1, Math.max(.01, value('buyout') / 100));
  const returnLogistics = value('returnLogistics');
  const other = value('other');

  const expectedReturnsPerSale = (1 - buyoutRate) / buyoutRate;
  const returnExpense = expectedReturnsPerSale * returnLogistics;
  const variableRate = commissionRate + taxRate;
  const fixedWithoutAds = cost + logistics + handling + returnExpense + other;
  const expenses = price * variableRate + fixedWithoutAds + ads;
  const profit = price - expenses;
  const margin = price ? profit / price * 100 : 0;
  const breakEven = variableRate < 1 ? (fixedWithoutAds + ads) / (1 - variableRate) : Infinity;
  const maxAds = Math.max(0, price * (1 - variableRate) - fixedWithoutAds);

  document.querySelector('#profit').textContent = money.format(profit);
  document.querySelector('#margin').textContent = `${percent.format(margin)}%`;
  document.querySelector('#expenses').textContent = money.format(expenses);
  document.querySelector('#break-even').textContent = Number.isFinite(breakEven) ? money.format(breakEven) : 'Недостижима';
  document.querySelector('#max-ads').textContent = money.format(maxAds);
  document.querySelector('#profit-100').textContent = money.format(profit * 100);

  const card = document.querySelector('#profit-card');
  card.classList.toggle('negative', profit < 0);
  card.classList.toggle('positive', profit >= 0);
  document.querySelector('#verdict').textContent = profit < 0
    ? 'Товар продаётся в убыток — пересмотрите цену или расходы.'
    : margin < 10
      ? 'Прибыль есть, но запас прочности небольшой.'
      : 'Экономика товара выглядит положительно.';
}

form.addEventListener('input', calculate);
document.querySelector('#reset-button').addEventListener('click', () => {
  form.reset();
  calculate();
});
document.querySelector('#copy-button').addEventListener('click', async (event) => {
  const summary = [
    `Чистая прибыль: ${document.querySelector('#profit').textContent}`,
    `Маржинальность: ${document.querySelector('#margin').textContent}`,
    `Расходы: ${document.querySelector('#expenses').textContent}`,
    `Цена безубыточности: ${document.querySelector('#break-even').textContent}`
  ].join('\n');
  try {
    await navigator.clipboard.writeText(summary);
    event.currentTarget.textContent = 'Скопировано';
    setTimeout(() => { event.currentTarget.textContent = 'Скопировать результат'; }, 1600);
  } catch {
    event.currentTarget.textContent = 'Не удалось скопировать';
  }
});

calculate();
