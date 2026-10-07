/* ---------------- CUSTOM MINISTRY BUILDER ---------------- */
(() => {
  const overlay = document.getElementById('ministryBuilder');
  const openBtn = document.getElementById('openMinistryBuilder');
  const closeBtn = document.getElementById('closeMinistryBuilder');
  const cancelBtn = document.getElementById('cancelMinistryBuilder');
  const submitBtn = document.getElementById('submitMinistryBill');
  const resultDone = document.getElementById('resultDone');

  const nameInput = document.getElementById('ministryName');
  const descInput = document.getElementById('ministryDesc');
  const budgetInput = document.getElementById('ministryBudget');
  const sizeInput = document.getElementById('ministrySize');
  const compInputs = [...document.querySelectorAll('.ministry-comp')];

  const effectsEl = document.getElementById('ministryEffects');
  const budgetReadout = document.getElementById('budgetReadout');

  const yesEl = document.getElementById('ministryYes');
  const yesSmallEl = document.getElementById('ministryYesSmall');
  const undEl = document.getElementById('ministryUnd');
  const noEl = document.getElementById('ministryNo');
  const yesBar = document.getElementById('ministryYesBar');
  const undBar = document.getElementById('ministryUndBar');
  const noBar = document.getElementById('ministryNoBar');
  const supportNote = document.getElementById('ministrySupportNote');

  const formView = document.getElementById('builderFormView');
  const resultView = document.getElementById('builderResult');
  const footer = document.getElementById('builderFooter');

  const effectMap = {
    science: {
      title:'Научная координация',
      text:'Скорость накопления исследовательского потенциала +4%; вероятность появления прикладных открытий немного выше.',
      cls:'goodfx',
      support:4
    },
    statistics: {
      title:'Качество государственной статистики',
      text:'Точность экономических и демографических оценок +12%; меньше диапазон неопределённости прогнозов.',
      cls:'goodfx',
      support:2
    },
    industry: {
      title:'Промышленная координация',
      text:'Эффективность отраслевых программ +6%, но пересечение полномочий с Министерством торговли создаёт бюрократические издержки.',
      cls:'cost',
      support:-2
    },
    labor: {
      title:'Трудовая администрация',
      text:'Скорость разрешения трудовых споров +10%; эффективность фабричных инспекций +8%.',
      cls:'goodfx',
      support:3
    },
    education: {
      title:'Подготовка специалистов',
      text:'Рост квалифицированной рабочей силы ускоряется; технологическое освоение предприятий +3%.',
      cls:'goodfx',
      support:5
    },
    infrastructure: {
      title:'Инфраструктурное планирование',
      text:'Срок подготовки крупных государственных строек −8%, но возникает конфликт полномочий с общественными работами.',
      cls:'cost',
      support:1
    },
    trade: {
      title:'Торговая администрация',
      text:'Скорость заключения торговых соглашений +6%; эффективность таможенного администрирования +4%.',
      cls:'goodfx',
      support:1
    },
    health: {
      title:'Санитарная администрация',
      text:'Эффективность борьбы с эпидемиями +8%; городская смертность в кризисах немного ниже.',
      cls:'goodfx',
      support:4
    }
  };

  const sizeData = {
    small:{staff:1900, bureaucracy:2, support:4, cost:0},
    medium:{staff:4800, bureaucracy:5, support:0, cost:3},
    large:{staff:9800, bureaucracy:10, support:-7, cost:8}
  };

  let lastProjection = {yes:143,und:27,no:80};

  function selectedComps(){
    return compInputs.filter(x => x.checked).map(x => x.value);
  }

  function projection(){
    const comps = selectedComps();
    const budget = Number(budgetInput.value);
    const size = sizeData[sizeInput.value];

    let yes = 136 + size.support;
    comps.forEach(c => yes += effectMap[c]?.support || 0);

    // Wider and more expensive ministries are harder to pass.
    if (comps.length > 3) yes -= (comps.length - 3) * 4;
    yes -= Math.max(0, Math.round((budget - 12) * 0.75));

    // Very small budget can also reduce support because the ministry looks symbolic.
    if (budget < 6) yes -= 5;

    yes = Math.max(72, Math.min(182, yes));
    let undecided = Math.max(12, 35 - Math.floor(Math.abs(yes - 126) / 4));
    let no = 250 - yes - undecided;
    if (no < 0) { no = 0; undecided = 250 - yes; }

    return {yes,und:undecided,no};
  }

  function updateEffects(){
    const comps = selectedComps();
    const budget = Number(budgetInput.value);
    const size = sizeData[sizeInput.value];

    budgetReadout.textContent = `₳ ${budget} млн / год`;

    let html = '';
    if (!comps.length){
      html += `<div class="effect-item cost"><b>Нет полномочий</b>Министерство не сможет влиять на симуляцию, пока ему не передано хотя бы одно направление.</div>`;
    } else {
      comps.forEach(c => {
        const e = effectMap[c];
        html += `<div class="effect-item ${e.cls}"><b>${e.title}</b>${e.text}</div>`;
      });
    }

    html += `<div class="effect-item cost"><b>Содержание аппарата</b>Около ${size.staff.toLocaleString('ru-RU')} служащих. Бюрократическая нагрузка +${size.bureaucracy}. Годовой бюджет: ₳ ${budget} млн.</div>`;

    if (comps.length >= 5){
      html += `<div class="effect-item cost"><b>Слишком широкие полномочия</b>Крупное пересечение функций снижает административную эффективность на 6%.</div>`;
    }

    effectsEl.innerHTML = html;

    lastProjection = projection();
    const {yes,und,no} = lastProjection;
    yesEl.textContent = yes;
    yesSmallEl.textContent = yes;
    undEl.textContent = und;
    noEl.textContent = no;
    yesBar.style.width = (yes/250*100) + '%';
    undBar.style.width = (und/250*100) + '%';
    noBar.style.width = (no/250*100) + '%';

    const margin = yes - 126;
    supportNote.innerHTML = yes >= 126
      ? `<b class="good">Проект имеет большинство.</b> Прогнозируемый запас: ${margin} голосов.`
      : `<b class="bad">Большинства пока нет.</b> Не хватает ${Math.abs(margin)} голосов. Сократите бюджет или полномочия, либо ищите поддержку фракций.`;

    renderMiniVote(yes,und,no);
  }

  function renderMiniVote(yes,und,no){
    const layer = document.getElementById('ministryVoteSeats');
    const NS = 'http://www.w3.org/2000/svg';
    layer.innerHTML = '';

    const total = 250;
    const cx = 260, cy = 160;
    const rows = 7;
    const innerR = 58, outerR = 145;
    const radii = Array.from({length:rows},(_,i)=>innerR+(outerR-innerR)*(i/(rows-1)));
    const weightSum = radii.reduce((a,b)=>a+b,0);
    const counts = radii.map(r=>Math.max(8,Math.floor(total*r/weightSum)));

    let used = counts.reduce((a,b)=>a+b,0);
    let k = rows-1;
    while(used < total){ counts[k]++; used++; k--; if(k<0)k=rows-1; }
    k = 0;
    while(used > total){
      if(counts[k] > 8){counts[k]--;used--;}
      k++; if(k>=rows)k=0;
    }

    let positions=[];
    counts.forEach((count,rowIndex)=>{
      const r=radii[rowIndex];
      for(let i=0;i<count;i++){
        const t=count===1?.5:i/(count-1);
        const angle=Math.PI-.08-t*(Math.PI-.16);
        positions.push({x:cx+r*Math.cos(angle),y:cy-r*Math.sin(angle),angle,r});
      }
    });
    positions.sort((a,b)=>Math.abs(a.angle-b.angle)>.01?b.angle-a.angle:a.r-b.r);

    positions.forEach((p,i)=>{
      const c=document.createElementNS(NS,'circle');
      c.setAttribute('class','builder-vote-seat');
      c.setAttribute('cx',p.x.toFixed(2));
      c.setAttribute('cy',p.y.toFixed(2));
      c.setAttribute('r','3.5');
      c.setAttribute('fill', i<yes ? '#587a65' : i<yes+und ? '#aa915c' : '#a55d57');
      layer.appendChild(c);
    });
  }

  function open(){
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
    formView.style.display = 'grid';
    resultView.classList.remove('show');
    footer.style.display = 'flex';
    updateEffects();
  }

  function close(){
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden','true');
  }

  function hashNoise(str){
    let h=0;
    for(let i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))|0;
    return (Math.abs(h)%11)-5; // -5..+5
  }

  function createMinistryCard(){
    const name = nameInput.value.trim() || 'Новое министерство';
    const budget = Number(budgetInput.value);
    const size = sizeData[sizeInput.value];
    const comps = selectedComps();
    const mainTask = comps.length ? effectMap[comps[0]].title : 'не определена';

    const card = document.createElement('div');
    card.className = 'panel ministry-card custom-ministry';
    card.innerHTML = `
      <div class="ministry-title"><div class="iconbox">✦</div><b>${escapeHtml(name)}</b></div>
      <div class="rowline"><span>Бюджет ведомства</span><b>₳ ${budget.toFixed(1)} млн</b></div>
      <div class="rowline"><span>Служащие</span><b>${size.staff.toLocaleString('ru-RU')}</b></div>
      <div class="rowline"><span>Полномочий</span><b>${comps.length}</b></div>
      <div class="rowline"><span>Главная задача</span><b>${escapeHtml(mainTask)}</b></div>
    `;
    document.getElementById('ministryGrid').appendChild(card);
  }

  function escapeHtml(s){
    return s.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }

  function vote(){
    const comps = selectedComps();
    if (!nameInput.value.trim()){
      nameInput.focus();
      return;
    }
    if (!comps.length){
      supportNote.innerHTML = `<b class="bad">Нельзя внести проект:</b> у министерства нет ни одного полномочия.`;
      return;
    }

    const projected = projection();
    let yes = Math.max(0, Math.min(250, projected.yes + hashNoise(nameInput.value)));
    let und = Math.max(8, projected.und + hashNoise(descInput.value) % 4);
    if (yes + und > 250) und = 250 - yes;
    let no = 250 - yes - und;

    const passed = yes >= 126;

    document.getElementById('resultYes').textContent = yes;
    document.getElementById('resultUnd').textContent = und;
    document.getElementById('resultNo').textContent = no;

    const title = document.getElementById('builderResultTitle');
    const body = document.getElementById('builderResultText');

    if (passed){
      title.textContent = 'Закон принят';
      title.className = 'good';
      body.innerHTML = `Парламент большинством голосов учредил <b>${escapeHtml(nameInput.value.trim())}</b>. После опубликования закона ведомство начинает формировать аппарат и получает выбранные полномочия.`;
      createMinistryCard();
    } else {
      title.textContent = 'Закон отклонён';
      title.className = 'bad';
      body.innerHTML = `Проект об учреждении <b>${escapeHtml(nameInput.value.trim())}</b> не получил необходимого большинства. Его можно переработать и внести снова.`;
    }

    formView.style.display = 'none';
    resultView.classList.add('show');
    footer.style.display = 'none';

    resultDone.dataset.passed = passed ? '1' : '0';
  }

  [budgetInput,sizeInput,...compInputs].forEach(el=>el.addEventListener('input',updateEffects));
  nameInput.addEventListener('input',updateEffects);

  openBtn?.addEventListener('click',open);
  closeBtn?.addEventListener('click',close);
  cancelBtn?.addEventListener('click',close);
  submitBtn?.addEventListener('click',vote);

  overlay.addEventListener('click',e=>{
    if(e.target===overlay) close();
  });

  resultDone?.addEventListener('click',()=>{
    const passed = resultDone.dataset.passed === '1';
    close();
    if(!passed){
      // Reopen the editor state next time; user can adjust and try again.
      formView.style.display = 'grid';
      resultView.classList.remove('show');
      footer.style.display = 'flex';
    }
  });

  updateEffects();
})();

