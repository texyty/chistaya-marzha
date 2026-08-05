import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

async function keyFromSecret(secret: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encrypt(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromSecret(secret);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value)));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...encrypted))}`;
}
async function decrypt(value: string, secret: string) {
  const [ivPart, dataPart] = value.split('.');
  const iv = Uint8Array.from(atob(ivPart), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(dataPart), c => c.charCodeAt(0));
  const key = await keyFromSecret(secret);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data));
}

async function inspectAccount(provider: string, token: string) {
  if (provider === 'wildberries') {
    const response = await fetch('https://common-api.wildberries.ru/api/v1/seller-info', { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.detail || data?.title || `Wildberries API: ${response.status}`);
    const id = String(data.sid || data.supplierId || data.supplier_id || data.id || 'wildberries');
    return { id, name: data.tradeMark || data.name || data.supplierName || `Wildberries ${id}` };
  }
  if (provider === 'yandex_market') {
    const response = await fetch('https://api.partner.market.yandex.ru/v2/campaigns', { headers: { 'Api-Key': token, Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.errors?.[0]?.message || data?.message || `Яндекс Маркет API: ${response.status}`);
    const campaigns = data.campaigns || data.result?.campaigns || [];
    if (!campaigns.length) throw new Error('У ключа нет доступных магазинов Яндекс Маркета.');
    const campaign = campaigns[0];
    const id = String(campaign.id || campaign.campaignId);
    return { id, name: campaign.domain || campaign.clientId || campaign.business?.name || `Яндекс Маркет ${id}` };
  }
  throw new Error('Неизвестный маркетплейс.');
}

export default { async fetch(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authorization = request.headers.get('Authorization') || '';
    const auth = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return json({ error: 'Войдите в личный кабинет заново.' }, 401);
    const admin = createClient(url, serviceKey);
    const input = await request.json();
    const provider = String(input.provider || '');
    if (!['wildberries', 'yandex_market'].includes(provider)) return json({ error: 'Неизвестный маркетплейс.' }, 400);

    if (input.action === 'connect') {
      const token = String(input.token || '').trim();
      if (token.length < 20) return json({ error: 'Проверьте ключ доступа.' }, 400);
      const info = await inspectAccount(provider, token);
      const { data: existing } = await admin.from('marketplace_accounts').select('id').eq('user_id', user.id).eq('provider', provider).eq('external_account_id', info.id).maybeSingle();
      let accountId = existing?.id;
      if (accountId) {
        const { error } = await admin.from('marketplace_accounts').update({ account_name: info.name, status: 'connected', last_sync_at: new Date().toISOString() }).eq('id', accountId);
        if (error) throw error;
      } else {
        const { data, error } = await admin.from('marketplace_accounts').insert({ user_id: user.id, provider, external_account_id: info.id, account_name: info.name, status: 'connected', last_sync_at: new Date().toISOString() }).select('id').single();
        if (error) throw error;
        accountId = data.id;
      }
      const { error: credentialError } = await admin.from('marketplace_credentials_secure').upsert({ marketplace_account_id: accountId, encrypted_access_token: await encrypt(token, serviceKey), encrypted_refresh_token: null, updated_at: new Date().toISOString() });
      if (credentialError) throw credentialError;
      await admin.from('sync_runs').insert({ marketplace_account_id: accountId, user_id: user.id, status: 'completed', records_processed: 1, finished_at: new Date().toISOString() });
      return json({ ok: true, accountId, accountName: info.name });
    }
    const { data: account } = await admin.from('marketplace_accounts').select('*').eq('id', input.accountId).eq('user_id', user.id).eq('provider', provider).single();
    if (!account) return json({ error: 'Магазин не найден.' }, 404);
    if (input.action === 'disconnect') {
      await admin.from('marketplace_credentials_secure').delete().eq('marketplace_account_id', account.id);
      await admin.from('marketplace_accounts').update({ status: 'disconnected' }).eq('id', account.id);
      return json({ ok: true });
    }
    if (input.action === 'sync') {
      const { data: credentials } = await admin.from('marketplace_credentials_secure').select('encrypted_access_token').eq('marketplace_account_id', account.id).single();
      if (!credentials) return json({ error: 'Ключ магазина не найден. Подключите его заново.' }, 404);
      await inspectAccount(provider, await decrypt(credentials.encrypted_access_token, serviceKey));
      const now = new Date().toISOString();
      await admin.from('marketplace_accounts').update({ status: 'connected', last_sync_at: now }).eq('id', account.id);
      await admin.from('sync_runs').insert({ marketplace_account_id: account.id, user_id: user.id, status: 'completed', records_processed: 1, finished_at: now });
      return json({ ok: true, syncedAt: now });
    }
    return json({ error: 'Неизвестное действие.' }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Внутренняя ошибка.' }, 500);
  }
} };
