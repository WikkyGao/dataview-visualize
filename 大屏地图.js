/* ============================================================
   大屏地图.js — 地图光点板块（通用版 v1.0）
   能力：光点地标（脉冲）· 拖拽微调（localStorage 持久化）· 光点↔卡片
         虚线连线 · 光点间飞线弧 · 16:9 等比适配居中裁切 · 点击联动 · 重置
   依赖：#stage（1920×1080 基座约定）；底图由页面 CSS 挂在容器背景上
   用法：先定义配置再引入——
   <script>
     window.DVMAP = {
       wrap:  '.map-wrap',       // 包含「卡片列 + 地图」的内容区（连线 SVG 铺满这里）
       box:   '#geoBox',         // 地图容器（底图背景挂它身上，JS 控制 16:9 尺寸）
       reset: '#mkReset',        // 重置按钮（可选）
       lsVersion: 1,             // 坐标体系变化（换底图/改投影）时 +1，弃用旧拖拽位置
       fit: {ratio: 16/9},       // 高度铺满、宽=高*ratio、居中裁切；false 则尺寸全交页面 CSS
       projection: {center: [33.6, 104.6], zoom: 4.75, scale: 1.3},
                                 // 经纬度→百分比 的墨卡托换算；scale 必须与底图
                                 // background-size:(scale*100)% 严格对应；省略则标记直接用 x/y
       markers: [
         {k:'a', x:60, y:40,               c:'#35D6FF', label:'点A'},   // 直接百分比坐标
         {k:'b', lat:39.9, lng:116.4,      c:'#FFC24A'}                  // 或经纬度（需 projection）
       ],
       arcs: [['a','b']],                 // 光点间飞线弧（可选）
       arcStroke: 'rgba(90,225,255,.45)', // 飞线弧颜色（可选，深底默认）
       linkStroke: 'rgba(53,214,255,.55)' // 光点→卡片连线颜色（可选；浅底大屏建议加深，如 rgba(22,104,220,.5)）
     };
   </script>
   <script src="大屏地图.js"></script>
   联动约定：页面里任意元素带 data-dmk="<k>"（左侧指标卡等）即与对应光点绑定——
   点击任一方双方加 .on 类（高亮样式由页面 CSS 负责），并画光点→卡片虚线连线。
   API：window.DvMapAPI = { select(k), reset(), redraw() }
   ============================================================ */
