import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
async function keyFromSecret(secret: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)); return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function encrypt(value: string, secret: string) { const iv = crypto.getRandomValues(new Uint8Array(12)); const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFromSecret(secret), new TextEncoder().encode(value))); return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...encrypted))}`; }
async function decrypt(value: string, secret: string) { const [a,b]=value.split('.'); const iv=Uint8Array.from(atob(a),c=>c.charCodeAt(0)); const data=Uint8Array.from(atob(b),c=>c.charCodeAt(0)); return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},await keyFromSecret(secret),data)); }
async function inspect(provider: string, token: string) {
  if (provider === 'wildberries') { const r=await fetch('https://common-api.wildberries.ru/api/v1/seller-info',{headers:{Authorization:`Bearer ${token}`}}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.detail||d.title||`Wildberries API: ${r.status}`); const id=String(d.sid||d.supplierId||d.id||'wildberries'); return {id,name:d.tradeMark||d.name||`Wildberries ${id}`}; }
  const r=await fetch('https://api.partner.market.yandex.ru/v2/campaigns',{headers:{'Api-Key':token,Accept:'application/json'}}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.errors?.[0]?.message||d.message||`Яндекс Маркет API: ${r.status}`); const c=(d.campaigns||d.result?.campaigns||[])[0]; if(!c) throw new Error('У ключа нет доступных магазинов Яндекс Маркета.'); const id=String(c.id||c.campaignId); return {id,name:c.domain||c.business?.name||`Яндекс Маркет ${id}`};
}
export default { async fetch(req: Request) {
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors}); if(req.method!=='POST') return json({error:'Method not allowed'},405);
  try {
    const base=Deno.env.get('SUPABASE_URL')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, auth=req.headers.get('Authorization')||'';
    const ur=await fetch(`${base}/auth/v1/user`,{headers:{Authorization:auth,apikey:Deno.env.get('SUPABASE_ANON_KEY')!}}); if(!ur.ok) return json({error:'Войдите в личный кабинет заново.'},401); const user=await ur.json();
    const headers={Authorization:`Bearer ${service}`,apikey:service,'Content-Type':'application/json',Prefer:'return=representation'};
    const input=await req.json(), provider=String(input.provider||''); if(!['wildberries','yandex_market'].includes(provider)) return json({error:'Неизвестный маркетплейс.'},400);
    const table=async(path:string,init:RequestInit={})=>{const r=await fetch(`${base}/rest/v1/${path}`,{...init,headers:{...headers,...(init.headers||{})}}); const d=await r.json().catch(()=>null); if(!r.ok) throw new Error(d?.message||`Database: ${r.status}`); return d;};
    if(input.action==='connect') {
      const token=String(input.token||'').trim(); if(token.length<20) return json({error:'Проверьте ключ доступа.'},400); const info=await inspect(provider,token);
      const rows=await table(`marketplace_accounts?user_id=eq.${user.id}&provider=eq.${provider}&external_account_id=eq.${encodeURIComponent(info.id)}&select=id`); let id=rows[0]?.id;
      if(id) await table(`marketplace_accounts?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({account_name:info.name,status:'connected',last_sync_at:new Date().toISOString()})});
      else { const created=await table('marketplace_accounts',{method:'POST',body:JSON.stringify({user_id:user.id,provider,external_account_id:info.id,account_name:info.name,status:'connected',last_sync_at:new Date().toISOString()})}); id=created[0].id; }
      await table('marketplace_credentials_secure?on_conflict=marketplace_account_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({marketplace_account_id:id,encrypted_access_token:await encrypt(token,service),encrypted_refresh_token:null,updated_at:new Date().toISOString()})});
      await table('sync_runs',{method:'POST',body:JSON.stringify({marketplace_account_id:id,user_id:user.id,status:'completed',records_processed:1,finished_at:new Date().toISOString()})}); return json({ok:true,accountId:id,accountName:info.name});
    }
    const accounts=await table(`marketplace_accounts?id=eq.${input.accountId}&user_id=eq.${user.id}&provider=eq.${provider}&select=*`); const account=accounts[0]; if(!account) return json({error:'Магазин не найден.'},404);
    if(input.action==='disconnect'){await table(`marketplace_credentials_secure?marketplace_account_id=eq.${account.id}`,{method:'DELETE'}); await table(`marketplace_accounts?id=eq.${account.id}`,{method:'PATCH',body:JSON.stringify({status:'disconnected'})}); return json({ok:true});}
    if(input.action==='sync'){const cs=await table(`marketplace_credentials_secure?marketplace_account_id=eq.${account.id}&select=encrypted_access_token`); if(!cs[0]) return json({error:'Ключ магазина не найден.'},404); await inspect(provider,await decrypt(cs[0].encrypted_access_token,service)); const now=new Date().toISOString(); await table(`marketplace_accounts?id=eq.${account.id}`,{method:'PATCH',body:JSON.stringify({status:'connected',last_sync_at:now})}); return json({ok:true,syncedAt:now});}
    return json({error:'Неизвестное действие.'},400);
  } catch(e){console.error(e);return json({error:e instanceof Error?e.message:'Внутренняя ошибка.'},500);}
} };