/* ---------------- V10: GAME CLOCK ---------------- */
(() => {
  const state = window.MandatePrototypeState = window.MandatePrototypeState || {
    date: new Date(Date.UTC(1848,2,14)), speed:1, accumulator:0, dayCounter:0,
    treasury:1240, monthlyBalance:12.8, industry:112, inflation:3.8,
    notifications:[], unread:0, fired:{}, research:62
  };
  const dateLabel=document.getElementById('gameDateLabel');
  const eraLabel=document.getElementById('gameEraLabel');
  const treasuryEl=document.getElementById('treasuryValue');
  const balanceEl=document.getElementById('budgetBalanceValue');
  const industryEl=document.getElementById('industryIndexValue');
  const inflationEl=document.getElementById('inflationValue');
  const badge=document.getElementById('notificationBadge');
  const monthNames=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const weekday=['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  function fmtDate(d){return `${d.getUTCDate()} ${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`;}
  function renderClock(){
    dateLabel.textContent=fmtDate(state.date);
    eraLabel.textContent=`${weekday[state.date.getUTCDay()]} · ранняя индустриализация`;
    treasuryEl.textContent=`₳ ${(state.treasury/1000).toFixed(2)} млрд`;
    balanceEl.textContent=`${state.monthlyBalance>=0?'+':''}₳ ${state.monthlyBalance.toFixed(1)} млн`;
    industryEl.textContent=state.industry.toFixed(1).replace('.0','');
    inflationEl.textContent=state.inflation.toFixed(1)+'%';
    badge.textContent=state.unread>99?'99+':String(state.unread);
    badge.style.display=state.unread?'block':'none';
    const live=document.querySelector('.speed-caption');
    if(live) live.classList.toggle('paused',state.speed===0);
  }
  window.prototypeNotify=function(title,text){
    state.notifications.unshift({title,text,date:fmtDate(state.date),unread:true});
    state.unread++;
    renderClock();
    window.renderPrototypeNotifications?.();
  };
  function monthTick(){
    state.treasury += state.monthlyBalance;
    state.industry = Math.max(60,state.industry + 0.35 + Math.sin(state.dayCounter/43)*0.18);
    state.inflation = Math.max(0.2,state.inflation + Math.sin(state.dayCounter/31)*0.06);
    const p=document.getElementById('electricityProgress');
    if(p){const v=Math.min(100,(parseFloat(p.style.width)||state.research)+0.7);p.style.width=v+'%';state.research=v;}
    prototypeNotify('Месячный отчёт',`Казна: ₳ ${(state.treasury/1000).toFixed(2)} млрд · промышленный индекс ${state.industry.toFixed(1)} · инфляция ${state.inflation.toFixed(1)}%.`);
  }
  function scheduledEvents(){
    const key=`${state.date.getUTCFullYear()}-${state.date.getUTCMonth()+1}-${state.date.getUTCDate()}`;
    if(key==='1848-3-16'&&!state.fired.factoryVote){
      state.fired.factoryVote=true;
      const d=window.lawDataRef?.factory;
      const yes=d?.votes?.[0]??127;
      prototypeNotify('Голосование по фабричному закону',yes>=126?`Проект принят: ${yes} голосов «за».`:`Проект отклонён: только ${yes} голосов «за».`);
      showGlobalToast(yes>=126?'Фабричный закон принят парламентом.':'Фабричный закон не получил большинства.');
    }
    if(key==='1848-3-21'&&!state.fired.science){state.fired.science=true;prototypeNotify('Научная переписка','Академия сообщает об успешной серии опытов с проводниками. Исследования электричества получили новые данные.');const p=document.getElementById('electricityProgress');if(p)p.style.width=Math.min(100,(parseFloat(p.style.width)||62)+4)+'%';}
  }
  function advanceOneDay(){
    const oldMonth=state.date.getUTCMonth();
    state.date.setUTCDate(state.date.getUTCDate()+1);state.dayCounter++;
    scheduledEvents();
    if(state.date.getUTCMonth()!==oldMonth)monthTick();
    renderClock();
  }
  window.advancePrototypeDays=function(n){for(let i=0;i<n;i++)advanceOneDay();};
  const btns=[...document.querySelectorAll('.speed span[data-speed]')];
  function setSpeed(v){state.speed=Number(v);btns.forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===state.speed));const c=document.querySelector('.speed-caption');if(c)c.textContent=state.speed===0?'пауза':state.speed===1?'x1':state.speed===4?'x4':'x12';renderClock();}
  btns.forEach(btn=>btn.addEventListener('click',()=>setSpeed(btn.dataset.speed)));
  document.getElementById('stepDayBtn')?.addEventListener('click',()=>{setSpeed(0);advanceOneDay();});
  let last=performance.now();
  setInterval(()=>{const now=performance.now(),dt=(now-last)/1000;last=now;if(state.speed<=0)return;state.accumulator+=dt*state.speed;if(state.accumulator>=1){const days=Math.min(31,Math.floor(state.accumulator));state.accumulator-=days;window.advancePrototypeDays(days);}},250);
  state.notifications=[
    {title:'Кабинет',text:'На повестке дефицит угля и фабричный закон.',date:'14 марта 1848',unread:true},
    {title:'Наука',text:'Профессор Альбрехт просит государственный грант на электрические опыты.',date:'14 марта 1848',unread:true},
    {title:'Рынок',text:'Цена угля выросла на 21.8% за шесть месяцев.',date:'14 марта 1848',unread:true}
  ];state.unread=3;
  renderClock();
})();

