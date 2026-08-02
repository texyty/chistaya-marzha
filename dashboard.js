const rub = new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0});
const number = new Intl.NumberFormat('ru-RU');
const demo = {
  7:{revenue:184320,profit:32140,orders:143,returns:8},
  14:{revenue:378640,profit:61120,orders:294,returns:19},
  30:{revenue:827450,profit:137680,orders:641,returns:43}
};
const products=[
  {name:'Органайзер для кухни',sku:'SKU-1042',orders:184,revenue:238740,expenses:183210,profit:55530,unitCost:350},
  {name:'Набор контейнеров, 6 шт.',sku:'SKU-2031',orders:157,revenue:196250,expenses:162880,profit:33370,unitCost:340},
  {name:'Лампа настольная LED',sku:'SKU-0814',orders:126,revenue:188370,expenses:164240,profit:24130,unitCost:550},
  {name:'Щётка для уборки',sku:'SKU-3307',orders:109,revenue:81750,expenses:71690,profit:10060,unitCost:200},
  {name:'Полка настенная',sku:'SKU-1179',orders:65,revenue:122340,expenses:107750,profit:14590,unitCost:653}
];
const expenseParts=[['Комиссия площадки',190314],['Логистика и обработка',112870],['Продвижение',89400],['Себестоимость',251325],['Налоги',49647],['Возвраты и прочее',6214]];
let currentPeriod=30;
let currentSearch='';

function savedCosts(){try{return JSON.parse(localStorage.getItem('dashboard-costs'))||{}}catch{return{}}}
function adjustedProducts(){const costs=savedCosts();return products.map(p=>{const cost=Number(costs[p.sku]??p.unitCost);const delta=(cost-p.unitCost)*p.orders;return{...p,currentCost:cost,expenses:p.expenses+delta,profit:p.profit-delta}})}
function costDelta(){return adjustedProducts().reduce((sum,p,i)=>sum+(p.currentCost-products[i].unitCost)*p.orders,0)}

