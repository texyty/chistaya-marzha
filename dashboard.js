const rub = new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0});
const number = new Intl.NumberFormat('ru-RU');
const demo = {
  7:{revenue:184320,profit:32140,orders:143,returns:8},
  14:{revenue:378640,profit:61120,orders:294,returns:19},
  30:{revenue:827450,profit:137680,orders:641,returns:43}
};
const products=[
  {name:'Органайзер для кухни',sku:'SKU-1042',orders:184,revenue:238740,expenses:183210,profit:55530},
  {name:'Набор контейнеров, 6 шт.',sku:'SKU-2031',orders:157,revenue:196250,expenses:162880,profit:33370},
  {name:'Лампа настольная LED',sku:'SKU-0814',orders:126,revenue:188370,expenses:164240,profit:24130},
  {name:'Щётка для уборки',sku:'SKU-3307',orders:109,revenue:81750,expenses:71690,profit:10060},
  {name:'Полка настенная',sku:'SKU-1179',orders:65,revenue:122340,expenses:107750,profit:14590}
];
const expenseParts=[['Комиссия площадки',190314],['Логистика и обработка',112870],['Продвижение',89400],['Себестоимость',251320],['Налоги',49647],['Возвраты и прочее',9619]];

function render(period=30){
  const d=demo[period];
  document.querySelector('#revenue').textContent=rub.format(d.revenue);
  document.querySelector('#profit').textContent=rub.format(d.profit);
  document.querySelector('#margin').textContent=`${(d.profit/d.revenue*100).toFixed(1).replace('.',',')}%`;
  document.querySelector('#orders').textContent=number.format(d.orders);
  document.querySelector('#returns').textContent=`Возвратов: ${d.returns}`;
  renderChart(period,d.revenue,d.profit);
}
function renderChart(days,revenue,profit){
  const points=days===7?7:days===14?14:15;
  const weights=Array.from({length:points},(_,i)=>.55+((i*7)%11)/20+Math.sin(i*1.7)*.12);
  const max=Math.max(...weights);
  document.querySelector('#chart').innerHTML=weights.map((w,i)=>`<div class="chart-day"><i class="bar revenue" style="height:${Math.round(w/max*88)}%" title="Выручка: ${rub.format(revenue/points*w)}"></i><i class="bar profit" style="height:${Math.max(6,Math.round(w/max*88*profit/revenue*2.7))}%" title="Прибыль: ${rub.format(profit/points*w)}"></i><label>${i%Math.ceil(points/7)===0?i+1:''}</label></div>`).join('');
}
function renderExpenses(){
  const total=expenseParts.reduce((sum,item)=>sum+item[1],0);
  document.querySelector('#expense-total').textContent=rub.format(total);
  document.querySelector('#expense-list').innerHTML=expenseParts.map(([name,value])=>`<div class="expense-row"><div class="expense-meta"><span>${name}</span><b>${rub.format(value)}</b></div><div class="track"><div class="fill" style="width:${value/total*100}%"></div></div></div>`).join('');
}
function renderProducts(query=''){
  const rows=products.filter(p=>`${p.name} ${p.sku}`.toLowerCase().includes(query.toLowerCase()));
  document.querySelector('#product-table').innerHTML=rows.map(p=>{const margin=p.profit/p.revenue*100;const state=margin>=15?['Прибыльный','']:margin>=8?['Требует внимания','warn']:['В зоне риска','bad'];return `<tr><td class="product-cell"><b>${p.name}</b><small>${p.sku}</small></td><td>${p.orders}</td><td>${rub.format(p.revenue)}</td><td>${rub.format(p.expenses)}</td><td class="${p.profit>=0?'positive':'negative'}">${rub.format(p.profit)}</td><td>${margin.toFixed(1).replace('.',',')}%</td><td><span class="badge ${state[1]}">${state[0]}</span></td></tr>`}).join('');
}
document.querySelector('#period').addEventListener('change',e=>render(Number(e.target.value)));
document.querySelector('#product-search').addEventListener('input',e=>renderProducts(e.target.value));
render();renderExpenses();renderProducts();
