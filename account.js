const cfg = window.BACKEND_CONFIG || {};
const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
let currentProfile = null;

async function callOzon(action, accountId) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }
  const response = await fetch(`${cfg.supabaseUrl}/functions/v1/ozon-connect`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: cfg.supabaseAnonKey }, body: JSON.stringify({ action, accountId }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Не удалось выполнить действие.');
  return result;
}

function renderAccounts(accounts) {
  const list = document.querySelector('#connection-list');
  if (!accounts?.length) return;
  list.innerHTML = accounts.map(a => `<article class="connected-store"><div class="market-logo ozon">O₃</div><div><b>${escapeHtml(a.account_name || 'Магазин Ozon')}</b><p>ID продавца: ${escapeHtml(a.external_account_id || '—')}</p><small>${a.last_sync_at ? `Обновлено ${new Date(a.last_sync_at).toLocaleString('ru-RU')}` : 'Ожидает синхронизации'}</small></div><div class="store-actions"><span class="connection-status ${a.status}">${a.status === 'connected' ? 'Подключён' : a.status === 'error' ? 'Ошибка' : 'Отключён'}</span>${a.status === 'connected' ? `<button data-sync="${a.id}">Обновить</button><button class="danger" data-disconnect="${a.id}">Отключить</button>` : '<a href="connect-ozon.html">Подключить заново</a>'}</div></article>`).join('');
  list.querySelectorAll('[data-sync]').forEach(button => button.addEventListener('click', async () => { button.disabled = true; button.textContent = 'Обновляем…'; try { await callOzon('sync', button.dataset.sync); location.reload(); } catch (error) { alert(error.message); button.disabled = false; button.textContent = 'Обновить'; } }));
  list.querySelectorAll('[data-disconnect]').forEach(button => button.addEventListener('click', async () => { if (!confirm('Отключить магазин? Зашифрованный ключ будет удалён. Товары не изменятся.')) return; button.disabled = true; try { await callOzon('disconnect', button.dataset.disconnect); location.reload(); } catch (error) { alert(error.message); button.disabled = false; } }));
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
