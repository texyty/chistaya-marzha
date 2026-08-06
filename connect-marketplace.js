const preferencesScript = document.createElement('script'); preferencesScript.src = 'site-preferences.js?v=1'; document.head.appendChild(preferencesScript);
const config = window.BACKEND_CONFIG || {};
const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
const form = document.querySelector('#marketplace-form');
const notice = document.querySelector('#connect-notice');
const tokenInput = document.querySelector('#access-token');
const provider = document.body.dataset.provider;
const marketplaceName = document.body.dataset.marketplace;
function showMessage(text, type = 'info') { notice.hidden = false; notice.className = `connect-notice ${type}`; notice.textContent = text; }
document.querySelector('#show-key').addEventListener('change', event => { tokenInput.type = event.target.checked ? 'text' : 'password'; });
form.addEventListener('submit', async event => {
  event.preventDefault(); const button = document.querySelector('#connect-button'); button.disabled = true; button.textContent = 'Проверяем доступ…'; notice.hidden = true;
  try {
    const { data: { session } } = await client.auth.getSession(); if (!session) { location.href = 'auth.html'; return; }
    const response = await fetch(`${config.supabaseUrl}/functions/v1/marketplace-connect`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: config.supabaseAnonKey }, body: JSON.stringify({ action: 'connect', provider, token: tokenInput.value.trim() }) });
    const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || `${marketplaceName} не подтвердил доступ.`);
    if (result.settings) { await client.from('profiles').update({ ...result.settings, updated_at: new Date().toISOString() }).eq('id', session.user.id); localStorage.setItem('cm-currency', result.settings.base_currency); }
    tokenInput.value = ''; showMessage(`Магазин «${result.accountName || marketplaceName}» подключён. Валюта и налоги настроены автоматически.`, 'success'); setTimeout(() => { location.href = 'account.html#connections'; }, 1400);
  } catch (error) { showMessage(error.message || 'Не удалось подключить магазин.', 'error'); }
  finally { button.disabled = false; button.textContent = 'Проверить и подключить'; }
});
client.auth.getUser().then(({ data: { user } }) => { if (!user) location.href = 'auth.html'; });