/* ---------------- MODULE SUBTABS ---------------- */
document.querySelectorAll('.module-subnav[data-module]').forEach(nav => {
  nav.querySelectorAll('button[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      nav.querySelectorAll('button[data-view]').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');

      const page = nav.closest('.module-page');
      page.querySelectorAll('.module-view').forEach(v => v.classList.remove('active'));
      const target = document.getElementById(btn.dataset.view);
      if (target) target.classList.add('active');
    });
  });
});

/* ---------------- GOVERNMENT APPOINTMENTS ---------------- */
document.querySelectorAll('.office-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.office-item').forEach(x => x.classList.remove('active'));
    item.classList.add('active');
  });
});

/* ---------------- LAWS: selectable bills ---------------- */
let currentLawId = 'factory';
const lawData = {
  factory: {
    title: 'ЗАКОНОПРОЕКТ № 184',
    subtitle: 'О фабричном труде · редакция ко второму чтению',
    body: `
      <h3>Статья I. Продолжительность труда</h3>
      <p>Установить максимальную продолжительность рабочей недели на фабриках и мануфактурах в размере шестидесяти часов.</p>
      <h3>Статья II. Труд несовершеннолетних</h3>
      <p>Запретить наём детей младше десяти лет на промышленные предприятия. Для работников от десяти до четырнадцати лет установить сокращённый рабочий день.</p>
      <h3>Статья III. Фабричные инспекции</h3>
      <p>Учредить при Министерстве внутренних дел корпус фабричных инспекторов с правом посещения предприятий, составления предписаний и передачи нарушений в суд.</p>
      <h3>Статья IV. Вступление в силу</h3>
      <p>Настоящий закон вступает в силу через шесть месяцев после официального опубликования.</p>`,
    votes:[127,29,94],
    impacts:[
      ['Расходы бизнеса','+2.8%','bad'],
      ['Доход рабочих','+1.4%','good'],
      ['Промышленный выпуск','−0.4…−1.2%','warn'],
      ['Бюджет','−₳ 1.8 млн','bad']
    ],
    confidence:'низкая'
  },
  tax: {
    title: 'ЗАКОНОПРОЕКТ № 281',
    subtitle: 'О налогообложении промышленных предприятий · комитет',
    body: `
      <h3>Статья I. Общая ставка</h3>
      <p>Установить налог на прибыль промышленных предприятий в размере четырнадцати процентов.</p>
      <h3>Статья II. Малые предприятия</h3>
      <p>Для предприятий с числом работников менее пятидесяти человек установить льготную ставку восемь процентов.</p>
      <h3>Статья III. Инвестиционный вычет</h3>
      <p>Допустить вычет до двадцати пяти процентов капитальных расходов на новое производственное оборудование.</p>`,
    votes:[112,51,87],
    impacts:[
      ['Доходы бюджета','+₳ 24–31 млн','good'],
      ['Частные инвестиции','−0.8…+0.4%','warn'],
      ['Прибыль бизнеса','−3.1%','bad'],
      ['Налоговая нагрузка','+1.7 п.п.','bad']
    ],
    confidence:'средняя'
  },
  rail: {
    title: 'ЗАКОНОПРОЕКТ № 203',
    subtitle: 'О железнодорожных концессиях · первое чтение',
    body: `
      <h3>Статья I. Концессии</h3>
      <p>Разрешить правительству заключать с частными обществами концессионные соглашения на строительство и эксплуатацию железных дорог.</p>
      <h3>Статья II. Государственные гарантии</h3>
      <p>Кабинет вправе гарантировать до сорока процентов стоимости облигационного займа стратегически значимых линий.</p>
      <h3>Статья III. Отчуждение земель</h3>
      <p>Установить судебный порядок выкупа земель, необходимых для прокладки путей.</p>`,
    votes:[148,34,68],
    impacts:[
      ['Частные инвестиции','+₳ 38–62 млн','good'],
      ['Государственные риски','+₳ 22 млн','warn'],
      ['Строительство дорог','+18%','good'],
      ['Спрос на сталь','+9%','warn']
    ],
    confidence:'средняя'
  },
  school: {
    title: 'ЗАКОНОПРОЕКТ № 196',
    subtitle: 'О начальном образовании · бюджетный комитет',
    body: `
      <h3>Статья I. Государственные школы</h3>
      <p>Учредить сеть начальных школ в каждом округе с населением свыше десяти тысяч жителей.</p>
      <h3>Статья II. Финансирование</h3>
      <p>Расходы распределить между центральным бюджетом и местными советами в пропорции шестьдесят к сорока.</p>
      <h3>Статья III. Учительские семинарии</h3>
      <p>Создать три государственные семинарии для подготовки учителей.</p>`,
    votes:[139,43,68],
    impacts:[
      ['Расходы бюджета','−₳ 9.4 млн / год','bad'],
      ['Грамотность','+0.6 п.п. / год','good'],
      ['Квалификация труда','рост через 8–12 лет','good'],
      ['Налоги регионов','+₳ 4.1 млн','warn']
    ],
    confidence:'средняя'
  }
};

function updateLaw(id){
  currentLawId=id;
  const d = lawData[id];
  if (!d) return;
  document.getElementById('lawTitle').textContent = d.title;
  document.getElementById('lawSubtitle').textContent = d.subtitle;
  document.getElementById('lawBody').innerHTML = d.body;

  const [forVotes, undecided, against] = d.votes;
  const total = forVotes + undecided + against;
  document.getElementById('lawFor').textContent = forVotes;
  document.getElementById('lawUndecided').textContent = undecided;
  document.getElementById('lawAgainst').textContent = against;
  document.getElementById('lawForBar').style.width = (forVotes/total*100) + '%';
  document.getElementById('lawUndecidedBar').style.width = (undecided/total*100) + '%';
  document.getElementById('lawAgainstBar').style.width = (against/total*100) + '%';

  document.getElementById('lawImpacts').innerHTML = d.impacts.map(x =>
    `<div class="rowline"><span>${x[0]}</span><b class="${x[2]}">${x[1]}</b></div>`
  ).join('');
  document.getElementById('lawConfidence').textContent = d.confidence;
}

window.lawDataRef = lawData;
document.querySelectorAll('.law-item[data-law]').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.law-item[data-law]').forEach(x => x.classList.remove('active'));
    item.classList.add('active');
    updateLaw(item.dataset.law);
  });
});

const lawToast = document.getElementById('lawToast');
function showLawToast(msg){lawToast.textContent=msg;lawToast.classList.add('show');clearTimeout(window.__lawToastTimer);window.__lawToastTimer=setTimeout(()=>lawToast.classList.remove('show'),3000);}
document.querySelectorAll('.law-action').forEach(btn => {
  btn.addEventListener('click', () => {
    const action=btn.dataset.action;
    const d=lawData[currentLawId]; if(!d)return;
    if(action==='negotiate'){window.updateNegotiationPreview?.();openModal('negotiationBuilder');return;}
    if(action==='committee'){
      d.subtitle=d.subtitle.replace(/·.*/, '· возвращён в комитет');
      d.votes=[Math.min(180,d.votes[0]+4),Math.max(15,d.votes[1]-2),Math.max(0,d.votes[2]-2)];
      updateLaw(currentLawId);showLawToast('Проект возвращён в комитет. Срок рассмотрения сдвинут примерно на неделю.');prototypeNotify?.('Парламент',`${d.title}: проект возвращён в комитет для доработки.`);return;
    }
    if(action==='withdraw'){
      const item=document.querySelector(`.law-item[data-law="${currentLawId}"]`); if(item)item.remove();
      d.withdrawn=true;showLawToast('Правительство отозвало законопроект.');prototypeNotify?.('Парламент',`${d.title}: законопроект отозван.`);
      const next=document.querySelector('.law-item[data-law]');if(next){next.classList.add('active');updateLaw(next.dataset.law);}else{document.getElementById('lawBody').innerHTML='<p>Нет законопроектов на рассмотрении.</p>';}return;
    }
  });
});

