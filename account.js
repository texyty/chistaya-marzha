const cfg = window.BACKEND_CONFIG || {};
const ready = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
const db = ready ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

async function callOzon(action, accountId) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }
  const response = await fetch(`${cfg.supabaseUrl}/functions/v1/ozon-connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: cfg.supabaseAnonKey },
    body: JSON.stringify({ action, accountId })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Не удалось выполнить действие.');
  return result;
}

function renderAccounts(accounts) {
  const list = document.querySelector('#connection-list');
  if (!accounts?.length) return;
  list.innerHTML = accounts.map(a => `
    <article class="connected-store">
      <div class="market-logo ozon">O₃</div>
      <div><b>${escapeHtml(a.account_name || 'Магазин Ozon')}</b><p>ID продавца: ${escapeHtml(a.external_account_id || '—')}</p><small>${a.last_sync_at ? `Обновлено ${new Date(a.last_sync_at).toLocaleString('ru-RU')}` : 'Ожидает первой синхронизации'}</small></div>
      <div class="store-actions"><span class="connection-status ${a.status}">${a.status === 'connected' ? 'Подключён' : a.status === 'error' ? 'Ошибка' : 'Отключён'}</span>${a.status === 'connected' ? `<button data-sync="${a.id}">Обновить</button><button class="danger" data-disconnect="${a.id}">Отключить</button>` : '<a href="connect-ozon.html">Подключить заново</a>'}</div>
    </article>`).join('');

  list.querySelectorAll('[data-sync]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true; button.textContent = 'Обновляем…';
    try { await callOzon('sync', button.dataset.sync); location.reload(); }
    catch (error) { alert(error.message); button.disabled = false; button.textContent = 'Обновить'; }
  }));
  list.querySelectorAll('[data-disconnect]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Отключить магазин? Зашифрованный API‑ключ будет удалён. Товары в Ozon не изменятся.')) return;
    button.disabled = true;
    try { await callOzon('disconnect', button.dataset.disconnect); location.reload(); }
    catch (error) { alert(error.message); button.disabled = false; }
  }));
}

async function load() {
  if (!ready) return;
  const { data: { user } } = await db.auth.getUser();
  if (!user) { location.href = 'auth.html'; return; }
  document.querySelector('#setup-banner').hidden = true;
  document.querySelector('#user-email').textContent = user.email;
  document.querySelector('#user-letter').textContent = (user.user_metadata?.display_name || user.email)[0].toUpperCase();
  const [{ data: profile }, { data: accounts }] = await Promise.all([
    db.from('profiles').select('*').single(),
    db.from('marketplace_accounts').select('*').order('created_at')
  ]);
  if (profile) {
    document.querySelector('#user-name').textContent = profile.display_name || 'Пользователь';
    document.querySelector('#plan-name').textContent = { trial: 'Пробный', starter: 'Старт', pro: 'Про', expired: 'Истёк' }[profile.plan] || profile.plan;
    const days = Math.max(0, Math.ceil((new Date(profile.trial_ends_at) - new Date()) / 86400000));
    document.querySelector('#trial-text').textContent = profile.plan === 'trial' ? `Осталось ${days} дней` : 'Подписка активна';
  }
  if (accounts?.length) {
    document.querySelector('#stores-count').textContent = accounts.filter(a => a.status === 'connected').length;
    renderAccounts(accounts);
    const sync = accounts.map(a => a.last_sync_at).filter(Boolean).sort().pop();
    if (sync) document.querySelector('#last-sync').textContent = new Date(sync).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}

document.querySelector('#sign-out').addEventListener('click', async () => { if (db) await db.auth.signOut(); location.href = 'auth.html'; });
document.querySelectorAll('[data-plan]').forEach(button => button.addEventListener('click', () => alert('Оплата будет включена после подключения платёжного провайдера. Сейчас списаний нет.')));
load();
