/* ============================================================
   大屏导读.js — 看板分步导读（通用版 v1.0）
   依赖：#stage（1920×1080 基座约定）+ 大屏基座.css 的令牌变量
   用法：在引入本文件之前定义配置——
   <script>
     window.TOUR = {
       autostart: true,            // 加载后 600ms 自动开始（默认 true，设 false 关闭）
       btnText: '看板导读',         // 右上角按钮文案
       lsVersion: 1,               // 页面改版导致站号错位时 +1，弃用旧 localStorage
       steps: [
         {sel: null,       t: '开篇标题', d: '开篇正文，支持 <b> 加粗'},   // 无 sel：只弹卡，不高亮
         {sel: '#kpiBand', t: '第 1 站',  d: '高亮 KPI 行的讲解'},
         {sel: '.bf', exclude: ['#pMap'], t: '…', d: '…'}               // exclude：高亮区内再挖掉一块
       ]
     };
   </script>
   <script src="大屏导读.js"></script>
   说明：
   - 高亮坐标按基座等比缩放换算，任意窗口尺寸下挖孔位置准确
   - 右上角自动注入按钮：页面有 .h-right 就放进去，否则固定右上角
   - 文案可编辑（导读卡内「编 辑」），保存到 localStorage，key 含页面标题
   - 键盘：Enter / → 下一步，← 上一步，Esc 关闭
   - API：window.TourAPI = { show, close, next, prev }
   ============================================================ */
