import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
});

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

async function ozon(path: string, clientId: string, apiKey: string, body?: unknown) {
  const response = await fetch(`https://api-seller.ozon.ru${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Client-Id': clientId, 'Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error?.message || `Ozon API: ${response.status}`);
  return data;
}

export default { async fetch(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authorization = request.headers.get('Authorization') || '';
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: 'Войдите в личный кабинет заново.' }, 401);

    const admin = createClient(url, serviceKey);
    const input = await request.json();

    if (input.action === 'connect') {
      const clientId = String(input.clientId || '').trim();
      const apiKey = String(input.apiKey || '').trim();
      if (!/^\d+$/.test(clientId) || apiKey.length < 10) return json({ error: 'Проверьте Client ID и API‑ключ.' }, 400);

      const seller = await ozon('/v1/seller/info', clientId, apiKey, {});
      const sellerId = String(seller.seller_id || seller.result?.seller_id || clientId);
      const accountName = seller.company_name || seller.name || seller.result?.company_name || `Ozon ${sellerId}`;

      const { data: existing } = await admin.from('marketplace_accounts').select('id').eq('user_id', user.id).eq('provider', 'ozon').maybeSingle();
      let accountId = existing?.id;
      if (accountId) {
        const { error } = await admin.from('marketplace_accounts').update({ external_account_id: sellerId, account_name: accountName, status: 'connected', last_sync_at: new Date().toISOString() }).eq('id', accountId);
        if (error) throw error;
      } else {
        const { data, error } = await admin.from('marketplace_accounts').insert({ user_id: user.id, provider: 'ozon', external_account_id: sellerId, account_name: accountName, status: 'connected', last_sync_at: new Date().toISOString() }).select('id').single();
        if (error) throw error;
        accountId = data.id;
      }

      const { error: credentialError } = await admin.from('marketplace_credentials_secure').upsert({
        marketplace_account_id: accountId,
        encrypted_access_token: await encrypt(apiKey, serviceKey),
        encrypted_refresh_token: await encrypt(clientId, serviceKey),
        updated_at: new Date().toISOString()
      });
      if (credentialError) throw credentialError;
      await admin.from('sync_runs').insert({ marketplace_account_id: accountId, user_id: user.id, status: 'completed', records_processed: 1, finished_at: new Date().toISOString() });
      return json({ ok: true, accountId, accountName });
    }

    if (input.action === 'sync') {
      const { data: account } = await admin.from('marketplace_accounts').select('*').eq('id', input.accountId).eq('user_id', user.id).single();
      if (!account) return json({ error: 'Магазин не найден.' }, 404);
      const { data: credentials } = await admin.from('marketplace_credentials_secure').select('*').eq('marketplace_account_id', account.id).single();
      const apiKey = await decrypt(credentials.encrypted_access_token, serviceKey);
      const clientId = await decrypt(credentials.encrypted_refresh_token, serviceKey);
      await ozon('/v1/seller/info', clientId, apiKey, {});
      const now = new Date().toISOString();
      await admin.from('marketplace_accounts').update({ status: 'connected', last_sync_at: now }).eq('id', account.id);
      await admin.from('sync_runs').insert({ marketplace_account_id: account.id, user_id: user.id, status: 'completed', records_processed: 1, finished_at: now });
      return json({ ok: true, syncedAt: now });
    }

    if (input.action === 'disconnect') {
      const { data: account } = await admin.from('marketplace_accounts').select('id').eq('id', input.accountId).eq('user_id', user.id).single();
      if (!account) return json({ error: 'Магазин не найден.' }, 404);
      await admin.from('marketplace_credentials_secure').delete().eq('marketplace_account_id', account.id);
      await admin.from('marketplace_accounts').update({ status: 'disconnected' }).eq('id', account.id);
      return json({ ok: true });
    }

    return json({ error: 'Неизвестное действие.' }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Внутренняя ошибка.' }, 500);
  }
} };
