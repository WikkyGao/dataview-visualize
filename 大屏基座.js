/* ============================================================
   数据安全运营大屏 · 统一基座 v1.0（脚本）
   提供：1920×1080 等比缩放适配 / 双击全屏 / 时钟(.js-clock) /
        数字滚动([data-num]，支持 data-dec、data-suffix、内嵌 <small>)
   ============================================================ */
(function(){
  var stage = document.getElementById('stage');
  var BASE_W = 1920, BASE_H = 1080;

  /* ---- 等比缩放：任意窗口尺寸完整显示，不裁切不变形 ---- */
  function fit(){
    var s = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
    if(!isFinite(s) || s <= 0){ s = 1; }
    stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
  }
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
  if(window.visualViewport){ window.visualViewport.addEventListener('resize', fit); }

  /* ---- 双击进入/退出全屏 ---- */
  stage.addEventListener('dblclick', function(){
    if(document.fullscreenElement){
      document.exitFullscreen && document.exitFullscreen();
    }else if(document.documentElement.requestFullscreen){
      document.documentElement.requestFullscreen();
    }else if(document.webkitFullscreenElement !== undefined){
      if(document.webkitFullscreenElement){ document.webkitExitFullscreen && document.webkitExitFullscreen(); }
      else{ document.documentElement.webkitRequestFullscreen && document.documentElement.webkitRequestFullscreen(); }
    }
    setTimeout(fit, 300);
  });

  /* ---- 时钟：所有 .js-clock 元素统一更新 ---- */
  function clock(){
    var d = new Date();
    var p = function(n){ return String(n).padStart(2,'0'); };
    var s = d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' +
            p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    document.querySelectorAll('.js-clock').forEach(function(el){ el.textContent = s; });
  }
  clock(); setInterval(clock, 1000);

  /* ---- 数字滚动 ---- */
  function replayNumbers(){
    document.querySelectorAll('[data-num]').forEach(function(el){
      var target = parseFloat(el.getAttribute('data-num'));
      var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
      var suffix = el.getAttribute('data-suffix') || '';
      var small = el.querySelector('small');
      if(small){ suffix += small.outerHTML; }
      var t0 = null, dur = 900;
      function fmt(v){
        var n = dec > 0 ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US');
        return n + suffix;
      }
      function frame(ts){
        if(!t0) t0 = ts;
        var p2 = Math.min(1, (ts - t0) / dur);
        var e = 1 - Math.pow(1 - p2, 3);
        el.innerHTML = fmt(target * e);
        if(p2 < 1){ requestAnimationFrame(frame); }
      }
      requestAnimationFrame(frame);
    });
  }
  replayNumbers();
})();