(function(){
  var cfg = window.DVMAP;
  if(!cfg || !Array.isArray(cfg.markers) || !cfg.markers.length) return;
  var stage = document.getElementById('stage');
  if(!stage) return;
  var wrap = cfg.wrap ? stage.querySelector(cfg.wrap) : null;
  var box  = stage.querySelector(cfg.box || '#geoBox');
  if(!box) return;
  if(!wrap) wrap = box.parentElement;

  function slug(s){ return String(s || 'screen').replace(/\s+/g, '-'); }
  var LS_KEY = 'dvMap-' + slug(document.title) + '-v' + (cfg.lsVersion || 1);
  var VW = 1920, VH = 1080;

  /* ---------- 样式注入（光点/脉冲/标签芯片） ---------- */
  var css = document.createElement('style');
  css.textContent =
  '.dmk{position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center;' +
    'cursor:grab; z-index:5; user-select:none; touch-action:none;}' +
  '.dmk.drag{cursor:grabbing; z-index:9;}' +
  '.dmk .dot{position:relative; width:12px; height:12px; border-radius:50%;' +
    'background:var(--c,#35D6FF); box-shadow:0 0 14px var(--c,#35D6FF);}' +
  '.dmk .dot::before{content:""; position:absolute; inset:-6px; border-radius:50%;' +
    'border:1.5px solid var(--c,#35D6FF); opacity:.45;}' +
  '.dmk .dot::after{content:""; position:absolute; inset:-6px; border-radius:50%;' +
    'background:var(--c,#35D6FF); opacity:.35; animation:dvMkPulse 2.4s ease-out infinite;}' +
  '.dmk.on .dot{filter:drop-shadow(0 0 8px var(--c,#35D6FF)) brightness(1.2);}' +
  '.dmk .lb{order:-1; margin-bottom:8px; white-space:nowrap; font-family:var(--cn,"PingFang SC",sans-serif);' +
    'font-size:11px; letter-spacing:1px; color:var(--dv-map-label,#EAF6FF); padding:3px 8px;' +
    'border:1px solid rgba(90,225,255,.55); background:rgba(5,20,36,.88); border-radius:2px;' +
    'box-shadow:0 0 12px rgba(53,214,255,.22); pointer-events:none;}' +
  '@keyframes dvMkPulse{0%{transform:scale(.5); opacity:.85;} 70%,100%{transform:scale(2.1); opacity:0;}}';
  document.head.appendChild(css);

  /* ---------- 结构：box 内铺一层飞线弧 SVG ---------- */
  var arcSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arcSvg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
  arcSvg.setAttribute('preserveAspectRatio', 'none');
  arcSvg.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible;';
  box.appendChild(arcSvg);

  /* 连线层：铺满 wrap（在 box 之外，坐标系 = wrap 的基座像素） */
  var linkSvg = null;
  if(wrap && wrap !== box){
    linkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    linkSvg.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:10; overflow:visible;';
    wrap.appendChild(linkSvg);
  }

  /* ---------- 投影与坐标 ---------- */
  var saved = {};
  try{ saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; }catch(e){ saved = {}; }
  var proj = cfg.projection || null;
  function mercator(lat, lng){
    var scl = 256 * Math.pow(2, proj.zoom) * (proj.scale || 1);
    function mx(lg){ return (lg + 180) / 360 * scl; }
    function my(la){ var s = Math.sin(la * Math.PI / 180);
      return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scl; }
    return { x: mx(lng) - mx(proj.center[1]) + VW/2, y: my(lat) - my(proj.center[0]) + VH/2 };
  }
  function basePos(m){
    if(proj && typeof m.lat === 'number' && typeof m.lng === 'number'){
      var p = mercator(m.lat, m.lng);
      return {x: p.x / VW * 100, y: p.y / VH * 100};
    }
    return {x: m.x || 50, y: m.y || 50};
  }

  /* ---------- 建光点 ---------- */
  var markers = {};
  cfg.markers.forEach(function(m){
    var p = saved[m.k] || basePos(m);
    var el = document.createElement('div');
    el.className = 'dmk';
    el.dataset.dmk = m.k;
    el.title = m.tip || '可拖拽 · 点击联动';
    el.style.setProperty('--c', m.c || '#35D6FF');
    el.style.left = p.x + '%';
    el.style.top = p.y + '%';
    if(m.label){ var lb = document.createElement('div'); lb.className = 'lb'; lb.textContent = m.label; el.appendChild(lb); }
    var dot = document.createElement('div'); dot.className = 'dot'; el.appendChild(dot);
    box.appendChild(el);
    markers[m.k] = {el:el, cfg:m};
    el.addEventListener('click', function(e){ e.stopPropagation(); select(m.k); });
    el.addEventListener('dblclick', function(e){ e.stopPropagation(); });  /* 别触发双击全屏 */
  });

  /* ---------- 点击联动：光点 ↔ 所有 [data-dmk] 卡片 ---------- */
  function select(k){
    stage.querySelectorAll('[data-dmk]').forEach(function(el){
      el.classList.toggle('on', el.getAttribute('data-dmk') === k);
    });
    redraw();
    if(typeof cfg.onSelect === 'function'){ try{ cfg.onSelect(k); }catch(e){} }
  }
  stage.querySelectorAll('[data-dmk]').forEach(function(el){
    if(el.classList.contains('dmk')) return;               /* 光点已单独绑定 */
    el.addEventListener('click', function(e){
      e.stopPropagation();
      select(el.getAttribute('data-dmk'));
    });
  });

  /* ---------- 几何工具（单位：光点百分比 ↔ 各 SVG 坐标系） ---------- */
  function anchorPct(el){ return {x:parseFloat(el.style.left), y:parseFloat(el.style.top)}; }
  function anchorArc(el){ var p = anchorPct(el); return {x:p.x/100*VW, y:p.y/100*VH}; }
  function anchorLink(el){                             /* 光点在 wrap 坐标系中的位置 */
    var sr = stage.getBoundingClientRect();
    var wr = wrap.getBoundingClientRect();
    var k = sr.width / VW || 1;
    var r = el.getBoundingClientRect();
    return {x:(r.left + r.width/2 - wr.left)/k, y:(r.top + r.height/2 - wr.top)/k};
  }

  /* ---------- 飞线弧（光点间，二次贝塞尔，弧顶朝上） ---------- */
  function drawArcs(){
    if(!Array.isArray(cfg.arcs) || !cfg.arcs.length){ arcSvg.innerHTML = ''; return; }
    var d = '';
    cfg.arcs.forEach(function(a){
      var A = markers[a[0]], B = markers[a[1]];
      if(!A || !B) return;
      var P = anchorArc(A.el), Q = anchorArc(B.el);
      var mx = (P.x + Q.x)/2, my = (P.y + Q.y)/2;
      var dx = Q.x - P.x, dy = Q.y - P.y, len = Math.sqrt(dx*dx + dy*dy) || 1;
      var nx = -dy/len, ny = dx/len;
      if(ny > 0){ nx = -nx; ny = -ny; }                 /* 法线翻向上 */
      var bow = Math.min(len * .22, 110);
      d += 'M' + P.x.toFixed(0) + ' ' + P.y.toFixed(0) +
           ' Q' + (mx + nx*bow).toFixed(0) + ' ' + (my + ny*bow).toFixed(0) +
           ' ' + Q.x.toFixed(0) + ' ' + Q.y.toFixed(0) + ' ';
    });
    arcSvg.innerHTML = '<path d="' + d.trim() + '" fill="none" stroke="' + (cfg.arcStroke || 'rgba(90,225,255,.45)') + '" stroke-width="2.5" stroke-dasharray="10 14"/>';
  }

  /* ---------- 光点 → 卡片 虚线连线（wrap 坐标系） ---------- */
  function drawLinks(){
    if(!linkSvg) return;
    var sr = stage.getBoundingClientRect();
    var wr = wrap.getBoundingClientRect();
    var k = sr.width / VW || 1;
    linkSvg.setAttribute('viewBox', '0 0 ' + (wr.width/k) + ' ' + (wr.height/k));
    var d = '';
    cfg.markers.forEach(function(m){
      var mk = markers[m.k] && markers[m.k].el;
      var card = wrap.querySelector('[data-dmk="' + m.k + '"]:not(.dmk)');
      if(!mk || !card) return;
      var cr = card.getBoundingClientRect();
      var C = {x:(cr.right - wr.left)/k, y:(cr.top + cr.height/2 - wr.top)/k};
      var M = anchorLink(mk);
      var cx = (C.x + M.x)/2;
      d += '<path d="M' + C.x.toFixed(1) + ' ' + C.y.toFixed(1) +
           ' C' + (C.x + 46).toFixed(1) + ' ' + C.y.toFixed(1) + ',' + cx.toFixed(1) + ' ' + M.y.toFixed(1) + ',' + M.x.toFixed(1) + ' ' + M.y.toFixed(1) +
           '" style="stroke:' + (cfg.linkStroke || 'rgba(53,214,255,.55)') + '" fill="none" stroke-width="1.4" stroke-dasharray="6 6" opacity=".55"/>';
    });
    linkSvg.innerHTML = d;
  }
  function redraw(){ drawArcs(); drawLinks(); }

  /* ---------- 16:9 适配：高度铺满、宽=高*ratio、居中裁切 ---------- */
  function fit(){
    if(cfg.fit === false || !wrap || wrap === box){ redraw(); return; }
    var w = wrap.clientWidth, h = wrap.clientHeight;
    if(!w || !h){ redraw(); return; }
    var ratio = (cfg.fit && cfg.fit.ratio) || 16/9;
    box.style.width = (h * ratio) + 'px';
    box.style.height = h + 'px';
    redraw();
  }

  /* ---------- 拖拽（pointer capture，范围钳制，位置持久化） ---------- */
  var drag = null;
  box.addEventListener('pointerdown', function(e){
    var el = e.target.closest('.dmk');
    if(!el) return;
    e.preventDefault();
    drag = {el:el, sx:e.clientX, sy:e.clientY,
            ox:parseFloat(el.style.left), oy:parseFloat(el.style.top), moved:false};
    el.classList.add('drag');
    try{ el.setPointerCapture(e.pointerId); }catch(err){}
  });
  box.addEventListener('pointermove', function(e){
    if(!drag) return;
    var dx = (e.clientX - drag.sx) / box.clientWidth * 100;
    var dy = (e.clientY - drag.sy) / box.clientHeight * 100;
    if(Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 3) drag.moved = true;
    var nx = Math.max(2, Math.min(98, drag.ox + dx));
    var ny = Math.max(6, Math.min(94, drag.oy + dy));
    drag.el.style.left = nx + '%';
    drag.el.style.top = ny + '%';
    redraw();
  });
  function endDrag(){
    if(!drag) return;
    drag.el.classList.remove('drag');
    if(drag.moved){
      try{
        var pos = {};
        Object.keys(markers).forEach(function(k){
          var p = anchorPct(markers[k].el);
          pos[k] = {x:p.x, y:p.y};
        });
        localStorage.setItem(LS_KEY, JSON.stringify(pos));
      }catch(e){}
    }
    drag = null;
  }
  box.addEventListener('pointerup', endDrag);
  box.addEventListener('pointercancel', endDrag);

  /* ---------- 重置 ---------- */
  var rst = cfg.reset ? stage.querySelector(cfg.reset) : null;
  function doReset(){
    try{ localStorage.removeItem(LS_KEY); }catch(e){}
    cfg.markers.forEach(function(m){
      var p = basePos(m);
      markers[m.k].el.style.left = p.x + '%';
      markers[m.k].el.style.top = p.y + '%';
    });
    redraw();
  }
  if(rst){ rst.addEventListener('click', doReset); }

  window.addEventListener('resize', redraw);
  if(window.ResizeObserver && wrap){ new ResizeObserver(fit).observe(wrap); }

  fit();
  window.DvMapAPI = {select: select, reset: doReset, redraw: redraw};
})();