/* ---------------- MAP: pan + zoom ---------------- */
(() => {
  const stage = document.getElementById('mapStage');
  const svg = document.getElementById('mapSvg');
  const world = document.getElementById('mapWorld');
  const zoomText = document.getElementById('zoomText');

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let dragging = false;
  let moved = false;
  let startX = 0, startY = 0;
  let startTx = 0, startTy = 0;

  const minScale = 0.65;
  const maxScale = 5;

  function applyTransform() {
    world.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})`);
    zoomText.textContent = Math.round(scale * 100) + '%';
  }

  function clientToSvg(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const inv = svg.getScreenCTM().inverse();
    return pt.matrixTransform(inv);
  }

  function zoomAt(clientX, clientY, factor) {
    const old = scale;
    const next = Math.max(minScale, Math.min(maxScale, old * factor));
    if (next === old) return;

    const p = clientToSvg(clientX, clientY);
    const worldX = (p.x - tx) / old;
    const worldY = (p.y - ty) / old;

    scale = next;
    tx = p.x - worldX * scale;
    ty = p.y - worldY * scale;
    applyTransform();
  }

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.14 : 1 / 1.14);
  }, { passive: false });

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    stage.classList.add('dragging');
    stage.setPointerCapture(e.pointerId);
    const p = clientToSvg(e.clientX, e.clientY);
    startX = p.x;
    startY = p.y;
    startTx = tx;
    startTy = ty;
  });

  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = clientToSvg(e.clientX, e.clientY);
    const dx = p.x - startX;
    const dy = p.y - startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    tx = startTx + dx;
    ty = startTy + dy;
    applyTransform();
  });

  function endDrag(e) {
    dragging = false;
    stage.classList.remove('dragging');
    try { stage.releasePointerCapture(e.pointerId); } catch {}
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  document.getElementById('zoomIn').addEventListener('click', (e) => {
    const r = stage.getBoundingClientRect();
    zoomAt(r.left + r.width/2, r.top + r.height/2, 1.22);
  });
  document.getElementById('zoomOut').addEventListener('click', (e) => {
    const r = stage.getBoundingClientRect();
    zoomAt(r.left + r.width/2, r.top + r.height/2, 1/1.22);
  });

  function resetMap(){
    scale = 1; tx = 0; ty = 0; applyTransform();
  }
  document.getElementById('resetMap').addEventListener('click', resetMap);
  stage.addEventListener('dblclick', (e) => { e.preventDefault(); resetMap(); });

  /* gameplay provinces */
  const regionData = {
    "Северный Норвен": ["Королевство Норвен","Северный регион","1.12 млн","Норвен","₳ 3.05 / день","61 / 100","лес, торф"],
    "Норвенское побережье": ["Королевство Норвен","Побережье","1.48 млн","Норвен-порт","₳ 3.24 / день","67 / 100","рыба, соль"],
    "Тернская провинция": ["Республика Аврелия","Северная Аурелия","1.34 млн","Терн","₳ 3.61 / день","72 / 100","уголь"],
    "Северная Аурелия": ["Республика Аврелия","Северная Аурелия","2.06 млн","Терн","₳ 3.91 / день","75 / 100","уголь, газ (признаки)"],
    "Эстельский край": ["Королевство Эстель","Северный Эстель","1.27 млн","Эстел","₳ 3.44 / день","69 / 100","железо"],
    "Западный рубеж": ["Королевство Норвен","Западный регион","0.82 млн","Фарн","₳ 2.87 / день","48 / 100","лес"],
    "Лиорская провинция": ["Республика Аврелия","Западная Аурелия","2.23 млн","Лиор","₳ 3.62 / день","71 / 100","железо, лес"],
    "Аурельская провинция": ["Республика Аврелия","Центральная Аурелия","2.84 млн","Аурель","₳ 4.18 / день","78 / 100","уголь, железо"],
    "Ровенская провинция": ["Республика Аврелия","Восточная Аурелия","1.93 млн","Ровен","₳ 3.54 / день","74 / 100","медь"],
    "Восточный Эстель": ["Королевство Эстель","Центральный Эстель","1.61 млн","Реаль","₳ 3.49 / день","70 / 100","серебро"],
    "Юго-западная Аурелия": ["Республика Аврелия","Южная Аурелия","1.31 млн","Сал","₳ 2.98 / день","55 / 100","лес, пастбища"],
    "Вальтская провинция": ["Республика Аврелия","Южная Аурелия","1.66 млн","Вальт","₳ 3.09 / день","63 / 100","медь, золото (следы)"],
    "Южная Аурелия": ["Республика Аврелия","Южная Аурелия","2.17 млн","Даль","₳ 3.37 / день","66 / 100","зерно, известняк"],
    "Эстельская марка": ["Королевство Эстель","Южный Эстель","1.38 млн","Марен","₳ 3.16 / день","57 / 100","уголь, соль"]
  };

  document.querySelectorAll('.region').forEach(path => {
    path.addEventListener('click', () => {
      if (moved) return;
      document.querySelectorAll('.region').forEach(x => x.classList.remove('selected'));
      path.classList.add('selected');
      const name = path.dataset.region;
      const d = regionData[name];
      if (!d) return;
      document.getElementById('regionName').textContent = name;
      document.getElementById('rMeta').textContent = `Регион: ${d[1]} · владелец: ${d[0]}`;
      document.getElementById('rPop').textContent = d[2];
      document.getElementById('rMarket').textContent = d[3];
      document.getElementById('rWage').textContent = d[4];
      document.getElementById('rInd').textContent = d[5];
      document.getElementById('rDef').textContent = d[6];
    });
  });

  /* layers */
  const layerButtons = document.querySelectorAll('.layer-tabs button');
  const roads = document.getElementById('roadsLayer');
  const trade = document.getElementById('tradeLayer');
  const states = document.getElementById('stateBordersLayer');
  const resources = document.getElementById('resourceLayer');

  function setLayer(layer){
    layerButtons.forEach(b => b.classList.toggle('active', b.dataset.layer === layer));
    roads.classList.toggle('hidden-layer', layer !== 'roads');
    trade.classList.toggle('hidden-layer', layer !== 'trade');
    states.classList.toggle('hidden-layer', layer !== 'states');
    resources.classList.toggle('hidden-layer', layer !== 'resources');
  }
  layerButtons.forEach(b => b.addEventListener('click', () => setLayer(b.dataset.layer)));
  setLayer('politics');

  document.getElementById('openProvinceBtn')?.addEventListener('click',()=>{
    const name=document.getElementById('regionName').textContent;
    showGlobalToast(`Открыта карточка провинции: ${name}. В полноценной игре здесь будут население, рынок, предприятия, инфраструктура и известные ресурсы.`);
  });

  applyTransform();
})();


/* ---------------- V9: GLOBAL INTERACTIONS ---------------- */
function showGlobalToast(message){
  const t=document.getElementById('globalToast');
  if(!t) return;
  t.textContent=message;
  t.classList.add('show');
  clearTimeout(window.__globalToastTimer);
  window.__globalToastTimer=setTimeout(()=>t.classList.remove('show'),3200);
}

/* Resources */
(() => {
  const basinData={
    aurcoal:{name:'Аурельский бассейн',type:'Уголь · бассейн',size:'420 × 96 км',thick:'18–74 м',grade:'0.68',depth:'120–910 м',extract:'0.74',remain:'1.24 млрд т',survey:72,note:'Известные пласты богаче к центру бассейна; восточная часть изучена слабо.'},
    lioriron:{name:'Лиорский пояс',type:'Железная руда · пояс',size:'610 × 42 км',thick:'8–51 м',grade:'0.43',depth:'40–640 м',extract:'0.81',remain:'418 млн т',survey:61,note:'Южная часть пояса доступна открытой разработке; север уходит глубже.'},
    valtcopper:{name:'Вальтский пояс',type:'Медь · рудный пояс',size:'280 × 31 км',thick:'4–22 м',grade:'0.29',depth:'80–1200 м',extract:'0.57',remain:'64 млн т',survey:38,note:'Небольшие богатые зоны чередуются с бедной рудой. Геометрия известна плохо.'},
    northgas:{name:'Северный бассейн',type:'Природный газ · бассейн',size:'~540 × 180 км',thick:'не установлено',grade:'низкая уверенность',depth:'900–2400 м',extract:'неизвестно',remain:'не оценено',survey:12,note:'Есть поверхностные признаки и несколько скважин. Экономической добычи пока нет.'},
    westforest:{name:'Западный массив',type:'Лес · возобновляемый stock',size:'~88 тыс. км²',thick:'—',grade:'биомасса 0.77',depth:'поверхность',extract:'0.92',remain:'620 млн т',survey:89,note:'Запас восстанавливается, но северо-западные лесничества уже эксплуатируются выше устойчивого уровня.'}
  };
  function select(id,row){
    const d=basinData[id]; if(!d) return;
    document.querySelectorAll('.basin-table tbody tr').forEach(x=>x.classList.remove('selected')); row?.classList.add('selected');
    document.getElementById('basinName').textContent=d.name;
    document.querySelector('#basinDetail .subhead').textContent=d.type;
    document.getElementById('basinSize').textContent=d.size;
    document.getElementById('basinThick').textContent=d.thick;
    document.getElementById('basinGrade').textContent=d.grade;
    document.getElementById('basinDepth').textContent=d.depth;
    document.getElementById('basinExtract').textContent=d.extract;
    document.getElementById('basinRemain').textContent=d.remain;
    document.getElementById('basinSurveyBar').style.width=d.survey+'%';
    document.getElementById('basinNote').textContent=d.note;
  }
  document.querySelectorAll('.basin-table [data-basin]').forEach(row=>row.addEventListener('click',()=>select(row.dataset.basin,row)));
  document.getElementById('fundExploration')?.addEventListener('click',()=>{
    const el=document.getElementById('surveyKpi'); const n=Math.min(99,Number(el.textContent.replace(/\D/g,''))+2); el.textContent=n+'%';
    showGlobalToast('Кабинет выделил дополнительное финансирование геологической разведке. Это меняет знания о мире, а не саму геологию.');
  });
})();

/* Enterprises */
(() => {
  const data={
    steel:{sector:'Металлургия',name:'Аурельский металлургический комбинат',owner:'Аурельское промышленное общество',ownerType:'private',manager:'директор М. Керн',workers:'8 420',profit:'₳ 7.8 млн',value:'₳ 54 млн',note:'Покупает уголь и железную руду на локальном рынке, продаёт базовые металлы и железные изделия.'},
    coal:{sector:'Добыча',name:'Северные угольные шахты',owner:'боярин Виктор Сарен',ownerType:'private',manager:'управляющий Л. Харн',workers:'12 600',profit:'₳ 10.4 млн',value:'₳ 68 млн',note:'Высокая прибыльность вызвана дефицитом угля. Часть пластов уже уходит глубже 700 м.'},
    arsenal:{sector:'Военная промышленность',name:'Государственный арсенал',owner:'Республика Аврелия',ownerType:'state',manager:'генеральный инспектор Д. Раль',workers:'4 880',profit:'₳ 0.4 млн',value:'₳ 39 млн',note:'Стратегическое предприятие. Значительная часть выпуска закупается государством по долгосрочным контрактам.'},
    textile:{sector:'Текстиль',name:'Лиорские мануфактуры',owner:'консорциум купцов Лиора',ownerType:'private',manager:'правление консорциума',workers:'6 730',profit:'₳ 3.1 млн',value:'₳ 22 млн',note:'Экспортирует около трети выпуска; чувствительно к цене волокон и внешнему спросу.'},
    rail:{sector:'Транспорт',name:'Аурельская железнодорожная компания',owner:'государство 34% · частные акционеры 66%',ownerType:'mixed',manager:'правление компании',workers:'3 940',profit:'₳ 1.7 млн',value:'₳ 81 млн',note:'Смешанная собственность. Получает государственные гарантии на отдельные инфраструктурные проекты.'},
    ship:{sector:'Судостроение',name:'Верфь Ровена',owner:'Регион Ровен',ownerType:'local',manager:'директор А. Мор',workers:'2 110',profit:'−₳ 0.2 млн',value:'₳ 18 млн',note:'Региональная верфь временно убыточна из-за дорогой древесины и слабого портового заказа.'}
  };
  let current='steel';
  function render(id,row){ current=id; const d=data[id]; if(!d)return;
    document.querySelectorAll('.enterprise-table tbody tr').forEach(x=>x.classList.remove('selected')); row?.classList.add('selected');
    enterpriseSector.textContent=d.sector; enterpriseName.textContent=d.name; enterpriseOwner.textContent=d.owner; enterpriseManager.textContent=d.manager; enterpriseWorkers.textContent=d.workers; enterpriseProfit.textContent=d.profit; enterpriseValue.textContent=d.value; enterpriseNote.textContent=d.note;
    ownershipAction.textContent=d.ownerType==='state'?'Продать / приватизировать':'Купить государством';
  }
  document.querySelectorAll('.enterprise-table [data-enterprise]').forEach(row=>row.addEventListener('click',()=>render(row.dataset.enterprise,row)));
  document.getElementById('ownershipAction')?.addEventListener('click',()=>{
    const d=data[current];
    if(d.ownerType==='state'){d.ownerType='private';d.owner='Аурельское промышленное общество';showGlobalToast(`Государство продало предприятие «${d.name}». Выручка поступила в казну; предприятие продолжает работу.`)}
    else{d.ownerType='state';d.owner='Республика Аврелия';showGlobalToast(`Государство выкупило предприятие «${d.name}». Рабочие, оборудование и запасы не исчезли — сменился собственник.`)}
    render(current,document.querySelector(`.enterprise-table [data-enterprise="${current}"]`));
  });
})();

/* Recycling */
(() => {
  const slider=document.getElementById('collectionRate');
  function update(){if(!slider)return;const rate=Number(slider.value);collectionRateReadout.textContent=rate+'%';steelCollectText.textContent=rate+'%';const recovered=Math.round(428*rate/100*0.92);steelRecovered.textContent=recovered+' тыс. т';}
  slider?.addEventListener('input',update);update();
  document.getElementById('recyclingSubsidy')?.addEventListener('click',()=>{slider.value=Math.min(90,Number(slider.value)+8);update();showGlobalToast('Введена субсидия на сбор лома: сбор вырос, но бюджет несёт дополнительные расходы.');});
})();

/* Generic modal helpers */
function openModal(id){const m=document.getElementById(id);if(m){m.classList.add('open');m.setAttribute('aria-hidden','false')}}
function closeModal(id){const m=document.getElementById(id);if(m){m.classList.remove('open');m.setAttribute('aria-hidden','true')}}
document.querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.closeModal)));
document.querySelectorAll('.generic-modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id)}));

/* Currency builder */
(() => {
  const type=document.getElementById('newCurrencyType'), backing=document.getElementById('newCurrencyBacking'), silver=document.getElementById('newCurrencySilver');
  function projection(){
    if(!type)return {yes:0,und:0,no:0}; let yes=148; if(type.value==='fiat')yes-=31;if(type.value==='paper')yes-=15;if(backing.value==='нет')yes-=10; const sv=Number(silver.value); if(type.value==='metallic'||type.value==='mixed'){if(sv<8)yes-=18;if(sv>24)yes-=7;} yes=Math.max(72,Math.min(182,yes));let und=28;let no=250-yes-und;if(no<0){und+=no;no=0}return {yes,und,no};
  }
  function update(){if(!silver)return;currencySilverReadout.textContent=Number(silver.value).toFixed(1)+' г';const p=projection();currencyVoteYes.textContent=p.yes;currencyVoteYesBar.style.width=p.yes/2.5+'%';currencyVoteUndBar.style.width=p.und/2.5+'%';currencyVoteNoBar.style.width=p.no/2.5+'%';currencyVoteNote.innerHTML=p.yes>=126?'<b class="good">Большинство есть.</b> Но рынки и кредиторы будут оценивать реформу отдельно от парламента.':'<b class="bad">Большинства нет.</b> Нужны переговоры или более консервативные параметры.';currencyEffects.innerHTML=`<div class="effect-item goodfx"><b>Новая расчётная единица</b>${escapeV9(newCurrencyName.value||'новая валюта')} (${escapeV9(newCurrencySymbol.value||'¤')}) будет использоваться в налогах и государственных счетах.</div><div class="effect-item cost"><b>Переходные издержки</b>Пересчёт цен, договоров, зарплат и долгов; чеканка/печать новых номиналов.</div><div class="effect-item cost"><b>Рыночная реакция</b>Внешний курс будет формироваться по металлическому содержанию, доверию и торговому спросу.</div>`;}
  [type,backing,silver,newCurrencyName,newCurrencySymbol].forEach(x=>x?.addEventListener('input',update));
  document.getElementById('openCurrencyBuilder')?.addEventListener('click',()=>{update();openModal('currencyBuilder')});
  document.getElementById('applyCurrencyReform')?.addEventListener('click',()=>{const p=projection();if(p.yes<126){showGlobalToast('Проект денежной реформы не получил большинства.');return;}const name=newCurrencyName.value.trim()||'новая валюта';const sym=newCurrencySymbol.value.trim()||'¤';currencyNameMain.textContent=name;currencySymbolBig.textContent=sym;currencyRegime.textContent=`${newCurrencyType.options[newCurrencyType.selectedIndex].text}, база: ${newCurrencyBacking.value}`;currencySilver.textContent=Number(newCurrencySilver.value).toFixed(1)+' г';const ic=document.getElementById('identityCurrency');if(ic)ic.textContent=name;closeModal('currencyBuilder');showGlobalToast(`Денежная реформа принята ${p.yes} голосами. Введена валюта «${name}» (${sym}).`);});
  update();
})();

/* State identity builder */
(() => {
  let uploadedFlagData='';
  function calc(){const kind=identityChangeType.value;let yes=kind==='minor'?169:kind==='constitutional'?138:108;const changedName=newOfficialName.value.trim()!==identityOfficialName.textContent.trim();if(changedName)yes-=4;yes=Math.max(70,Math.min(190,yes));const und=kind==='revolutionary'?36:28;const no=250-yes-und;return {yes,und,no};}
  function update(){const p=calc();identityVoteYes.textContent=p.yes;identityVoteYesBar.style.width=p.yes/2.5+'%';identityVoteUndBar.style.width=p.und/2.5+'%';identityVoteNoBar.style.width=p.no/2.5+'%';const kind=identityChangeType.value;identityEffects.innerHTML=kind==='minor'?'<div class="effect-item goodfx"><b>Символическая реформа</b>Небольшая административная стоимость и ограниченная политическая реакция.</div>':kind==='constitutional'?'<div class="effect-item cost"><b>Конституционное изменение</b>Потребуются официальные акты, замена символики, документов и признание новой формулировки институтами.</div>':'<div class="effect-item cost"><b>Революционная смена идентичности</b>Может сигнализировать смену режима и вызвать сильную реакцию фракций, армии, общества и внешних держав.</div>';identityVoteNote.innerHTML=p.yes>=126?'<b class="good">Процедура имеет большинство.</b>':'<b class="bad">Процедура не имеет большинства.</b>';}
  [newOfficialName,newShortName,newGovernmentForm,newMotto,identityChangeType].forEach(x=>x?.addEventListener('input',update));
  document.getElementById('flagUpload')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{uploadedFlagData=String(r.result);identityFlagModalPreview.style.backgroundImage=`url(${uploadedFlagData})`;identityFlagModalPreview.style.backgroundColor='#d5ceb5';};r.readAsDataURL(f);});
  document.getElementById('openIdentityBuilder')?.addEventListener('click',()=>{newOfficialName.value=identityOfficialName.textContent;newShortName.value=identityShortName.textContent;newGovernmentForm.value=identityForm.textContent;newMotto.value=identityMotto.textContent.replace(/[«»]/g,'');identityFlagModalPreview.style.backgroundImage=identityFlagPreview.style.backgroundImage;update();openModal('identityBuilder')});
  document.getElementById('applyIdentityReform')?.addEventListener('click',()=>{const p=calc();if(p.yes<126){showGlobalToast('Реформа государственной идентичности не прошла политическую процедуру.');return;}const off=newOfficialName.value.trim()||'Государство';const short=newShortName.value.trim()||off;const form=newGovernmentForm.value.trim()||'государство';const motto=newMotto.value.trim()||'—';identityOfficialName.textContent=off;identityShortName.textContent=short;identityForm.textContent=form;identityMotto.textContent=`«${motto}»`;document.querySelector('.country-name').textContent=off;document.querySelector('.country-sub').textContent=form;if(uploadedFlagData){identityFlagPreview.style.backgroundImage=`url(${uploadedFlagData})`;document.querySelector('.country .flag').style.backgroundImage=`url(${uploadedFlagData})`;document.querySelector('.country .flag').style.backgroundSize='cover';document.querySelector('.country .flag').style.backgroundPosition='center';}closeModal('identityBuilder');showGlobalToast(`Государственная реформа принята ${p.yes} голосами. Официальное название: ${off}.`);});
  update();
})();

/* Science grants */
(() => {
  document.querySelectorAll('.grant-btn').forEach(btn=>btn.addEventListener('click',()=>{
    const req=btn.closest('.grant-request');if(req.classList.contains('resolved'))return;
    const action=btn.dataset.action; const scientist=req.querySelector('b').textContent;
    req.classList.add('resolved'); req.querySelectorAll('button').forEach(x=>x.disabled=true);
    const text=action==='approve'?'грант одобрен полностью':action==='partial'?'грант одобрен частично':'запрос отклонён';
    const small=req.querySelector('small');small.textContent+=' · Решение: '+text+'.';
    if(action!=='decline'){const bar=document.getElementById('electricityProgress');const cur=parseFloat(bar.style.width)||62;bar.style.width=Math.min(95,cur+(action==='approve'?5:2))+'%';}
    showGlobalToast(`${scientist}: ${text}. Отказ не останавливает исследователя — он может искать другого покровителя или работать медленнее.`);
  }));
})();

function escapeV9(s){return String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}


/* =========================================================
   V10 PROTOTYPE FUNCTIONALITY
   ========================================================= */
function openModal(id){const el=document.getElementById(id);if(!el)return;el.classList.add('open');el.setAttribute('aria-hidden','false')}
function closeModal(id){const el=document.getElementById(id);if(!el)return;el.classList.remove('open');el.setAttribute('aria-hidden','true')}
document.querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.closeModal)));
document.querySelectorAll('.generic-modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id)}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.generic-modal.open').forEach(m=>closeModal(m.id));document.getElementById('notificationDrawer')?.classList.remove('open');document.getElementById('drawerBackdrop')?.classList.remove('open')}});

/* Notifications */
window.renderPrototypeNotifications=function(){const st=window.MandatePrototypeState;if(!st)return;const list=document.getElementById('notificationList');list.innerHTML=st.notifications.length?st.notifications.map((n,i)=>`<div class="notification-item ${n.unread?'unread':''}" data-notification="${i}"><b>${escapeV9(n.title)}</b>${escapeV9(n.text)}<time>${escapeV9(n.date)}</time></div>`).join(''):'<div class="mini-note">Событий пока нет.</div>';};
function toggleDrawer(open){const d=document.getElementById('notificationDrawer'),b=document.getElementById('drawerBackdrop');d.classList.toggle('open',open);b.classList.toggle('open',open);d.setAttribute('aria-hidden',open?'false':'true');if(open)renderPrototypeNotifications()}
document.getElementById('notificationsButton')?.addEventListener('click',()=>toggleDrawer(true));document.getElementById('closeNotificationDrawer')?.addEventListener('click',()=>toggleDrawer(false));document.getElementById('drawerBackdrop')?.addEventListener('click',()=>toggleDrawer(false));
document.getElementById('markNotificationsRead')?.addEventListener('click',()=>{const st=MandatePrototypeState;st.notifications.forEach(n=>n.unread=false);st.unread=0;document.getElementById('notificationBadge').style.display='none';renderPrototypeNotifications()});
document.getElementById('pauseFromDrawer')?.addEventListener('click',()=>document.querySelector('.speed span[data-speed="0"]')?.click());document.getElementById('advanceWeek')?.addEventListener('click',()=>{document.querySelector('.speed span[data-speed="0"]')?.click();advancePrototypeDays(7);renderPrototypeNotifications()});

/* Law amendment builder */
(() => {
  const openBtn=document.getElementById('openAmendmentBuilder'),mode=document.getElementById('amendmentMode'),article=document.getElementById('amendmentArticle'),text=document.getElementById('amendmentText');
  function articles(){const t=document.createElement('div');t.innerHTML=lawData[currentLawId]?.body||'';return [...t.querySelectorAll('h3')].map((h,i)=>({i,title:h.textContent}));}
  function projection(){const base=lawData[currentLawId]?.votes?.[0]||120;let yes=base;yes+=mode.value==='add'?-5:mode.value==='delete'?-12:2;const len=text.value.trim().length;if(len>300)yes-=7;if(/компенс|переход|отсроч/i.test(text.value))yes+=6;if(/запрет|немедленно|конфиска/i.test(text.value))yes-=8;yes=Math.max(55,Math.min(195,yes));const und=Math.max(12,Math.min(48,30-Math.floor(Math.abs(yes-126)/5)));return{yes,und,no:250-yes-und};}
  function refreshArticles(){article.innerHTML=articles().map(a=>`<option value="${a.i}">${escapeV9(a.title)}</option>`).join('');article.disabled=mode.value==='add';}
  function update(){refreshArticles();const p=projection();amendmentYes.textContent=p.yes;amendmentYesBar.style.width=p.yes/2.5+'%';amendmentUndBar.style.width=p.und/2.5+'%';amendmentNoBar.style.width=p.no/2.5+'%';amendmentEffects.innerHTML=`<div class="effect-item ${p.yes>=126?'goodfx':'cost'}"><b>Политическая поддержка</b>${p.yes>=126?'Поправка имеет рабочее большинство.':'Поправка пока не имеет большинства.'}</div><div class="effect-item cost"><b>Процедурный эффект</b>${mode.value==='replace'?'Меняется текст существующей статьи.':mode.value==='add'?'В законопроект добавляется новая статья.':'Выбранная статья удаляется целиком.'}</div>`;amendmentVoteNote.innerHTML=`За ${p.yes}, не определились ${p.und}, против ${p.no}.`;}
  openBtn?.addEventListener('click',()=>{amendmentLawName.value=lawData[currentLawId]?.title||'';refreshArticles();update();openModal('amendmentBuilder')});[mode,text,article].forEach(x=>x?.addEventListener('input',update));
  document.getElementById('submitAmendment')?.addEventListener('click',()=>{const d=lawData[currentLawId],p=projection();if(!d)return;if(p.yes<126){showGlobalToast(`Поправка отклонена: ${p.yes} голосов «за».`);prototypeNotify?.('Парламент',`${d.title}: поправка отклонена (${p.yes} за).`);closeModal('amendmentBuilder');return;}const box=document.createElement('div');box.innerHTML=d.body;const hs=[...box.querySelectorAll('h3')];const idx=Number(article.value)||0;if(mode.value==='replace'&&hs[idx]){const para=hs[idx].nextElementSibling;if(para)para.textContent=text.value.trim()||para.textContent;}else if(mode.value==='delete'&&hs[idx]){const para=hs[idx].nextElementSibling;para?.remove();hs[idx].remove();}else if(mode.value==='add'){const n=hs.length+1;box.insertAdjacentHTML('beforeend',`<h3>Статья ${n}. Поправка</h3><p>${escapeV9(text.value.trim()||'Дополнительная норма.')}</p>`);}d.body=box.innerHTML;d.votes=[p.yes,p.und,p.no];updateLaw(currentLawId);const list=document.getElementById('amendmentList');const no=list.querySelectorAll('.amendment').length+22;list.insertAdjacentHTML('afterbegin',`<div class="amendment"><b>№ ${currentLawId==='factory'?'184':'—'}-${no}</b> · ${escapeV9(text.value.trim().slice(0,100)||'редакционная поправка')} <span class="good">· принята ${p.yes}:${p.no}</span></div>`);prototypeNotify?.('Парламент',`${d.title}: поправка принята ${p.yes} голосами.`);showGlobalToast('Поправка принята и текст законопроекта обновлён.');closeModal('amendmentBuilder')});update();
})();

/* Negotiations */
(() => {const choices=[...document.querySelectorAll('.negotiation-choice')];const bonus={delay:9,subsidy:13,inspection:8,partyDeal:11};function calc(){const d=lawData[currentLawId];let yes=d?.votes?.[0]||0;let cost=[];choices.filter(x=>x.checked).forEach(x=>{yes+=bonus[x.value];cost.push(x.value)});yes=Math.min(205,yes);const und=Math.max(10,(d?.votes?.[1]||25)-choices.filter(x=>x.checked).length*3);return{yes,und,no:250-yes-und,cost}}function update(){const p=calc();negotiationYes.textContent=p.yes;negotiationYesBar.style.width=p.yes/2.5+'%';negotiationUndBar.style.width=p.und/2.5+'%';negotiationNoBar.style.width=Math.max(0,p.no)/2.5+'%';negotiationEffects.innerHTML=`<div class="effect-item ${p.yes>=126?'goodfx':'cost'}"><b>Итог</b>${p.yes>=126?'Собирается большинство.':'Большинства всё ещё нет.'}</div>${p.cost.includes('subsidy')?'<div class="effect-item cost"><b>Бюджет</b>Компенсации потребуют около ₳ 2.4 млн в год.</div>':''}${p.cost.includes('partyDeal')?'<div class="effect-item cost"><b>Политический долг</b>Партнёры ожидают уступку по следующему крупному проекту.</div>':''}`;}window.updateNegotiationPreview=update;choices.forEach(x=>x.addEventListener('input',update));document.getElementById('applyNegotiation')?.addEventListener('click',()=>{const d=lawData[currentLawId],p=calc();d.votes=[p.yes,p.und,Math.max(0,p.no)];updateLaw(currentLawId);prototypeNotify?.('Коалиция',`${d.title}: переговоры изменили прогноз до ${p.yes} голосов «за».`);showGlobalToast(`Переговоры завершены. Новый прогноз: ${p.yes} голосов «за».`);closeModal('negotiationBuilder')});update();})();

/* Province detail and local actions */
window.renderProvinceModal=function(name){const d=window.__provinceState?.[name];if(!d)return;provinceModalTitle.textContent=name;provinceModalStats.innerHTML=`<div class="province-stat">Владелец<b>${escapeV9(d.owner)}</b></div><div class="province-stat">Регион<b>${escapeV9(d.region)}</b></div><div class="province-stat">Население<b>${escapeV9(d.pop)}</b></div><div class="province-stat">Локальный рынок<b>${escapeV9(d.market)}</b></div><div class="province-stat">Инфраструктура<b>${d.infra} / 100</b></div><div class="province-stat">Разведанность ресурсов<b>${d.survey}%</b></div><div class="province-stat modal-span">Известные ресурсы<b>${escapeV9(d.resources)}</b></div>`;};
document.getElementById('provinceInfrastructureBtn')?.addEventListener('click',()=>{const name=window.__selectedProvince,d=window.__provinceState?.[name];if(!d)return;if(MandatePrototypeState.treasury<5){showGlobalToast('Недостаточно средств.');return;}MandatePrototypeState.treasury-=5;d.infra=Math.min(100,d.infra+4);rInd.textContent=`${d.infra} / 100`;renderProvinceModal(name);prototypeNotify?.('Инфраструктура',`${name}: утверждена программа модернизации, инфраструктура ${d.infra}/100.`);showGlobalToast('Инфраструктурная программа профинансирована.')});
document.getElementById('provinceSurveyBtn')?.addEventListener('click',()=>{const name=window.__selectedProvince,d=window.__provinceState?.[name];if(!d)return;if(MandatePrototypeState.treasury<1.5){showGlobalToast('Недостаточно средств.');return;}MandatePrototypeState.treasury-=1.5;d.survey=Math.min(100,d.survey+12);if(d.survey>70&&d.resources.includes('следы'))d.resources=d.resources.replace(' (следы)','');renderProvinceModal(name);rDef.textContent=d.resources;prototypeNotify?.('Геологическая служба',`${name}: разведанность ресурсов выросла до ${d.survey}%.`);showGlobalToast('Экспедиция профинансирована.')});

/* Market table selection */
(() => {const rows=[...document.querySelectorAll('#econ-market .goods-table tbody tr')],detail=document.querySelector('#econ-market .market-detail');if(!rows.length||!detail)return;rows.forEach(row=>row.addEventListener('click',()=>{rows.forEach(x=>x.classList.remove('selected'));row.classList.add('selected');const c=[...row.cells].map(x=>x.innerText.trim());const h=detail.querySelector('h2'),price=detail.querySelector('.market-price');if(h)h.textContent=c[0];if(price)price.innerHTML=`${escapeV9(c[5])} <span style="font:12px ui-monospace;color:#66675f">/ единицу</span>`;const lines=detail.querySelectorAll('.rowline b');if(lines[0])lines[0].textContent=c[1]+' / мес.';if(lines[1])lines[1].textContent=c[2]+' / мес.';showGlobalToast(`Выбран рынок товара: ${c[0]}.`)}));})();

/* Appointments */
document.querySelectorAll('.candidate-card .btn').forEach(btn=>btn.addEventListener('click',()=>{const office=document.querySelector('.office-item.active'),card=btn.closest('.candidate-card');if(!office||!card)return;const officeName=office.querySelector('b')?.textContent||'должность',person=card.querySelector('b')?.textContent||'кандидат';if(!confirm(`Назначить «${person}» на должность «${officeName}»?`))return;office.innerHTML=`<b>${escapeV9(officeName)}</b><small>Назначен: ${escapeV9(person)}</small>`;office.classList.remove('active');btn.disabled=true;btn.textContent='Назначен';prototypeNotify?.('Назначение',`${person} назначен: ${officeName}.`);showGlobalToast(`${person} назначен на должность.`)}));

/* Reports */
function renderEconomicReport(){const st=MandatePrototypeState;reportModalTitle.textContent='Экономический доклад';reportModalBody.innerHTML=`<div class="sim-kpis"><div class="sim-kpi">Казна<b>₳ ${(st.treasury/1000).toFixed(2)} млрд</b></div><div class="sim-kpi">Месячный баланс<b>${st.monthlyBalance>=0?'+':''}₳ ${st.monthlyBalance.toFixed(1)} млн</b></div><div class="sim-kpi">Промышленность<b>${st.industry.toFixed(1)}</b></div><div class="sim-kpi">Инфляция<b>${st.inflation.toFixed(1)}%</b></div></div><div class="builder-section" style="margin-top:9px"><h3>Сводка прототипа</h3><div class="rowline"><span>Текущая дата</span><b>${gameDateLabel.textContent}</b></div><div class="rowline"><span>Уголь</span><b class="bad">дефицит сохраняется</b></div><div class="rowline"><span>Инвестиции</span><b class="good">расширение</b></div><div class="rowline"><span>Электрические исследования</span><b>${Math.round(parseFloat(electricityProgress?.style.width)||62)}%</b></div></div><div class="builder-section" style="margin-top:9px"><h3>Последние события</h3>${st.notifications.slice(0,6).map(n=>`<div class="log-line"><span class="log-time">${escapeV9(n.date)}</span><span><b>${escapeV9(n.title)}</b> — ${escapeV9(n.text)}</span></div>`).join('')}</div>`;openModal('reportModal')}
document.getElementById('economicReportBtn')?.addEventListener('click',renderEconomicReport);
document.getElementById('enterpriseReport')?.addEventListener('click',()=>{const name=document.getElementById('enterpriseName')?.textContent||'Предприятие';reportModalTitle.textContent=`Отчёт предприятия — ${name}`;reportModalBody.innerHTML=`<div class="sim-kpis"><div class="sim-kpi">Работники<b>${enterpriseWorkers?.textContent||'—'}</b></div><div class="sim-kpi">Маржа<b>${enterpriseMargin?.textContent||'—'}</b></div><div class="sim-kpi">Запасы inputs<b>${enterpriseInputs?.textContent||'18 дней'}</b></div><div class="sim-kpi">Владелец<b>${enterpriseOwner?.textContent||'—'}</b></div></div><div class="builder-section" style="margin-top:9px"><h3>Экономический цикл</h3><div class="modal-summary">Покупка inputs → найм труда → использование оборудования → выпуск → продажа → зарплаты, налоги и maintenance → прибыль/убыток. Смена владельца не уничтожает предприятие.</div></div>`;openModal('reportModal')},true);
document.getElementById('exportPrototypeJson')?.addEventListener('click',()=>{const data={date:gameDateLabel.textContent,treasury:MandatePrototypeState.treasury,industry:MandatePrototypeState.industry,inflation:MandatePrototypeState.inflation,country:identityOfficialName?.textContent,currency:currencyNameMain?.textContent,selectedProvince:window.__selectedProvince,notifications:MandatePrototypeState.notifications};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='mandate-prototype-state.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)});

/* Law filter buttons do something useful */
document.querySelectorAll('.module-subnav[data-module="laws"] button[data-law-filter]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.module-subnav[data-module="laws"] button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const f=btn.dataset.lawFilter;if(f==='bills'){const item=document.querySelector('.law-item[data-law]');if(item)updateLaw(item.dataset.law);showGlobalToast('Показаны текущие законопроекты.')}else if(f==='active'){lawTitle.textContent='ДЕЙСТВУЮЩЕЕ ЗАКОНОДАТЕЛЬСТВО';lawSubtitle.textContent='Сводка основных действующих норм';lawBody.innerHTML='<h3>Бюджетный закон 1848 года</h3><p>Определяет текущие государственные расходы и источники доходов.</p><h3>Торговый кодекс</h3><p>Регулирует договоры, тарифные полномочия и регистрацию торговых обществ.</p><h3>Закон о местном управлении</h3><p>Устанавливает полномочия региональных советов и порядок финансирования.</p>';showGlobalToast('Открыта сводка действующих законов.')}else{lawTitle.textContent='КОНСТИТУЦИЯ АВРЕЛИИ';lawSubtitle.textContent='Основной закон · редакция 1821 года';lawBody.innerHTML='<h3>Статья I. Государство</h3><p>Аврелия является федеративной парламентской республикой.</p><h3>Статья II. Законодательная власть</h3><p>Законодательная власть принадлежит избираемой Палате граждан и иным предусмотренным законом институтам.</p><h3>Статья III. Правительство</h3><p>Правительство ответственно перед парламентом в порядке, установленном законом.</p>';showGlobalToast('Открыта конституция.')};}));


/* ---------------- PARLIAMENT: every circle = one seat ---------------- */
(() => {
  const parties = [
    { name:"Социалисты", seats:54, color:"#ae6059" },
    { name:"Либералы", seats:71, color:"#527c9d" },
    { name:"Аграрии", seats:31, color:"#7b875e" },
    { name:"Независимые", seats:16, color:"#9b8350" },
    { name:"Консерваторы", seats:78, color:"#59606d" }
  ];

  const totalSeats = parties.reduce((s,p)=>s+p.seats,0);
  document.getElementById('seatCountLabel').textContent = totalSeats + ' мест';
  document.getElementById('thresholdText').textContent = (Math.floor(totalSeats/2)+1) + ' / ' + totalSeats;

  const svg = document.getElementById('parliamentSvg');
  const layer = document.getElementById('seatLayer');
  const NS = "http://www.w3.org/2000/svg";

  /*
    Seats are distributed across concentric semicircular rows.
    Row counts are proportional to radius, so changing total seats
    changes the number/density of circles automatically.
  */
  const rows = Math.max(5, Math.min(11, Math.round(Math.sqrt(totalSeats) / 2)));
  const innerR = 92;
  const outerR = 315;
  const radii = Array.from({length:rows},(_,i)=>
    innerR + (outerR-innerR) * (i/(rows-1))
  );

  const weightSum = radii.reduce((a,b)=>a+b,0);
  const counts = radii.map(r => Math.max(5, Math.floor(totalSeats * r / weightSum)));

  let used = counts.reduce((a,b)=>a+b,0);
  let cursor = rows-1;
  while (used < totalSeats) {
    counts[cursor]++; used++; cursor--; if (cursor < 0) cursor = rows-1;
  }
  cursor = 0;
  while (used > totalSeats) {
    if (counts[cursor] > 5) { counts[cursor]--; used--; }
    cursor++; if (cursor >= rows) cursor = 0;
  }

  const cx = 380;
  const cy = 438;
  const margin = 0.10;
  let positions = [];

  counts.forEach((count,rowIndex)=>{
    const r = radii[rowIndex];
    for(let i=0;i<count;i++){
      const t = count === 1 ? 0.5 : i/(count-1);
      const angle = Math.PI - margin - t*(Math.PI - margin*2);
      positions.push({
        x: cx + r*Math.cos(angle),
        y: cy - r*Math.sin(angle),
        angle,
        r
      });
    }
  });

  /* Order left -> right so parties form contiguous ideological blocks */
  positions.sort((a,b)=>{
    if (Math.abs(a.angle-b.angle) > 0.01) return b.angle-a.angle;
    return a.r-b.r;
  });

  const partyForIndex = [];
  parties.forEach(p => {
    for(let i=0;i<p.seats;i++) partyForIndex.push(p);
  });

  positions.forEach((pos, i)=>{
    const party = partyForIndex[i];
    const circle = document.createElementNS(NS,'circle');
    circle.setAttribute('class','seat');
    circle.setAttribute('cx',pos.x.toFixed(2));
    circle.setAttribute('cy',pos.y.toFixed(2));
    circle.setAttribute('r','5.4');
    circle.setAttribute('fill',party.color);

    const title = document.createElementNS(NS,'title');
    title.textContent = `${party.name} — место ${i+1}`;
    circle.appendChild(title);

    layer.appendChild(circle);
  });
})();
