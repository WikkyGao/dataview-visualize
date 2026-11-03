/* ============================================================
   大屏编辑.js — 模块标题双击编辑（通用版 v1.0）
   依赖：无（配合 大屏基座.css 使用；与基座「双击全屏」不冲突）
   行为：
   - 双击进入编辑：.panel-h h2、.kpi .n、header h1，以及所有带 data-editable 的元素
   - 进入即全选；Enter / 失焦 = 保存；Esc = 还原进入前的文案
   - 元素带 data-edit-key="xxx" 时文案持久化到 localStorage（key 含页面标题），刷新自动回填
   - 编辑目标上已 stopPropagation，不会触发基座的双击全屏
   ============================================================ */
(function(){
  var SEL = '.panel-h h2, .kpi .n, header h1, [data-editable]';
  function slug(s){ return String(s || 'screen').replace(/\s+/g, '-'); }
  var LS_PREFIX = 'dvTitles-' + slug(document.title) + '-';

  /* 回填已保存的标题（仅限带 data-edit-key 的元素） */
  document.querySelectorAll(SEL).forEach(function(el){
    var key = el.getAttribute('data-edit-key');
    if(!key) return;
    try{
      var saved = localStorage.getItem(LS_PREFIX + key);
      if(saved !== null && saved !== ''){ el.innerHTML = saved; }
    }catch(e){}
  });

  document.querySelectorAll(SEL).forEach(function(el){
    if(el.__dvEditBound) return;
    el.__dvEditBound = true;
    el.title = '双击编辑文案';
    var orig = '';   /* 进入编辑时的文案，Esc 还原用 */

    el.addEventListener('dblclick', function(e){
      e.stopPropagation();               /* 别触发基座的双击全屏 */
      orig = el.innerHTML;
      el.contentEditable = 'true';
      el.focus();
      var r = document.createRange();
      r.selectNodeContents(el);
      var sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(r);
    });
    el.addEventListener('blur', function(){
      el.contentEditable = 'false';
      var key = el.getAttribute('data-edit-key');
      if(key){
        try{ localStorage.setItem(LS_PREFIX + key, el.innerHTML); }catch(e){}
      }
      orig = '';
    });
    el.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); el.blur(); }
      if(e.key === 'Escape'){
        if(orig !== ''){ el.innerHTML = orig; }   /* 还原，不保存 */
        el.blur();
      }
    });
    /* 编辑中的点击不要冒泡（避免拖动/全屏等页面级交互） */
    el.addEventListener('click', function(e){
      if(el.contentEditable === 'true'){ e.stopPropagation(); }
    });
  });
})();
