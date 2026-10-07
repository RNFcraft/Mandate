(function(){
"use strict";

var KEY="mandate-functional-prototype-v12";

function deepClone(x){return JSON.parse(JSON.stringify(x));}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function money(v){return "₳ "+Number(v).toFixed(1)+"м";}
function billions(v){return "₳ "+(v/1000).toFixed(2)+" млрд";}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c];});}
function initials(name){return name.split(/\s+/).map(function(x){return x[0]||"";}).join("").slice(0,2).toUpperCase();}
function isoDate(d){return d.toISOString().slice(0,10);}
function parseDate(s){return new Date(s+"T00:00:00Z");}
function dayDiff(a,b){return Math.ceil((b-a)/86400000);}
function pct(v){return Number(v).toFixed(1)+"%";}
function choose(arr){return arr[Math.floor(Math.random()*arr.length)];}

var defaults={
  date:"1848-03-14",
  speed:1,
  country:{name:"Республика Аврелия",short:"Аврелия",form:"Смешанная республика",motto:"Закон и достоинство",flagData:""},
  currency:{name:"Аурельский талер",symbol:"₳",type:"смешанная",silver:18,trust:74},
  stateEconomy:{treasury:1240,balance:12.8,gdp:8420,growth:3.1,inflation:3.8,industry:112,unemployment:7.1},
  party:{
    name:"Либеральная партия",short:"ЛП",slogan:"Свобода, закон, развитие",color:"#527c9d",
    leader:"Элиас Варен",leaderPopularity:63,
    funds:18.6,members:243000,volunteers:18600,organization:64,recognition:78,
    baseSupport:28.4,campaign:0,momentum:4,
    status:"Участник правящей коалиции",
    platform:{tax:52,labor:58,trade:36,central:48,franchise:62},
    candidate:"Элиас Варен",candidatePopularity:63,presBoost:0
  },
  parties:[
    {id:"soc",name:"Социалисты",color:"#ae6059",seats:54,share:21.6},
    {id:"lib",name:"Либеральная партия",color:"#527c9d",seats:71,share:28.4,player:true},
    {id:"agr",name:"Аграрии",color:"#7b875e",seats:31,share:12.4},
    {id:"ind",name:"Независимые",color:"#9b8350",seats:16,share:6.4},
    {id:"con",name:"Консерваторы",color:"#59606d",seats:78,share:31.2}
  ],
  coalition:["agr","ind"],
  parliamentElection:{date:"1848-05-01",done:false,results:null},
  presidentElection:{
    date:"1848-06-15",round2Date:"1848-06-29",round1:null,round2:null,stage:"nomination",
    currentPresident:"Маркус Эстель",currentPresidentParty:"Консервативная партия",pendingInauguration:false
  },
  bill:{
    title:"О фабричном труде",stage:"2-е чтение",negotiationBonus:0,voted:false,
    articles:[
      "Максимальная продолжительность рабочей недели на фабриках и мануфактурах — 60 часов.",
      "Запрещается фабричный труд детей младше 10 лет; для работников 10–14 лет вводится сокращённый день.",
      "Учредить корпус фабричных инспекторов при Министерстве внутренних дел.",
      "Закон вступает в силу через шесть месяцев после опубликования."
    ]
  },
  market:[
    {name:"Зерно",price:4.2,supply:96,demand:104},
    {name:"Уголь",price:7.8,supply:88,demand:112},
    {name:"Железо",price:18.6,supply:101,demand:107},
    {name:"Текстиль",price:12.4,supply:109,demand:98},
    {name:"Древесина",price:5.7,supply:103,demand:100}
  ],
  enterprises:[
    {id:"iron",name:"Аурельский железный завод",owner:"частный",profit:1.8,workers:1840},
    {id:"mine",name:"Тернские угольные шахты",owner:"боярин",profit:2.4,workers:2260},
    {id:"arsenal",name:"Государственный арсенал",owner:"государство",profit:-0.4,workers:910},
    {id:"textile",name:"Лиорская текстильная мануфактура",owner:"частный",profit:0.9,workers:1260}
  ],
  science:{
    electricity:62,
    grants:[
      {id:"galvanic",name:"Опыты с гальваническими элементами",scientist:"Иоганн Рейтер",cost:1.2,effect:5,status:"ожидает"},
      {id:"conduct",name:"Проводимость металлов",scientist:"Мара Левен",cost:0.8,effect:3,status:"ожидает"},
      {id:"chem",name:"Электрохимическое разложение",scientist:"Стефан Орр",cost:1.6,effect:6,status:"ожидает"}
    ]
  },
  provinces:{
    "Аурельская провинция":{owner:"Республика Аврелия",pop:2.84,infra:78,resources:"уголь, железо",surveyed:true},
    "Тернская провинция":{owner:"Республика Аврелия",pop:1.42,infra:63,resources:"уголь",surveyed:true},
    "Северная Аурелия":{owner:"Республика Аврелия",pop:1.10,infra:51,resources:"лес, торф",surveyed:false},
    "Ровенская провинция":{owner:"Республика Аврелия",pop:1.76,infra:69,resources:"железо, лес",surveyed:true},
    "Южная Аурелия":{owner:"Республика Аврелия",pop:1.31,infra:44,resources:"лес",surveyed:false},
    "Северный Норвен":{owner:"Королевство Норвен",pop:1.15,infra:47,resources:"неизвестно",surveyed:false},
    "Западный рубеж":{owner:"Королевство Норвен",pop:0.72,infra:39,resources:"неизвестно",surveyed:false},
    "Эстельский край":{owner:"Эстельская Федерация",pop:1.28,infra:58,resources:"медь",surveyed:true},
    "Восточный Эстель":{owner:"Эстельская Федерация",pop:0.94,infra:42,resources:"неизвестно",surveyed:false},
    "Эстельская марка":{owner:"Эстельская Федерация",pop:0.51,infra:35,resources:"неизвестно",surveyed:false}
  },
  selectedProvince:"Аурельская провинция",
  log:[
    {date:"14 марта 1848",title:"Прототип запущен",text:"Вы управляете Либеральной партией, а не государством напрямую."},
    {date:"12 марта 1848",title:"Партийный съезд",text:"Курс на промышленную модернизацию подтверждён."},
    {date:"9 марта 1848",title:"Коалиция",text:"Аграрии требуют больше вложений в сельскую инфраструктуру."}
  ]
};

function mergeDefaults(base,saved){
  if(!saved)return deepClone(base);
  var out=deepClone(base);
  Object.keys(saved).forEach(function(k){out[k]=saved[k];});
  out.country=Object.assign({},base.country,saved.country||{});
  out.currency=Object.assign({},base.currency,saved.currency||{});
  out.stateEconomy=Object.assign({},base.stateEconomy,saved.stateEconomy||{});
  out.party=Object.assign({},base.party,saved.party||{});
  out.party.platform=Object.assign({},base.party.platform,(saved.party||{}).platform||{});
  out.parliamentElection=Object.assign({},base.parliamentElection,saved.parliamentElection||{});
  out.presidentElection=Object.assign({},base.presidentElection,saved.presidentElection||{});
  out.bill=Object.assign({},base.bill,saved.bill||{});
  out.science=Object.assign({},base.science,saved.science||{});
  return out;
}