(function(){
  var cfg = window.TOUR;
  if(!cfg || !Array.isArray(cfg.steps) || !cfg.steps.length) return;

  var BASE_W = 1920, BASE_H = 1080;
  var stage = document.getElementById('stage');
  if(!stage) return;
  function slug(s){ return String(s || 'screen').replace(/\s+/g, '-'); }
  var LS_KEY = 'dvTour-' + slug(document.title) + '-v' + (cfg.lsVersion || 1);

  /* ---------- 样式注入（依赖基座令牌，缺省值兜底） ---------- */
  var css = document.createElement('style');
  css.textContent =
  '#dvTour{position:absolute; inset:0; z-index:80; display:none; pointer-events:none; font-family:var(--cn,"PingFang SC",sans-serif);}' +
  '#dvTour.on{display:block;}' +
  '#dvTourMask{position:absolute; inset:0; background:rgba(3,9,20,.84); pointer-events:auto; display:none;}' +
  '#dvTourHole{position:absolute; display:none; border:1px solid rgba(90,225,255,.85); border-radius:6px;' +
    'box-shadow:0 0 0 4000px rgba(3,9,20,.80), inset 0 0 26px rgba(53,214,255,.18);' +
    'transition:all .35s cubic-bezier(.22,.61,.36,1); pointer-events:none;}' +
  '#dvTourPlugs{position:absolute; inset:0; pointer-events:none;}' +
  '.dv-plug{position:absolute; background:rgba(3,9,20,.80); pointer-events:auto; transition:all .35s cubic-bezier(.22,.61,.36,1);}' +
  '#dvTourCard{position:absolute; width:760px; pointer-events:auto; z-index:10;' +
    'background:linear-gradient(180deg,rgba(10,44,80,.94),rgba(6,20,40,.96));' +
    'border:1px solid rgba(90,225,255,.6); border-radius:4px; padding:20px 24px 16px;' +
    'box-shadow:0 12px 44px rgba(0,0,0,.55), inset 0 0 24px rgba(53,214,255,.08);' +
    'transition:all .3s cubic-bezier(.22,.61,.36,1); color:#EAF6FF;}' +
  '#dvTourCard::before{content:""; position:absolute; inset:-1px; pointer-events:none;' +
    'background:linear-gradient(#35D6FF,#35D6FF) 0 0/14px 2px no-repeat,' +
    'linear-gradient(#35D6FF,#35D6FF) 0 0/2px 14px no-repeat,' +
    'linear-gradient(#35D6FF,#35D6FF) 100% 100%/14px 2px no-repeat,' +
    'linear-gradient(#35D6FF,#35D6FF) 100% 100%/2px 14px no-repeat;' +
    'filter:drop-shadow(0 0 6px rgba(53,214,255,.7));}' +
  '.tc-step{font-size:13.5px; letter-spacing:2.5px; color:#35D6FF; font-family:var(--num,"DIN Alternate",Arial);}' +
  '.tc-title{font-size:27px; font-weight:700; color:#EAF6FF; margin:9px 0; letter-spacing:1px;}' +
  '.tc-desc{font-size:17.5px; color:#A9CBE6; line-height:1.95; text-align:justify;}' +
  '.tc-desc b{color:#35D6FF; font-weight:600;}' +
  '.tc-foot{display:flex; align-items:center; margin-top:16px; padding-top:13px; border-top:1px solid rgba(90,200,255,.15);}' +
  '.tc-skip{font-size:14px; color:#6E93B4; cursor:pointer; letter-spacing:1px;}' +
  '.tc-skip:hover{color:#EAF6FF;}' +
  '.tc-btns{margin-left:auto; display:flex; gap:12px;}' +
  '.tc-btn{font-size:15.5px; color:#35D6FF; border:1px solid rgba(53,214,255,.4); padding:8px 24px; cursor:pointer;' +
    'letter-spacing:2px; user-select:none;}' +
  '.tc-btn:hover{background:rgba(53,214,255,.14);}' +
  '.tc-btn.primary{background:linear-gradient(180deg,#8FE8FF,#35D6FF); color:#04101F; font-weight:700; border-color:transparent; letter-spacing:3px;}' +
  '.tc-btn.primary:hover{filter:brightness(1.08);}' +
  '.tc-btn.dis{opacity:.3; pointer-events:none;}' +
  '.tc-edit{margin-top:12px;}' +
  '.tc-edit input,.tc-edit textarea{width:100%; box-sizing:border-box; background:rgba(3,12,26,.85);' +
    'border:1px solid rgba(90,225,255,.4); color:#EAF6FF; font-size:14px; padding:8px 10px;' +
    'font-family:inherit; outline:none; border-radius:2px;}' +
  '.tc-edit input{font-size:19px; font-weight:700; margin-bottom:9px;}' +
  '.tc-edit textarea{min-height:150px; font-size:16px; line-height:1.85; resize:vertical;}' +
  '.tc-edit input:focus,.tc-edit textarea:focus{border-color:#35D6FF; box-shadow:0 0 8px rgba(53,214,255,.25);}' +
  '.tc-edit-foot{display:flex; align-items:center; gap:10px; margin-top:10px;}' +
  '.tc-edit-hint{font-size:12px; color:#6E93B4; margin-right:auto; letter-spacing:1px;}' +
  '#dvTourBtn{cursor:pointer; user-select:none;}' +
  '#dvTourBtnFixed{position:absolute; top:34px; right:30px; font-family:var(--cn,"PingFang SC",sans-serif); z-index:60;}';
  document.head.appendChild(css);

  /* ---------- DOM 注入 ---------- */
  var wrap = document.createElement('div');
  wrap.id = 'dvTour';
  wrap.innerHTML =
    '<div id="dvTourMask"></div>' +
    '<div id="dvTourHole"></div>' +
    '<div id="dvTourPlugs"></div>' +
    '<div id="dvTourCard">' +
      '<div class="tc-step" id="dvTcStep">看板导读</div>' +
      '<div class="tc-title" id="dvTcTitle"></div>' +
      '<div class="tc-desc" id="dvTcDesc"></div>' +
      '<div class="tc-foot">' +
        '<span class="tc-skip" id="dvTcSkip">跳过引导</span>' +
        '<span class="tc-btns">' +
          '<span class="tc-btn" id="dvTcEdit">编 辑</span>' +
          '<span class="tc-btn" id="dvTcPrev">上一步</span>' +
          '<span class="tc-btn primary" id="dvTcNext">下一步</span>' +
        '</span>' +
      '</div>' +
      '<div class="tc-edit" id="dvTcEditBox" style="display:none">' +
        '<input id="dvTcEditTitle" placeholder="导读标题（支持 <b> 加粗）">' +
        '<textarea id="dvTcEditDesc" placeholder="导读正文（支持 <b> 加粗）"></textarea>' +
        '<div class="tc-edit-foot">' +
          '<span class="tc-edit-hint">保存在本浏览器 localStorage，刷新后仍生效</span>' +
          '<span class="tc-btn" id="dvTcReset">恢复默认</span>' +
          '<span class="tc-btn primary" id="dvTcSave">保 存</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  stage.appendChild(wrap);

  /* 右上角入口按钮 */
  var btn = document.createElement('span');
  btn.id = 'dvTourBtn';
  btn.className = 'fs-hint';
  btn.textContent = cfg.btnText || '看板导读';
  var hr = stage.querySelector('.h-right');
  if(hr){ hr.insertBefore(btn, hr.firstChild); }
  else{
    btn.id = 'dvTourBtnFixed';
    stage.appendChild(btn);
  }

  /* ---------- 工具 ---------- */
  var tour = wrap, mask = document.getElementById('dvTourMask'),
      hole = document.getElementById('dvTourHole'), plugs = document.getElementById('dvTourPlugs'),
      card = document.getElementById('dvTourCard');
  var cur = 0, editing = false, steps = [];

  function scale(){
    var k = stage.getBoundingClientRect().width / BASE_W;
    return (isFinite(k) && k > 0) ? k : 1;
  }
  function relRect(el){
    var r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect(), k = scale();
    return {x:(r.left - sr.left)/k, y:(r.top - sr.top)/k, w:r.width/k, h:r.height/k};
  }
  function pad(r, p){ return {x:r.x-p, y:r.y-p, w:r.w+2*p, h:r.h+2*p}; }

  /* 弹框避让高亮区：下 → 上 → 右 → 左；都放不下则贴边等比缩小 */
  function placeCard(R){
    var ch = card.offsetHeight || 320, cw = card.offsetWidth || 760, M = 16, T = 12;
    function set(x, y, s){
      s = s || 1;
      card.style.transform = s !== 1 ? 'scale(' + s + ')' : 'none';
      card.style.transformOrigin = s !== 1 ? 'top left' : '';
      card.style.left = Math.max(T, Math.min(x, BASE_W - cw*s - T)) + 'px';
      card.style.top  = Math.max(T, Math.min(y, BASE_H - ch*s - T)) + 'px';
    }
    if(!R){ set((BASE_W-cw)/2, (BASE_H-ch)/2); return; }
    if(R.y + R.h + M + ch <= BASE_H - T){ set((BASE_W-cw)/2, R.y + R.h + M); return; }
    if(R.y - M - ch >= T){ set((BASE_W-cw)/2, R.y - M - ch); return; }
    if(ch <= R.h && R.x + R.w + M + cw <= BASE_W - T){ set(R.x + R.w + M, R.y + R.h/2 - ch/2); return; }
    if(ch <= R.h && R.x - M - cw >= T){ set(R.x - M - cw, R.y + R.h/2 - ch/2); return; }
    var freeL = R.x - M - T, freeR = BASE_W - T - (R.x + R.w + M);
    var right = freeR >= freeL;
    var s = Math.max(0.55, Math.min(1, (right ? freeR : freeL) / cw));
    set(right ? R.x + R.w + M : R.x - M - cw*s, R.y + R.h/2 - ch*s/2, s);
  }

  /* ---------- 文案持久化：localStorage 按站号合并，非法项回退默认 ---------- */
  function loadSteps(){
    var saved = {};
    try{ saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; }catch(e){ saved = {}; }
    return cfg.steps.map(function(st, i){
      var s = saved[i];
      return (s && typeof s.t === 'string' && typeof s.d === 'string') ? {t:s.t, d:s.d} : {t:st.t, d:st.d};
    });
  }
  function saveSteps(){
    try{
      localStorage.setItem(LS_KEY, JSON.stringify(steps.map(function(st){ return {t:st.t, d:st.d}; })));
    }catch(e){}
  }
  steps = loadSteps();

  /* ---------- 渲染某一步 ---------- */
  function show(i){
    cur = Math.max(0, Math.min(i, steps.length-1));
    var st = cfg.steps[cur], txt = steps[cur];
    document.getElementById('dvTcStep').textContent = cur === 0 ? (cfg.btnText || '看板导读') + ' · GUIDE' : '第 ' + cur + ' / ' + (steps.length-1) + ' 站';
    document.getElementById('dvTcTitle').innerHTML = txt.t;
    document.getElementById('dvTcDesc').innerHTML = txt.d;
    document.getElementById('dvTcPrev').classList.toggle('dis', cur === 0);
    document.getElementById('dvTcNext').textContent = cur === steps.length-1 ? '完 成' : '下一步';
    tour.classList.add('on');

    var R = null;
    var target = st.sel ? stage.querySelector(st.sel) : null;
    if(target){
      R = pad(relRect(target), (typeof st.pad === 'number') ? st.pad : 8);
      mask.style.display = 'none'; hole.style.display = 'block';
      hole.style.left = R.x+'px'; hole.style.top = R.y+'px';
      hole.style.width = R.w+'px'; hole.style.height = R.h+'px';
      plugs.innerHTML = '';
      (Array.isArray(st.exclude) ? st.exclude : []).forEach(function(x){
        var el = stage.querySelector(x);
        if(!el) return;
        var P = pad(relRect(el), 8);
        var pg = document.createElement('div');
        pg.className = 'dv-plug';
        pg.style.left = P.x+'px'; pg.style.top = P.y+'px';
        pg.style.width = P.w+'px'; pg.style.height = P.h+'px';
        plugs.appendChild(pg);
      });
    }else{
      mask.style.display = 'block'; hole.style.display = 'none';
      plugs.innerHTML = '';
    }
    placeCard(R);
  }
  function close(){ tour.classList.remove('on'); }
  function next(){ cur >= steps.length-1 ? close() : show(cur+1); }
  function prev(){ show(cur-1); }

  /* ---------- 编辑模式 ---------- */
  function setEditing(on){
    editing = on;
    document.getElementById('dvTcEditBox').style.display = on ? 'block' : 'none';
    document.getElementById('dvTcTitle').style.display = on ? 'none' : '';
    document.getElementById('dvTcDesc').style.display = on ? 'none' : '';
    document.getElementById('dvTcEdit').textContent = on ? '取 消' : '编 辑';
    if(on){
      document.getElementById('dvTcEditTitle').value = steps[cur].t;
      document.getElementById('dvTcEditDesc').value = steps[cur].d;
    }
  }
  document.getElementById('dvTcEdit').addEventListener('click', function(){ setEditing(!editing); });
  document.getElementById('dvTcSave').addEventListener('click', function(){
    var t = document.getElementById('dvTcEditTitle').value.trim();
    var d = document.getElementById('dvTcEditDesc').value.trim();
    if(!t || !d) return;
    steps[cur] = {t:t, d:d};
    saveSteps();
    setEditing(false);
    show(cur);
  });
  document.getElementById('dvTcReset').addEventListener('click', function(){
    try{ localStorage.removeItem(LS_KEY); }catch(e){}
    steps = loadSteps();
    setEditing(false);
    show(cur);
  });

  /* ---------- 事件 ---------- */
  document.getElementById('dvTcNext').addEventListener('click', next);
  document.getElementById('dvTcPrev').addEventListener('click', prev);
  document.getElementById('dvTcSkip').addEventListener('click', close);
  btn.addEventListener('click', function(){ show(0); });
  tour.addEventListener('dblclick', function(e){ e.stopPropagation(); });   /* 别触发双击全屏 */
  document.addEventListener('keydown', function(e){
    if(!tour.classList.contains('on')) return;
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if(e.key === 'Escape'){ if(editing) setEditing(false); else close(); }
    else if(e.key === 'Enter' || e.key === 'ArrowRight'){ next(); }
    else if(e.key === 'ArrowLeft'){ prev(); }
  });
  window.addEventListener('resize', function(){ if(tour.classList.contains('on')) show(cur); });

  window.TourAPI = {show: show, close: close, next: next, prev: prev};
  if(cfg.autostart !== false){ setTimeout(function(){ show(0); }, 600); }
})();