function render(period=30){
  currentPeriod=period;
  const d=demo[period];
  const adjustedProfit=d.profit-costDelta()*period/30;
  document.querySelector('#revenue').textContent=rub.format(d.revenue);
  document.querySelector('#profit').textContent=rub.format(adjustedProfit);
  document.querySelector('#margin').textContent=`${(adjustedProfit/d.revenue*100).toFixed(1).replace('.',',')}%`;
  document.querySelector('#orders').textContent=number.format(d.orders);
  document.querySelector('#returns').textContent=`Возвратов: ${d.returns}`;
  renderChart(period,d.revenue,adjustedProfit);
  renderGoal(adjustedProfit,period);
  renderFunnel(period);
}
function renderChart(days,revenue,profit){
  const points=days===7?7:days===14?14:15;
  const weights=Array.from({length:points},(_,i)=>.55+((i*7)%11)/20+Math.sin(i*1.7)*.12);
  const max=Math.max(...weights);
  document.querySelector('#chart').innerHTML=weights.map((w,i)=>`<div class="chart-day"><i class="bar revenue" style="height:${Math.round(w/max*88)}%" title="Выручка: ${rub.format(revenue/points*w)}"></i><i class="bar profit" style="height:${Math.max(6,Math.round(w/max*88*profit/revenue*2.7))}%" title="Прибыль: ${rub.format(profit/points*w)}"></i><label>${i%Math.ceil(points/7)===0?i+1:''}</label></div>`).join('');
}
function renderExpenses(){
  const parts=expenseParts.map(item=>item[0]==='Себестоимость'?[item[0],item[1]+costDelta()]:item);
  const total=parts.reduce((sum,item)=>sum+item[1],0);
  document.querySelector('#expense-total').textContent=rub.format(total);
  document.querySelector('#expense-list').innerHTML=parts.map(([name,value])=>`<div class="expense-row"><div class="expense-meta"><span>${name}</span><b>${rub.format(value)}</b></div><div class="track"><div class="fill" style="width:${value/total*100}%"></div></div></div>`).join('');
}
function renderProducts(query=currentSearch){
  currentSearch=query;
  const riskOnly=document.querySelector('#risk-only')?.checked;
  const rows=adjustedProducts().filter(p=>`${p.name} ${p.sku}`.toLowerCase().includes(query.toLowerCase())).filter(p=>!riskOnly||p.profit/p.revenue*100<15);
  document.querySelector('#product-table').innerHTML=rows.map(p=>{const margin=p.profit/p.revenue*100;const state=margin>=15?['Прибыльный','']:margin>=8?['Требует внимания','warn']:['В зоне риска','bad'];return `<tr><td class="product-cell"><b>${p.name}</b><small>${p.sku}</small></td><td>${p.orders}</td><td>${rub.format(p.revenue)}</td><td>${rub.format(p.expenses)}</td><td class="${p.profit>=0?'positive':'negative'}">${rub.format(p.profit)}</td><td>${margin.toFixed(1).replace('.',',')}%</td><td><span class="badge ${state[1]}">${state[0]}</span></td></tr>`}).join('');
}
function renderGoal(profit,period){
  const target=Math.max(1000,Number(localStorage.getItem('dashboard-goal'))||180000);
  const progress=Math.max(0,Math.min(100,profit/target*100));
  const forecast=period<30?profit/period*30:profit;
  document.querySelector('#goal-current').textContent=rub.format(profit);
  document.querySelector('#goal-target').textContent=rub.format(target);
  document.querySelector('#goal-fill').style.width=`${progress}%`;
  document.querySelector('#goal-percent').textContent=`Выполнено ${progress.toFixed(0)}%`;
  document.querySelector('#goal-remaining').textContent=profit>=target?'Цель достигнута':`Осталось ${rub.format(target-profit)}`;
  document.querySelector('#forecast-profit').textContent=rub.format(forecast);
  const status=document.querySelector('#forecast-status');status.textContent=forecast>=target?'План будет выполнен':'Ниже плана';status.className=forecast>=target?'success':'attention';
}
function renderFunnel(period){
  const ratio=period/30;const values=[['Просмотры',48210],['Добавили в корзину',3890],['Оформили заказ',684],['Выкупили',641]];
  const max=values[0][1];document.querySelector('#funnel').innerHTML=values.map(([name,value],index)=>{const scaled=Math.round(value*ratio);const conversion=index?value/values[index-1][1]*100:100;return `<div><span>${name}<small>${index?conversion.toFixed(1).replace('.',',')+'% переход':'100% трафика'}</small></span><i><b style="width:${Math.max(15,value/max*100)}%"></b></i><strong>${number.format(scaled)}</strong></div>`}).join('');
}
document.querySelector('#period').addEventListener('change',e=>render(Number(e.target.value)));
document.querySelector('#product-search').addEventListener('input',e=>renderProducts(e.target.value));
document.querySelector('#risk-only').addEventListener('change',()=>renderProducts());
const costDialog=document.querySelector('#cost-dialog');
function openCosts(){document.querySelector('#cost-fields').innerHTML=adjustedProducts().map(p=>`<label><span>${p.name}<small>${p.sku}</small></span><input type="number" min="0" step="1" name="${p.sku}" value="${p.currentCost}"><b>₽ / шт.</b></label>`).join('');costDialog.showModal()}
document.querySelector('#cost-button').addEventListener('click',openCosts);
document.querySelector('#cost-close').addEventListener('click',()=>costDialog.close());
document.querySelector('#cost-reset').addEventListener('click',()=>{localStorage.removeItem('dashboard-costs');costDialog.close();render(currentPeriod);renderExpenses();renderProducts()});
document.querySelector('#cost-save').addEventListener('click',()=>{const values={};document.querySelectorAll('#cost-fields input').forEach(input=>values[input.name]=Math.max(0,Number(input.value)||0));localStorage.setItem('dashboard-costs',JSON.stringify(values));costDialog.close();render(currentPeriod);renderExpenses();renderProducts()});
document.querySelector('#export-button').addEventListener('click',()=>{const header=['Артикул','Товар','Заказы','Выручка','Расходы','Прибыль','Маржа'];const rows=adjustedProducts().map(p=>[p.sku,p.name,p.orders,p.revenue,Math.round(p.expenses),Math.round(p.profit),(p.profit/p.revenue*100).toFixed(1)]);const csv='\uFEFF'+[header,...rows].map(row=>row.map(cell=>`"${String(cell).replaceAll('"','""')}"`).join(';')).join('\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.download='chistaya-marzha-ozon.csv';link.click();URL.revokeObjectURL(link.href)});
const goalDialog=document.querySelector('#goal-dialog');
document.querySelector('#goal-edit').addEventListener('click',()=>{document.querySelector('#goal-input').value=Number(localStorage.getItem('dashboard-goal'))||180000;goalDialog.showModal()});
document.querySelector('#goal-close').addEventListener('click',()=>goalDialog.close());document.querySelector('#goal-cancel').addEventListener('click',()=>goalDialog.close());
document.querySelector('#goal-save').addEventListener('click',()=>{const value=Math.max(1000,Number(document.querySelector('#goal-input').value)||180000);localStorage.setItem('dashboard-goal',value);goalDialog.close();render(currentPeriod)});
document.querySelectorAll('.alert-list button').forEach(button=>button.addEventListener('click',()=>{const name=button.dataset.product;document.querySelector('#product-search').value=name;document.querySelector('#risk-only').checked=false;renderProducts(name);document.querySelector('#products').scrollIntoView({behavior:'smooth'})}));
render();renderExpenses();renderProducts();