var saved=null;
try{saved=JSON.parse(localStorage.getItem(KEY)||"null");}catch(e){}
var S=mergeDefaults(defaults,saved);

function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}

function now(){return parseDate(S.date);}
function formatDate(d){return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(d);}
function weekday(d){return new Intl.DateTimeFormat("ru-RU",{weekday:"long",timeZone:"UTC"}).format(d);}

function logEvent(title,text){
  S.log.unshift({date:formatDate(now()),title:title,text:text});
  S.log=S.log.slice(0,60);
  save();
  renderLogs();
}
function toast(text){
  var el=document.getElementById("toast");el.textContent=text;el.classList.add("show");
  clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(function(){el.classList.remove("show");},2800);
}

function partySupport(){
  var p=S.party.platform;
  var effect=(p.franchise-62)*0.018-Math.abs(p.tax-52)*0.006-Math.abs(p.trade-36)*0.004-Math.abs(p.central-48)*0.003-Math.abs(p.labor-58)*0.003;
  return clamp(S.party.baseSupport+S.party.campaign+effect,7,52);
}
function presidentPoll(){
  return clamp(24+(S.party.candidatePopularity-50)*0.22+S.party.presBoost+S.party.campaign*0.45+S.party.momentum*0.05,8,48);
}
function playerParty(){return S.parties.find(function(p){return p.id==="lib";});}
function syncPlayerParty(){
  var p=playerParty();
  p.name=S.party.name;p.color=S.party.color;p.seats=S.party.seats||p.seats;p.share=partySupport();p.player=true;
}
function partySeats(){return playerParty().seats;}
function coalitionSeats(){
  var total=partySeats();
  S.coalition.forEach(function(id){var p=S.parties.find(function(x){return x.id===id;});if(p)total+=p.seats;});
  return total;
}
function isPresident(){return S.presidentElection.currentPresident===S.party.leader;}
function officeLabel(){return isPresident()?"Президент Республики":"Лидер партии";}

function normalizeShares(arr){
  var sum=arr.reduce(function(a,b){return a+b.share;},0)||1;
  arr.forEach(function(x){x.share=x.share/sum*100;});
  return arr;
}
function allocateSeats(arr,total){
  total=total||250;
  arr=arr.map(function(x){var y=Object.assign({},x);y.exact=y.share/100*total;y.seats=Math.floor(y.exact);return y;});
  var used=arr.reduce(function(a,b){return a+b.seats;},0);
  arr.slice().sort(function(a,b){return (b.exact-b.seats)-(a.exact-a.seats);}).slice(0,total-used).forEach(function(x){
    var real=arr.find(function(r){return r.id===x.id;});real.seats++;
  });
  return arr;
}

function renderTop(){
  syncPlayerParty();
  document.documentElement.style.setProperty("--party",S.party.color);
  document.getElementById("countryNameTop").textContent=S.country.name;
  document.getElementById("topPartyName").textContent=S.party.name;
  document.getElementById("topPartyDot").style.background=S.party.color;
  document.getElementById("topTreasury").textContent=billions(S.stateEconomy.treasury);
  document.getElementById("topSupport").textContent=pct(partySupport());
  document.getElementById("topSeats").textContent=partySeats()+" / 250";
  document.getElementById("topOffice").textContent=officeLabel();
  document.getElementById("dateLabel").textContent=formatDate(now());
  document.getElementById("weekdayLabel").textContent=weekday(now());
  if(S.country.flagData){
    document.getElementById("topFlag").style.backgroundImage="url("+S.country.flagData+")";
    document.getElementById("stateFlag").style.backgroundImage="url("+S.country.flagData+")";
  }
}

function renderOverview(){
  document.getElementById("overviewRole").textContent=officeLabel()+" · "+S.party.name;
  document.getElementById("overviewGovStatus").textContent=S.party.status;
  document.getElementById("ovSupport").textContent=pct(partySupport());
  document.getElementById("ovSupportDelta").textContent="кампания: "+(S.party.campaign>=0?"+":"")+S.party.campaign.toFixed(1)+" п.п.";
  document.getElementById("ovSeats").textContent=partySeats();
  document.getElementById("ovFunds").textContent=money(S.party.funds);
  document.getElementById("ovOrg").textContent=Math.round(S.party.organization);
  document.getElementById("ovPresPoll").textContent=pct(presidentPoll());
  document.getElementById("ovCandidate").textContent=S.party.candidate;
  document.getElementById("ovTreasury").textContent=billions(S.stateEconomy.treasury);
  document.getElementById("ovBalance").textContent=(S.stateEconomy.balance>=0?"+":"")+money(S.stateEconomy.balance)+" / мес.";

  var events=[];
  if(!S.parliamentElection.done)events.push({date:S.parliamentElection.date,title:"Парламентские выборы",note:Math.max(0,dayDiff(now(),parseDate(S.parliamentElection.date)))+" дн."});
  if(!S.presidentElection.round1)events.push({date:S.presidentElection.date,title:"Президентские выборы · 1-й тур",note:Math.max(0,dayDiff(now(),parseDate(S.presidentElection.date)))+" дн."});
  if(S.presidentElection.stage==="runoff"&&!S.presidentElection.round2)events.push({date:S.presidentElection.round2Date,title:"Президентские выборы · 2-й тур",note:Math.max(0,dayDiff(now(),parseDate(S.presidentElection.round2Date)))+" дн."});
  events.push({date:"1848-04-01",title:"Месячный бюджетный отчёт",note:"автоматически"});
  document.getElementById("nextEvents").innerHTML=events.map(function(e){
    return '<div class="timeline-item"><b>'+esc(formatDate(parseDate(e.date)))+'</b><span>'+esc(e.title)+'</span><em>'+esc(e.note)+'</em></div>';
  }).join("");
}
function renderLogs(){
  var html=S.log.slice(0,7).map(function(e){return '<div class="log-item"><b>'+esc(e.title)+'</b><span>'+esc(e.text)+'</span><small>'+esc(e.date)+'</small></div>';}).join("");
  document.getElementById("overviewLog").innerHTML=html;
  document.getElementById("fullLog").innerHTML=S.log.map(function(e){return '<div class="log-item"><b>'+esc(e.title)+'</b><span>'+esc(e.text)+'</span><small>'+esc(e.date)+'</small></div>';}).join("");
}

