const cfg = window.BACKEND_CONFIG || {};
const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
let currentProfile = null;

function enhanceAccountSelect(select) {
  const shell = document.createElement('div'); shell.className = 'account-select'; select.parentNode.insertBefore(shell, select); shell.appendChild(select);
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'account-select__trigger'; trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
  const value = document.createElement('span'); const arrow = document.createElement('i'); arrow.setAttribute('aria-hidden', 'true'); trigger.append(value, arrow);
  const menu = document.createElement('div'); menu.className = 'account-select__menu'; menu.setAttribute('role', 'listbox'); menu.hidden = true;
  const options = [...select.options].map(option => { const button = document.createElement('button'); button.type = 'button'; button.className = 'account-select__option'; button.setAttribute('role', 'option'); button.dataset.value = option.value; button.innerHTML = `<span>${option.textContent}</span><i>✓</i>`; menu.appendChild(button); return button; });
  shell.append(trigger, menu);
  const sync = () => { value.textContent = select.selectedOptions[0]?.textContent || ''; options.forEach(option => { const active = option.dataset.value === select.value; option.classList.toggle('is-selected', active); option.setAttribute('aria-selected', String(active)); }); };
  const close = () => { shell.classList.remove('is-open'); trigger.setAttribute('aria-expanded', 'false'); menu.hidden = true; };
  const open = () => { document.querySelectorAll('.account-select.is-open').forEach(item => item !== shell && item.querySelector('.account-select__trigger')?.click()); document.body.appendChild(menu); const rect = trigger.getBoundingClientRect(); Object.assign(menu.style, { position: 'fixed', top: `${rect.bottom + 7}px`, left: `${rect.left}px`, width: `${Math.max(rect.width, 190)}px` }); shell.classList.add('is-open'); trigger.setAttribute('aria-expanded', 'true'); menu.hidden = false; };
  trigger.addEventListener('click', () => shell.classList.contains('is-open') ? close() : open());
  menu.addEventListener('click', event => { const option = event.target.closest('.account-select__option'); if (!option) return; select.value = option.dataset.value; select.dispatchEvent(new Event('change', { bubbles: true })); sync(); close(); trigger.focus(); });
  trigger.addEventListener('keydown', event => { if (event.key === 'Escape') return close(); if (['Enter', ' ', 'ArrowDown'].includes(event.key)) { event.preventDefault(); open(); options.find(option => option.classList.contains('is-selected'))?.focus(); } });
  select.addEventListener('change', sync); document.addEventListener('click', event => { if (!shell.contains(event.target) && !menu.contains(event.target)) close(); }); select._syncCustom = sync; sync();
}

document.querySelectorAll('select').forEach(enhanceAccountSelect);