function platformGroups(){
  var p=S.party.platform,b=S.party.campaign;
  return [
    {name:"Городские рабочие",value:clamp(25+p.labor*.23+p.franchise*.07-p.tax*.03+b*.3,4,80)},
    {name:"Предприниматели",value:clamp(66-p.tax*.33-p.labor*.17-p.trade*.06+b*.2,4,82)},
    {name:"Крестьяне",value:clamp(34-p.central*.10+p.trade*.05+p.franchise*.03+b*.15,4,74)},
    {name:"Служащие",value:clamp(37+p.franchise*.19+(100-Math.abs(p.tax-50))*.04+b*.25,4,84)},
    {name:"Аристократия",value:clamp(47-p.franchise*.36-p.labor*.10+(100-p.tax)*.04+b*.1,2,70)}
  ];
}
function platformEffect(){
  return partySupport()-S.party.baseSupport-S.party.campaign;
}
function platformLabel(key,v){
  var map={
    tax:["низкие налоги","умеренные","высокие расходы"],
    labor:["свобода договора","умеренная защита","жёсткое регулирование"],
    trade:["свободная","смешанная","протекционизм"],
    central:["автономия регионов","баланс","сильный центр"],
    franchise:["узкий ценз","постепенное расширение","всеобщее право"]
  };
  return map[key][v<34?0:v<67?1:2];
}
function renderParty(){
  document.getElementById("partyTitle").textContent=S.party.name;
  document.getElementById("partySlogan").textContent="«"+S.party.slogan+"»";
  document.getElementById("partySupport").textContent=pct(partySupport());
  document.getElementById("partyFunds").textContent=money(S.party.funds);
  document.getElementById("partyOrg").textContent=Math.round(S.party.organization);
  document.getElementById("partyRecognition").textContent=Math.round(S.party.recognition)+"%";
  document.getElementById("partyVolunteers").textContent=(S.party.volunteers/1000).toFixed(1)+" тыс.";
  document.getElementById("leaderName").textContent=S.party.leader;
  document.getElementById("leaderAvatar").textContent=initials(S.party.leader);
  document.getElementById("leaderPopularity").textContent=Math.round(S.party.leaderPopularity)+"%";
  document.getElementById("leaderOffice").textContent=officeLabel();
  document.getElementById("partyStatus").textContent=S.party.status;
  document.getElementById("platformEffect").textContent="эффект "+(platformEffect()>=0?"+":"")+platformEffect().toFixed(1)+" п.п.";
  Object.keys(S.party.platform).forEach(function(k){
    var slider=document.querySelector('[data-platform="'+k+'"]');
    if(slider)slider.value=S.party.platform[k];
    var lab=document.getElementById("lab-"+k);if(lab)lab.textContent=platformLabel(k,S.party.platform[k]);
  });
  document.getElementById("groupSupport").innerHTML=platformGroups().map(function(g){
    return '<div class="bar-row"><span>'+esc(g.name)+'</span><div class="bar-track"><i style="width:'+g.value+'%"></i></div><b>'+Math.round(g.value)+'%</b></div>';
  }).join("");
}

function parliamentProjection(){
  var arr=S.parties.map(function(p){return {id:p.id,name:p.name,color:p.color,player:p.player,share:p.id==="lib"?partySupport()+((S.party.organization-50)*.03)+(S.party.momentum*.02):p.share};});
  normalizeShares(arr);
  return allocateSeats(arr,250);
}
function renderParliamentElection(){
  var days=dayDiff(now(),parseDate(S.parliamentElection.date));
  document.getElementById("parlDays").textContent=days>0?"через "+days+" дн.":"дата наступила";
  var projection=parliamentProjection().sort(function(a,b){return b.seats-a.seats;});
  document.getElementById("parlProjection").innerHTML=projection.map(function(p){
    return '<div class="party-row '+(p.player?"player":"")+'"><span>'+esc(p.name)+'</span><div class="mini-bar"><i style="width:'+(p.seats/2.5)+'%;background:'+p.color+'"></i></div><b>'+p.share.toFixed(1)+'%</b><strong>'+p.seats+'</strong></div>';
  }).join("");
  document.getElementById("parlElectionMessage").textContent=S.parliamentElection.done?"Последние выборы уже проведены. Можно сбросить демо для новой кампании.":"Выборы ещё не проведены.";
  var results=S.parliamentElection.results;
  document.getElementById("parlResults").innerHTML=results?results.slice().sort(function(a,b){return b.seats-a.seats;}).map(function(p){
    return '<div class="result-card '+(p.id==="lib"?"player":"")+'"><b>'+esc(p.name)+'</b><strong>'+p.seats+'</strong><small>'+p.share.toFixed(1)+'% голосов</small></div>';
  }).join(""):'<div class="empty">Нет результатов.</div>';
  renderCoalitionBuilder();
}
function renderCoalitionBuilder(){
  var others=S.parties.filter(function(p){return p.id!=="lib";});
  var html='<div class="coalition-total">Ваши места: <b>'+partySeats()+'</b></div>';
  others.forEach(function(p){
    html+='<label class="coalition-option"><input type="checkbox" data-coalition="'+p.id+'" '+(S.coalition.indexOf(p.id)>=0?"checked":"")+'><span>'+esc(p.name)+'</span><b>'+p.seats+'</b></label>';
  });
  html+='<div class="coalition-total">Выбрано: <b id="coalitionTotal">'+coalitionSeats()+' / 250</b></div>';
  document.getElementById("coalitionBuilder").innerHTML=html;
  document.querySelectorAll("[data-coalition]").forEach(function(el){el.addEventListener("change",function(){
    S.coalition=[].slice.call(document.querySelectorAll("[data-coalition]:checked")).map(function(x){return x.getAttribute("data-coalition");});
    save();renderCoalitionBuilder();renderParliament();
  });});
}

var leaderOptions=[
  {name:"Элиас Варен",pop:63,desc:"Действующий лидер · реформатор"},
  {name:"Мара Рейн",pop:58,desc:"Министр финансов · умеренное крыло"},
  {name:"Арон Севель",pop:54,desc:"Министр торговли · промышленное крыло"}
];
function renderCandidates(){
  document.getElementById("candidateChoices").innerHTML=leaderOptions.map(function(c){
    return '<div class="candidate-card '+(c.name===S.party.candidate?"selected":"")+'" data-candidate="'+esc(c.name)+'" data-pop="'+c.pop+'"><div class="circle">'+initials(c.name)+'</div><div><b>'+esc(c.name)+'</b><small>'+esc(c.desc)+'</small></div><strong>'+c.pop+'%</strong></div>';
  }).join("");
  document.querySelectorAll(".candidate-card").forEach(function(el){el.addEventListener("click",function(){
    document.querySelectorAll(".candidate-card").forEach(function(x){x.classList.remove("selected");});el.classList.add("selected");
  });});
}
function renderPresident(){
  var days=dayDiff(now(),parseDate(S.presidentElection.date));
  document.getElementById("presDays").textContent=days>0?"1-й тур через "+days+" дн.":"дата наступила";
  renderCandidates();
  var pp=presidentPoll();
  var polls=[
    {name:S.party.candidate+" · "+S.party.short,value:pp,color:S.party.color},
    {name:"Адела Нор · Консерваторы",value:33,color:"#59606d"},
    {name:"Иво Марен · Социалисты",value:24,color:"#ae6059"},
    {name:"Грета Фаль · Аграрии",value:10,color:"#7b875e"},
    {name:"Прочие",value:4,color:"#868b91"}
  ];
  normalizeShares(polls.map(function(x){return x;}));
  document.getElementById("presPolls").innerHTML=polls.map(function(x){
    return '<div class="bar-row"><span>'+esc(x.name)+'</span><div class="bar-track"><i style="width:'+x.value+'%;background:'+x.color+'"></i></div><b>'+x.value.toFixed(1)+'%</b></div>';
  }).join("");
  document.getElementById("currentPresident").textContent=S.presidentElection.currentPresident;
  document.getElementById("currentPresidentParty").textContent=S.presidentElection.currentPresidentParty;
  document.getElementById("presOfficeMessage").textContent=isPresident()?"Ваш лидер занимает президентский пост.":"Ваш кандидат пока не занимает пост.";
  ["stageNom","stageR1","stageR2","stageOffice"].forEach(function(id){document.getElementById(id).classList.remove("active","done");});
  document.getElementById("stageNom").classList.add("done");
  if(S.presidentElection.round1){document.getElementById("stageR1").classList.add("done");}
  if(S.presidentElection.stage==="runoff"){document.getElementById("stageR2").classList.add("active");}
  if(S.presidentElection.round2){document.getElementById("stageR2").classList.add("done");}
  if(S.presidentElection.pendingInauguration){document.getElementById("stageOffice").classList.add("active");}
  if(isPresident()){document.getElementById("stageOffice").classList.add("done");}
  var r1=document.getElementById("runPresRound1"),r2=document.getElementById("runPresRound2"),ina=document.getElementById("inaugurateBtn");
  r1.disabled=!!S.presidentElection.round1;
  r2.disabled=S.presidentElection.stage!=="runoff"||!!S.presidentElection.round2;
  ina.disabled=!S.presidentElection.pendingInauguration;
  var msg="Кандидат ещё не прошёл первый тур.";
  if(S.presidentElection.round1){
    var pr=S.presidentElection.round1.player;
    if(S.presidentElection.stage==="runoff")msg=S.party.candidate+" прошёл во второй тур с "+pr.toFixed(1)+"%. Второй тур доступен отдельной кнопкой ниже.";
    if(S.presidentElection.stage==="eliminated")msg="Кандидат выбыл в первом туре с "+pr.toFixed(1)+"%.";
  }
  if(S.presidentElection.round2){
    msg=S.presidentElection.round2.win?"Победа во втором туре: "+S.presidentElection.round2.player.toFixed(1)+"%. Осталась инаугурация.":"Поражение во втором туре: "+S.presidentElection.round2.player.toFixed(1)+"%.";
  }
  if(isPresident())msg=S.party.leader+" вступил в должность президента Республики.";
  document.getElementById("presResult").textContent=msg;
}

function renderElections(){
  renderParliamentElection();renderPresident();
}

function renderParliament(){
  document.getElementById("parliamentBars").innerHTML=S.parties.slice().sort(function(a,b){return b.seats-a.seats;}).map(function(p){
    return '<div class="parliament-row '+(p.id==="lib"?"player":"")+'"><span>'+esc(p.name)+(p.id==="lib"?" · ВЫ":"")+'</span><div class="seatbar"><i style="width:'+(p.seats/2.5)+'%;background:'+p.color+'"></i></div><b>'+p.seats+'</b></div>';
  }).join("");
  document.getElementById("coalitionSummary").innerHTML="Ваша коалиция: <b>"+coalitionSeats()+" / 250</b> · "+(coalitionSeats()>=126?'<span class="good">есть большинство</span>':'<span class="bad">большинства нет</span>');
  document.getElementById("billTitle").textContent=S.bill.title;
  document.getElementById("billStage").textContent=S.bill.stage;
  document.getElementById("billArticles").innerHTML=S.bill.articles.map(function(a,i){return '<div class="article"><b>Статья '+(i+1)+'</b><p>'+esc(a)+'</p></div>';}).join("");
  var own=partySeats(), coalition=coalitionSeats(), yes=clamp(Math.round(92+coalition*.22+S.bill.negotiationBonus),70,190), undecided=clamp(30-Math.round(S.bill.negotiationBonus/2),8,40), no=250-yes-undecided;
  document.getElementById("billVotePreview").innerHTML='<div class="vote-box"><strong class="good">'+yes+'</strong><span>За</span></div><div class="vote-box"><strong class="warn">'+undecided+'</strong><span>Не определились</span></div><div class="vote-box"><strong class="bad">'+no+'</strong><span>Против</span></div>';
  document.getElementById("billMessage").textContent=S.bill.voted?"По законопроекту уже проведено голосование.":"Ваша фракция контролирует "+own+" мест; коалиция — "+coalition+".";
}

function renderEconomy(){
  document.getElementById("econGDP").textContent=billions(S.stateEconomy.gdp);
  document.getElementById("econGrowth").textContent=(S.stateEconomy.growth>=0?"+":"")+S.stateEconomy.growth.toFixed(1)+"% г/г";
  document.getElementById("econInflation").textContent=S.stateEconomy.inflation.toFixed(1)+"%";
  document.getElementById("econIndustry").textContent=S.stateEconomy.industry.toFixed(1);
  document.getElementById("econUnemployment").textContent=S.stateEconomy.unemployment.toFixed(1)+"%";
  document.getElementById("econCurrency").textContent=S.currency.symbol+" "+S.currency.name.replace("Аурельский ","");
  document.getElementById("econCurrencyTrust").textContent="доверие "+Math.round(S.currency.trust)+"%";
  var head='<div class="market-row"><span>Товар</span><span>Цена</span><span>Предложение</span><span>Спрос</span></div>';
  document.getElementById("marketTable").innerHTML=head+S.market.map(function(x){
    var cls=x.demand>x.supply?"bad":"good";
    return '<div class="market-row"><b>'+esc(x.name)+'</b><b class="'+cls+'">'+S.currency.symbol+" "+x.price.toFixed(2)+'</b><span>'+Math.round(x.supply)+'</span><span>'+Math.round(x.demand)+'</span></div>';
  }).join("");
  document.getElementById("enterpriseList").innerHTML=S.enterprises.map(function(x){
    var button=x.owner==="государство"?'<button data-enterprise="'+x.id+'" data-mode="sell">Приватизировать</button>':'<button data-enterprise="'+x.id+'" data-mode="buy">Купить государством</button>';
    return '<div class="enterprise-row"><div><b>'+esc(x.name)+'</b><small>'+x.workers.toLocaleString("ru-RU")+' работников</small></div><span>'+esc(x.owner)+'</span><b class="'+(x.profit>=0?"good":"bad")+'">'+(x.profit>=0?"+":"")+money(x.profit)+'/мес</b>'+button+'</div>';
  }).join("");
  document.querySelectorAll("[data-enterprise]").forEach(function(b){b.addEventListener("click",function(){
    var x=S.enterprises.find(function(e){return e.id===b.getAttribute("data-enterprise");});if(!x)return;
    if(b.getAttribute("data-mode")==="buy"){
      var cost=18+Math.max(0,x.profit*5);if(S.stateEconomy.treasury<cost){toast("Недостаточно средств казны.");return;}
      S.stateEconomy.treasury-=cost;x.owner="государство";logEvent("Национализация","Государство купило предприятие «"+x.name+"» за "+money(cost)+".");
    }else{
      var revenue=16+Math.max(0,x.profit*4);S.stateEconomy.treasury+=revenue;x.owner="частный";logEvent("Приватизация","Предприятие «"+x.name+"» продано за "+money(revenue)+".");
    }
    save();renderAll();
  });});
}