const marketplaceMeta = {
  ozon: { name: 'Ozon', href: 'connect-ozon.html', logo: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/%D0%9E%D0%97%D0%9E%D0%9D_%D0%9B%D0%9E%D0%93%D0%9E.png' },
  wildberries: { name: 'Wildberries', href: 'connect-wildberries.html', logo: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Wildberries_2023_Pink.svg' },
  yandex_market: { name: 'Яндекс Маркет', href: 'connect-yandex-market.html', logo: 'https://yastatic.net/q/logoaas/v2/%D0%AF%D0%BD%D0%B4%D0%B5%D0%BA%D1%81%20%D0%9C%D0%B0%D1%80%D0%BA%D0%B5%D1%82.svg' }
};

async function callMarketplace(provider, action, accountId) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }
  const endpoint = provider === 'ozon' ? 'ozon-connect' : 'marketplace-connect';
  const response = await fetch(`${cfg.supabaseUrl}/functions/v1/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: cfg.supabaseAnonKey }, body: JSON.stringify({ action, accountId, provider }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Не удалось выполнить действие.');
  return result;
}

const marketplaceOptions = () => `<div class="marketplace-additions">${Object.entries(marketplaceMeta).map(([provider, meta]) => `<article class="marketplace-option available"><div class="marketplace-wordmark"><img src="${meta.logo}" alt="${meta.name}"></div><div><b>Добавить ${meta.name}</b><p>Подключить ещё один кабинет продавца.</p></div><a href="${meta.href}">Добавить →</a></article>`).join('')}</div>`;

function renderAccounts(accounts) {
  const list = document.querySelector('#connection-list');
  if (!accounts?.length) return;
  list.classList.remove('marketplace-options');
  list.innerHTML = `<div class="connected-accounts">${accounts.map(a => { const meta = marketplaceMeta[a.provider] || marketplaceMeta.ozon; return `<article class="connected-store"><div class="marketplace-wordmark compact"><img src="${meta.logo}" alt="${meta.name}"></div><div><b>${escapeHtml(a.account_name || `Магазин ${meta.name}`)}</b><p>${meta.name} · ID: ${escapeHtml(a.external_account_id || '—')}</p><small>${a.last_sync_at ? `Обновлено ${new Date(a.last_sync_at).toLocaleString('ru-RU')}` : 'Ожидает синхронизации'}</small></div><div class="store-actions"><span class="connection-status ${a.status}">${a.status === 'connected' ? 'Подключён' : a.status === 'error' ? 'Ошибка' : 'Отключён'}</span>${a.status === 'connected' ? `<button data-provider="${a.provider}" data-sync="${a.id}">Проверить</button><button class="danger" data-provider="${a.provider}" data-disconnect="${a.id}">Отключить</button>` : `<a href="${meta.href}">Подключить заново</a>`}</div></article>`; }).join('')}</div>${marketplaceOptions()}`;
  list.querySelectorAll('[data-sync]').forEach(button => button.addEventListener('click', async () => { button.disabled = true; button.textContent = 'Проверяем…'; try { await callMarketplace(button.dataset.provider, 'sync', button.dataset.sync); location.reload(); } catch (error) { alert(error.message); button.disabled = false; button.textContent = 'Проверить'; } }));
  list.querySelectorAll('[data-disconnect]').forEach(button => button.addEventListener('click', async () => { if (!confirm('Отключить магазин? Зашифрованный ключ будет удалён. Товары не изменятся.')) return; button.disabled = true; try { await callMarketplace(button.dataset.provider, 'disconnect', button.dataset.disconnect); location.reload(); } catch (error) { alert(error.message); button.disabled = false; } }));
}

const taxCopy = {
  ru_usn_income: ['Россия · УСН «Доходы»', 'Налоговая база — полная сумма продажи до вычета комиссии маркетплейса.'],
  ru_usn_profit: ['Россия · УСН «Доходы − расходы»', 'Комиссии и подтверждённые расходы уменьшают налоговую базу.'],
  vat: ['НДС / VAT', 'Нужно указать, включён ли налог в цену и допускается ли входящий вычет.'],
  turnover: ['Налог с оборота', 'Налог рассчитывается с выручки до удержаний площадки.'],
  profit: ['Налог с прибыли', 'Налог рассчитывается с положительной прибыли после допустимых расходов.'],
  custom: ['Собственный режим', 'Расширенные правила будут применяться по выбранной стране.'],
  none: ['Налог не рассчитывается', 'В отчёте показываются только расходы маркетплейса и магазина.']
};

function updateTaxExplainer() {
  const mode = document.querySelector('#tax-mode').value;
  const [title, text] = taxCopy[mode] || taxCopy.custom;
  document.querySelector('#tax-explainer').innerHTML = `<b>${title}</b><span>${text}</span>`;
  document.querySelector('#tax-profile-state').textContent = mode === 'none' ? 'Отключён' : title;
}

async function load() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) { location.href = 'auth.html'; return; }
  document.querySelector('#setup-banner').hidden = true;
  document.querySelector('#user-email').textContent = user.email;
  document.querySelector('#user-letter').textContent = (user.user_metadata?.display_name || user.email)[0].toUpperCase();
  const [{ data: profile }, { data: accounts }] = await Promise.all([db.from('profiles').select('*').single(), db.from('marketplace_accounts').select('*').order('created_at')]);
  currentProfile = profile;
  if (profile) {
    document.querySelector('#user-name').textContent = profile.display_name || 'Пользователь';
    document.querySelector('#plan-name').textContent = { trial: 'Пробный', starter: 'Старт', pro: 'Про', expired: 'Истёк' }[profile.plan] || profile.plan;
    const days = Math.max(0, Math.ceil((new Date(profile.trial_ends_at) - new Date()) / 86400000));
    document.querySelector('#trial-text').textContent = profile.plan === 'trial' ? `Осталось ${days} дней` : 'Подписка активна';
    document.querySelector('#sidebar-trial').textContent = profile.plan === 'trial' ? `${days} дней` : 'Активен';
    document.querySelector('#workspace-currency').value = profile.base_currency || 'RUB';
    document.querySelector('#country-code').value = profile.country_code || 'RU';
    document.querySelector('#tax-mode').value = profile.tax_mode || 'ru_usn_income';
    document.querySelector('#tax-rate').value = profile.tax_rate ?? 6;
    document.querySelectorAll('select').forEach(select => select._syncCustom?.());
    updateTaxExplainer();
  }
  if (accounts?.length) {
    document.querySelector('#stores-count').textContent = accounts.filter(a => a.status === 'connected').length;
    renderAccounts(accounts);
    const sync = accounts.map(a => a.last_sync_at).filter(Boolean).sort().pop();
    if (sync) document.querySelector('#last-sync').textContent = new Date(sync).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}

document.querySelector('#workspace-currency').addEventListener('change', () => { document.querySelector('#settings-status').textContent = 'Не сохранено'; document.querySelector('#settings-status').classList.remove('saved'); });
document.querySelector('#tax-mode').addEventListener('change', updateTaxExplainer);
document.querySelector('#finance-settings').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button'); button.disabled = true; button.textContent = 'Сохраняем…';
  const values = { base_currency: document.querySelector('#workspace-currency').value, country_code: document.querySelector('#country-code').value, tax_mode: document.querySelector('#tax-mode').value, tax_rate: Number(document.querySelector('#tax-rate').value), updated_at: new Date().toISOString() };
  const { error } = await db.from('profiles').update(values).eq('id', currentProfile.id);
  button.disabled = false; button.textContent = 'Сохранить настройки';
  const status = document.querySelector('#settings-status'); status.textContent = error ? 'Ошибка сохранения' : 'Сохранено'; status.classList.toggle('saved', !error);
  if (!error) localStorage.setItem('cm-currency', values.base_currency);
});
document.querySelector('#sign-out').addEventListener('click', async () => { await db.auth.signOut(); location.href = 'auth.html'; });
document.querySelectorAll('[data-plan]').forEach(button => button.addEventListener('click', () => alert('Оплата ещё не подключена. Списаний нет.')));
load();