function renderState(){
  document.getElementById("stateName").textContent=S.country.name;
  document.getElementById("stateShort").textContent=S.country.short;
  document.getElementById("stateForm").textContent=S.country.form;
  document.getElementById("stateMotto").textContent="«"+S.country.motto+"»";
  document.getElementById("currencySymbol").textContent=S.currency.symbol;
  document.getElementById("currencyName").textContent=S.currency.name;
  document.getElementById("currencyType").textContent=S.currency.type;
  document.getElementById("currencySilver").textContent=S.currency.silver.toFixed(1)+" г";
  document.getElementById("currencyTrust").textContent=Math.round(S.currency.trust)+"%";
}

function renderScience(){
  document.getElementById("electricityBar").style.width=clamp(S.science.electricity,0,100)+"%";
  document.getElementById("electricityProgressText").textContent=Math.round(S.science.electricity)+"%";
  document.getElementById("electricityStatus").textContent=S.science.electricity>=100?"практический прорыв":S.science.electricity>=80?"быстрый прогресс":"экспериментальная стадия";
  if(S.science.electricity>=80)document.getElementById("electroNode").classList.add("done");
  document.getElementById("grantRequests").innerHTML=S.science.grants.map(function(g){
    var actions=g.status==="ожидает"?'<button data-grant="'+g.id+'" data-gmode="approve">Одобрить</button><button data-grant="'+g.id+'" data-gmode="deny">Отказать</button>':'<b class="'+(g.status==="одобрен"?"good":"bad")+'">'+g.status+'</b>';
    return '<div class="grant-row"><div><b>'+esc(g.name)+'</b><small>'+esc(g.scientist)+'</small></div><span>'+money(g.cost)+'</span><div>'+actions+'</div></div>';
  }).join("");
  document.querySelectorAll("[data-grant]").forEach(function(b){b.addEventListener("click",function(){
    var g=S.science.grants.find(function(x){return x.id===b.getAttribute("data-grant");});if(!g||g.status!=="ожидает")return;
    if(b.getAttribute("data-gmode")==="approve"){
      if(S.stateEconomy.treasury<g.cost){toast("Казна не может оплатить грант.");return;}
      S.stateEconomy.treasury-=g.cost;g.status="одобрен";S.science.electricity=clamp(S.science.electricity+g.effect,0,100);logEvent("Научный грант","Одобрен проект «"+g.name+"». Прогресс электричества вырос.");
    }else{g.status="отклонён";logEvent("Научный грант","Правительство отказало проекту «"+g.name+"». Исследователь может продолжить работу частным образом.");}
    save();renderAll();
  });});
}

function renderProvince(){
  var name=S.selectedProvince,p=S.provinces[name];if(!p)return;
  document.getElementById("provinceName").textContent=name;
  document.getElementById("provinceOwner").textContent=p.owner;
  document.getElementById("provincePop").textContent=p.pop.toFixed(2)+" млн";
  document.getElementById("provinceInfra").textContent=Math.round(p.infra)+" / 100";
  document.getElementById("provinceResources").textContent=p.surveyed?p.resources:"не разведаны";
}

function renderAll(){
  syncPlayerParty();renderTop();renderOverview();renderLogs();renderParty();renderElections();renderParliament();renderEconomy();renderState();renderScience();renderProvince();save();
}

function switchView(name){
  document.querySelectorAll(".nav[data-view]").forEach(function(n){n.classList.toggle("active",n.getAttribute("data-view")===name);});
  document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active");});
  var el=document.getElementById("view-"+name);if(el)el.classList.add("active");
  if(name==="elections")renderElections();
}
document.querySelectorAll(".nav[data-view]").forEach(function(n){n.addEventListener("click",function(){switchView(n.getAttribute("data-view"));});});
document.querySelectorAll("[data-jump]").forEach(function(n){n.addEventListener("click",function(){switchView(n.getAttribute("data-jump"));});});
document.getElementById("playerChip").addEventListener("click",function(){switchView("party");});

function openModal(id){
  document.getElementById("modalBackdrop").classList.add("open");
  document.getElementById(id).classList.add("open");
}
function closeModals(){
  document.getElementById("modalBackdrop").classList.remove("open");
  document.querySelectorAll(".modal.open").forEach(function(x){x.classList.remove("open");});
}
document.querySelectorAll("[data-close]").forEach(function(b){b.addEventListener("click",closeModals);});
document.getElementById("modalBackdrop").addEventListener("click",closeModals);

document.getElementById("openLog").addEventListener("click",function(){document.getElementById("eventDrawer").classList.add("open");document.getElementById("drawerBackdrop").classList.add("open");});
function closeLog(){document.getElementById("eventDrawer").classList.remove("open");document.getElementById("drawerBackdrop").classList.remove("open");}
document.getElementById("closeLog").addEventListener("click",closeLog);document.getElementById("drawerBackdrop").addEventListener("click",closeLog);

document.getElementById("editParty").addEventListener("click",function(){
  document.getElementById("partyNameInput").value=S.party.name;
  document.getElementById("partyShortInput").value=S.party.short;
  document.getElementById("partySloganInput").value=S.party.slogan;
  document.getElementById("partyColorInput").value=S.party.color;
  openModal("partyModal");
});
document.getElementById("saveParty").addEventListener("click",function(){
  S.party.name=document.getElementById("partyNameInput").value.trim()||S.party.name;
  S.party.short=document.getElementById("partyShortInput").value.trim()||S.party.short;
  S.party.slogan=document.getElementById("partySloganInput").value.trim()||S.party.slogan;
  S.party.color=document.getElementById("partyColorInput").value||S.party.color;
  logEvent("Партия","Исполком утвердил обновлённую идентичность партии.");
  closeModals();renderAll();
});

function renderCongress(){
  document.getElementById("congressChoices").innerHTML=leaderOptions.map(function(c){
    return '<label class="candidate-card"><input type="radio" name="leaderChoice" value="'+esc(c.name)+'" '+(c.name===S.party.leader?"checked":"")+'><div class="circle">'+initials(c.name)+'</div><div><b>'+esc(c.name)+'</b><small>'+esc(c.desc)+'</small></div><strong>'+c.pop+'%</strong></label>';
  }).join("");
}
document.getElementById("partyCongress").addEventListener("click",function(){renderCongress();openModal("congressModal");});
document.getElementById("runCongress").addEventListener("click",function(){
  var ch=document.querySelector('input[name="leaderChoice"]:checked');if(!ch)return;
  var info=leaderOptions.find(function(x){return x.name===ch.value;});S.party.leader=ch.value;S.party.leaderPopularity=info.pop;
  if(!S.presidentElection.round1){S.party.candidate=ch.value;S.party.candidatePopularity=info.pop;}
  S.party.organization=clamp(S.party.organization-2,20,100);
  logEvent("Партийный съезд",ch.value+" избран председателем партии.");
  closeModals();renderAll();
});

document.querySelectorAll("[data-platform]").forEach(function(sl){
  sl.addEventListener("input",function(){var k=sl.getAttribute("data-platform");S.party.platform[k]=Number(sl.value);save();renderParty();renderOverview();renderElections();});
});

var actionCost={recruit:.25,office:.6,press:.7,rally:.9,canvass:.4};
document.querySelectorAll(".party-action").forEach(function(b){b.addEventListener("click",function(){
  var a=b.getAttribute("data-action");
  if(a==="fundraise"){var gained=2.3+Math.random()*1.8;S.party.funds+=gained;S.party.momentum+=.4;logEvent("Сбор средств","Партия собрала "+money(gained)+".");renderAll();return;}
  var cost=actionCost[a]||0;if(S.party.funds<cost){toast("Недостаточно средств в партийной кассе.");return;}S.party.funds-=cost;
  if(a==="recruit"){S.party.members+=4500;S.party.volunteers+=800;S.party.organization+=1;logEvent("Партийный аппарат","Набраны новые члены и активисты.");}
  if(a==="office"){S.party.organization+=2.4;S.party.campaign+=.08;logEvent("Партийный аппарат","Открыт новый местный штаб.");}
  if(a==="press"){S.party.recognition+=1.7;S.party.campaign+=.14;logEvent("Кампания","Партия провела пресс-кампанию.");}
  if(a==="rally"){S.party.momentum+=2;S.party.campaign+=.28;S.party.volunteers+=250;logEvent("Кампания","Проведён большой митинг.");}
  if(a==="canvass"){S.party.organization+=1;S.party.campaign+=.18;S.party.volunteers+=500;logEvent("Кампания","Активисты провели поквартирную агитацию.");}
  S.party.organization=clamp(S.party.organization,20,100);S.party.recognition=clamp(S.party.recognition,20,100);S.party.momentum=clamp(S.party.momentum,0,100);
  renderAll();
});});

document.querySelectorAll("[data-election-tab]").forEach(function(b){b.addEventListener("click",function(){
  document.querySelectorAll("[data-election-tab]").forEach(function(x){x.classList.remove("active");});b.classList.add("active");
  document.querySelectorAll(".election-panel").forEach(function(x){x.classList.remove("active");});
  document.getElementById("election-"+b.getAttribute("data-election-tab")).classList.add("active");
});});

function runParliamentElection(auto){
  if(S.parliamentElection.done&&!auto){toast("Парламентские выборы уже проведены.");return;}
  var arr=parliamentProjection().map(function(p){var x=Object.assign({},p);x.share+=((Math.random()-.5)*2.4)+(p.id==="lib"?S.party.momentum*.015:0);return x;});
  normalizeShares(arr);arr=allocateSeats(arr,250);
  S.parliamentElection.done=true;S.parliamentElection.results=arr;
  arr.forEach(function(r){var p=S.parties.find(function(x){return x.id===r.id;});p.seats=r.seats;p.share=r.share;});
  S.coalition=[];S.party.status=partySeats()>=126?"Парламентское большинство":"Переговоры о коалиции";
  logEvent("Парламентские выборы",S.party.name+" получила "+partySeats()+" мест из 250.");
  renderAll();
}
document.getElementById("runParlElection").addEventListener("click",function(){runParliamentElection(false);});

document.getElementById("formCoalition").addEventListener("click",function(){
  var seats=coalitionSeats();
  if(seats<126){document.getElementById("coalitionMessage").innerHTML='<span class="bad">Недостаточно мест: '+seats+'/250.</span>';return;}
  var difficulty=S.coalition.indexOf("soc")>=0&&S.coalition.indexOf("agr")>=0;
  var success=!difficulty||Math.random()>.4;
  if(success){S.party.status=S.coalition.length?"Правящая коалиция":"Парламентское большинство";document.getElementById("coalitionMessage").innerHTML='<span class="good">Соглашение заключено. '+seats+' мест.</span>';logEvent("Коалиция","Сформировано парламентское большинство на "+seats+" мест.");}
  else{document.getElementById("coalitionMessage").innerHTML='<span class="bad">Переговоры провалились: партнёры не согласовали программу.</span>';logEvent("Коалиция","Переговоры о большинстве сорвались.");}
  renderAll();
});

document.getElementById("nominateCandidate").addEventListener("click",function(){
  var el=document.querySelector(".candidate-card.selected");if(!el){toast("Выберите кандидата.");return;}
  var name=el.getAttribute("data-candidate"),pop=Number(el.getAttribute("data-pop"));
  S.party.candidate=name;S.party.candidatePopularity=pop;S.presidentElection.stage="nomination";
  logEvent("Президентские выборы",S.party.name+" официально выдвинула кандидата "+name+".");renderAll();
});
document.querySelectorAll("[data-pres-action]").forEach(function(b){b.addEventListener("click",function(){
  var a=b.getAttribute("data-pres-action");
  if(a==="endorsement"){S.party.presBoost+=1.1;S.party.momentum+=.6;logEvent("Президентская кампания","Кандидат получил поддержку нескольких влиятельных политиков.");}
  else{var cost=a==="tour"?.8:.5;if(S.party.funds<cost){toast("Недостаточно партийных средств.");return;}S.party.funds-=cost;S.party.presBoost+=a==="tour"?1.1:.8;S.party.momentum+=a==="tour"?1.4:.8;logEvent("Президентская кампания",a==="tour"?"Кандидат завершил тур по стране.":"Кандидат успешно выступил на дебатах.");}
  renderAll();
});});

function runPresidentRound1(auto){
  if(S.presidentElection.round1&&!auto){toast("Первый тур уже проведён.");return;}
  var player=presidentPoll();
  var arr=[
    {name:S.party.candidate,party:S.party.name,player:true,share:player},
    {name:"Адела Нор",party:"Консерваторы",share:33+(Math.random()-.5)*1.8},
    {name:"Иво Марен",party:"Социалисты",share:24+(Math.random()-.5)*1.5},
    {name:"Грета Фаль",party:"Аграрии",share:10+(Math.random()-.5)},
    {name:"Прочие",party:"Прочие",share:4}
  ];
  normalizeShares(arr);arr.sort(function(a,b){return b.share-a.share;});
  var me=arr.find(function(x){return x.player;}),top2=arr.slice(0,2);
  S.presidentElection.round1={all:arr,player:me.share,top2:top2};
  var winner=arr[0];
  if(winner.share>=50){
    S.presidentElection.stage=winner.player?"wonRound1":"lost";
    if(winner.player){S.presidentElection.pendingInauguration=true;logEvent("Президентские выборы",S.party.candidate+" победил уже в первом туре с "+winner.share.toFixed(1)+"%.");}
    else logEvent("Президентские выборы","Президент избран в первом туре; кандидат вашей партии проиграл.");
  }else if(top2.some(function(x){return x.player;})){
    S.presidentElection.stage="runoff";
    logEvent("Президентские выборы",S.party.candidate+" прошёл во второй тур с "+me.share.toFixed(1)+"%. Второй тур назначен на 29 июня.");
    toast("Первый тур завершён. ВТОРОЙ ТУР ДОСТУПЕН.");
  }else{
    S.presidentElection.stage="eliminated";
    logEvent("Президентские выборы",S.party.candidate+" выбыл после первого тура с "+me.share.toFixed(1)+"%.");
  }
  renderAll();
}
function runPresidentRound2(auto){
  if(S.presidentElection.stage!=="runoff"){if(!auto)toast("Второй тур недоступен.");return;}
  if(S.presidentElection.round2&&!auto){toast("Второй тур уже проведён.");return;}
  var top2=S.presidentElection.round1.top2,op=top2.find(function(x){return !x.player;}),me=top2.find(function(x){return x.player;});
  var score=50+(me.share-op.share)*.38+S.party.momentum*.10+S.party.organization*.02+S.party.presBoost*.18-1;
  var actual=clamp(score+(Math.random()-.5)*4.2,35,65);
  var win=actual>=50;
  S.presidentElection.round2={player:actual,opponent:100-actual,opponentName:op.name,win:win};
  S.presidentElection.stage=win?"awaitingInauguration":"lost";
  S.presidentElection.pendingInauguration=win;
  if(win)logEvent("Президентские выборы",S.party.candidate+" победил во втором туре: "+actual.toFixed(1)+"% против "+(100-actual).toFixed(1)+"%.");
  else logEvent("Президентские выборы",S.party.candidate+" проиграл второй тур: "+actual.toFixed(1)+"%.");
  renderAll();
}
function inaugurate(){
  if(!S.presidentElection.pendingInauguration){toast("Нет избранного кандидата для инаугурации.");return;}
  S.presidentElection.currentPresident=S.party.candidate;S.presidentElection.currentPresidentParty=S.party.name;S.presidentElection.pendingInauguration=false;S.presidentElection.stage="office";
  if(S.party.candidate===S.party.leader)logEvent("Инаугурация","Ваш лидер "+S.party.leader+" вступил в должность президента Республики.");
  else logEvent("Инаугурация",S.party.candidate+" вступил в должность президента от "+S.party.name+".");
  renderAll();
}
document.getElementById("runPresRound1").addEventListener("click",function(){runPresidentRound1(false);});
document.getElementById("runPresRound2").addEventListener("click",function(){runPresidentRound2(false);});
document.getElementById("inaugurateBtn").addEventListener("click",inaugurate);

document.getElementById("openAmendment").addEventListener("click",function(){
  var select=document.getElementById("amendmentArticle");select.innerHTML=S.bill.articles.map(function(a,i){return '<option value="'+i+'">Статья '+(i+1)+'</option>';}).join("");
  openModal("amendmentModal");
});
document.getElementById("applyAmendment").addEventListener("click",function(){
  var mode=document.getElementById("amendmentMode").value,idx=Number(document.getElementById("amendmentArticle").value),text=document.getElementById("amendmentText").value.trim();
  if(mode==="replace"&&S.bill.articles[idx])S.bill.articles[idx]=text||S.bill.articles[idx];
  if(mode==="delete"&&S.bill.articles[idx])S.bill.articles.splice(idx,1);
  if(mode==="add")S.bill.articles.push(text||"Дополнительная норма.");
  S.bill.negotiationBonus+=3;logEvent("Парламент","В законопроект внесена поправка.");closeModals();renderAll();
});
document.getElementById("negotiateBill").addEventListener("click",function(){S.bill.negotiationBonus=clamp(S.bill.negotiationBonus+8,0,40);logEvent("Парламент","Фракция провела переговоры с партнёрами. Прогноз голосования улучшился.");renderAll();});
document.getElementById("voteBill").addEventListener("click",function(){
  if(S.bill.voted){toast("Голосование уже состоялось.");return;}
  var yes=clamp(Math.round(92+coalitionSeats()*.22+S.bill.negotiationBonus+(Math.random()-.5)*10),60,200);
  S.bill.voted=true;S.bill.stage=yes>=126?"принят парламентом":"отклонён";
  logEvent("Голосование",yes>=126?S.bill.title+" принят: "+yes+" голосов за.":S.bill.title+" отклонён: "+yes+" голосов за.");
  renderAll();
});

document.getElementById("openIdentity").addEventListener("click",function(){
  document.getElementById("newStateName").value=S.country.name;document.getElementById("newStateShort").value=S.country.short;document.getElementById("newStateForm").value=S.country.form;document.getElementById("newStateMotto").value=S.country.motto;openModal("identityModal");
});
var uploadedFlag="";
document.getElementById("newFlagFile").addEventListener("change",function(e){
  var f=e.target.files&&e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(){uploadedFlag=String(r.result);};r.readAsDataURL(f);
});
document.getElementById("applyIdentity").addEventListener("click",function(){
  var support=coalitionSeats()+Math.round((Math.random()-.5)*18);
  if(support<126){toast("Реформа не получила большинства в парламенте: "+support+" голосов.");return;}
  S.country.name=document.getElementById("newStateName").value.trim()||S.country.name;
  S.country.short=document.getElementById("newStateShort").value.trim()||S.country.short;
  S.country.form=document.getElementById("newStateForm").value.trim()||S.country.form;
  S.country.motto=document.getElementById("newStateMotto").value.trim()||S.country.motto;
  if(uploadedFlag)S.country.flagData=uploadedFlag;
  logEvent("Государственная реформа","Парламент утвердил новую государственную идентичность: "+S.country.name+".");
  closeModals();renderAll();
});
document.getElementById("openCurrency").addEventListener("click",function(){
  document.getElementById("newCurrencyName").value=S.currency.name;document.getElementById("newCurrencySymbol").value=S.currency.symbol;document.getElementById("newCurrencyType").value=S.currency.type;document.getElementById("newCurrencySilver").value=S.currency.silver;openModal("currencyModal");
});
document.getElementById("applyCurrency").addEventListener("click",function(){
  var support=coalitionSeats()+Math.round((Math.random()-.5)*16);if(support<126){toast("Денежная реформа не прошла парламент.");return;}
  var oldSilver=S.currency.silver,newSilver=Number(document.getElementById("newCurrencySilver").value)||0;
  S.currency.name=document.getElementById("newCurrencyName").value.trim()||S.currency.name;S.currency.symbol=document.getElementById("newCurrencySymbol").value.trim()||S.currency.symbol;S.currency.type=document.getElementById("newCurrencyType").value;S.currency.silver=newSilver;
  if(newSilver<oldSilver*.75)S.currency.trust=clamp(S.currency.trust-8,20,100);else S.currency.trust=clamp(S.currency.trust+1,20,100);
  logEvent("Денежная реформа","Введены новые параметры валюты «"+S.currency.name+"».");
  closeModals();renderAll();
});

document.querySelectorAll(".province").forEach(function(p){p.addEventListener("click",function(){
  document.querySelectorAll(".province").forEach(function(x){x.classList.remove("selected");});p.classList.add("selected");S.selectedProvince=p.getAttribute("data-province");save();renderProvince();
});});
document.querySelectorAll("[data-map-layer]").forEach(function(b){b.addEventListener("click",function(){
  document.querySelectorAll("[data-map-layer]").forEach(function(x){x.classList.remove("active");});b.classList.add("active");
  document.getElementById("resourceOverlay").classList.toggle("hidden",b.getAttribute("data-map-layer")!=="resources");
  document.getElementById("roadOverlay").classList.toggle("hidden",b.getAttribute("data-map-layer")!=="roads");
});});
document.getElementById("investInfra").addEventListener("click",function(){
  var p=S.provinces[S.selectedProvince];if(p.owner!==S.country.name){toast("Нельзя напрямую инвестировать в чужую провинцию.");return;}if(S.stateEconomy.treasury<3){toast("Недостаточно средств.");return;}S.stateEconomy.treasury-=3;p.infra=clamp(p.infra+3,0,100);logEvent("Инфраструктура","Одобрены вложения в "+S.selectedProvince+".");renderAll();
});
document.getElementById("surveyProvince").addEventListener("click",function(){
  var p=S.provinces[S.selectedProvince];if(S.stateEconomy.treasury<1){toast("Недостаточно средств.");return;}S.stateEconomy.treasury-=1;p.surveyed=true;if(p.resources==="неизвестно")p.resources=choose(["угольный бассейн","железная руда","торф","медь","лесные ресурсы","значимых залежей не найдено"]);logEvent("Геологоразведка","Завершено обследование: "+S.selectedProvince+".");renderAll();
});

(function mapInteraction(){
  var stage=document.getElementById("mapStage"),svg=document.getElementById("mapSvg"),world=document.getElementById("mapWorld"),scale=1,tx=0,ty=0,drag=false,sx=0,sy=0,stx=0,sty=0;
  function apply(){world.setAttribute("transform","translate("+tx+" "+ty+") scale("+scale+")");}
  stage.addEventListener("wheel",function(e){e.preventDefault();scale=clamp(scale*(e.deltaY<0?1.12:.89),.8,4);apply();},{passive:false});
  stage.addEventListener("pointerdown",function(e){drag=true;sx=e.clientX;sy=e.clientY;stx=tx;sty=ty;stage.setPointerCapture(e.pointerId);});
  stage.addEventListener("pointermove",function(e){if(!drag)return;var box=stage.getBoundingClientRect();tx=stx+(e.clientX-sx)*(1000/box.width);ty=sty+(e.clientY-sy)*(560/box.height);apply();});
  stage.addEventListener("pointerup",function(){drag=false;});
  document.getElementById("mapReset").addEventListener("click",function(){scale=1;tx=0;ty=0;apply();});
})();

function monthTick(){
  S.stateEconomy.treasury+=S.stateEconomy.balance;
  S.stateEconomy.industry=clamp(S.stateEconomy.industry+.3+(Math.random()-.5)*.2,70,180);
  S.stateEconomy.inflation=clamp(S.stateEconomy.inflation+(Math.random()-.5)*.14,.2,25);
  S.stateEconomy.gdp*=1+(S.stateEconomy.growth/100/12);
  S.market.forEach(function(x){
    var pressure=(x.demand-x.supply)/100;
    x.price=clamp(x.price*(1+pressure*.035+(Math.random()-.5)*.01),.2,999);
    x.supply=clamp(x.supply+(Math.random()-.5)*6,50,150);x.demand=clamp(x.demand+(Math.random()-.5)*6,50,150);
  });
  S.science.electricity=clamp(S.science.electricity+.7,0,100);
  logEvent("Месячный отчёт","Казна "+billions(S.stateEconomy.treasury)+", инфляция "+S.stateEconomy.inflation.toFixed(1)+"%, промышленность "+S.stateEconomy.industry.toFixed(1)+".");
}
function checkScheduled(){
  var d=now();
  if(!S.parliamentElection.done&&d>=parseDate(S.parliamentElection.date))runParliamentElection(true);
  if(!S.presidentElection.round1&&d>=parseDate(S.presidentElection.date))runPresidentRound1(true);
  if(S.presidentElection.stage==="runoff"&&!S.presidentElection.round2&&d>=parseDate(S.presidentElection.round2Date))runPresidentRound2(true);
}
function advanceDays(n){
  for(var i=0;i<n;i++){
    var d=now(),oldMonth=d.getUTCMonth();d.setUTCDate(d.getUTCDate()+1);S.date=isoDate(d);
    if(d.getUTCMonth()!==oldMonth)monthTick();
    checkScheduled();
  }
  renderAll();
}
document.getElementById("stepDay").addEventListener("click",function(){S.speed=0;setSpeedButtons();advanceDays(1);});
document.getElementById("stepMonth").addEventListener("click",function(){S.speed=0;setSpeedButtons();advanceDays(30);});
function setSpeedButtons(){document.querySelectorAll("[data-speed]").forEach(function(b){b.classList.toggle("active",Number(b.getAttribute("data-speed"))===S.speed);});}
document.querySelectorAll("[data-speed]").forEach(function(b){b.addEventListener("click",function(){S.speed=Number(b.getAttribute("data-speed"));setSpeedButtons();save();});});
setInterval(function(){if(S.speed>0)advanceDays(S.speed);},1500);

document.getElementById("resetDemo").addEventListener("click",function(){
  if(!confirm("Сбросить весь прогресс функционального прототипа?"))return;
  localStorage.removeItem(KEY);location.reload();
});

document.addEventListener("keydown",function(e){if(e.key==="Escape"){closeModals();closeLog();}});

setSpeedButtons();
renderAll();
})();