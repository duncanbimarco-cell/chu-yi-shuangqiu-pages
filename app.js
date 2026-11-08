/* 初一年级足球·篮球联赛 —— 赛程 / 比分 / 积分 / 考勤 */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var OWNER = CFG.owner || '';
  var REPO = CFG.repo || '';
  var BRANCH = CFG.branch || 'main';
  var DATA_PATH = CFG.dataPath || 'data/matches.json';
  var API = 'https://api.github.com';
  var CONFIGURED = OWNER && OWNER.indexOf('YOUR_') !== 0;

  var TOKEN_KEY = 'bl_token_' + OWNER + '_' + REPO;
  var UNLOCK_KEY = 'bl_admin_' + OWNER + '_' + REPO;
  var DRAFT_KEY = 'bl_drafts_' + OWNER + '_' + REPO;

  /* 本机暂存：没有网络/没有 Token 时先记在手机里，之后再同步 */
  var drafts = {};
  try { drafts = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {}; } catch (e) { drafts = {}; }
  function saveDrafts() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); } catch (e) { } }
  function draftCount() {
    return Object.keys(drafts).filter(function (id) { return !drafts[id].syncedAt; }).length;
  }
  /* 远端确认到这次写入后，才丢弃本机覆盖，避免被 Pages 旧缓存"改回去" */
  function pruneDrafts() {
    if (!DATA || !DATA.updatedAt) return;
    var ru = new Date(DATA.updatedAt).getTime() || 0;
    var changed = false;
    Object.keys(drafts).forEach(function (id) {
      var d = drafts[id];
      if (d && d.syncedAt && ru >= d.syncedAt) { delete drafts[id]; changed = true; }
    });
    if (changed) saveDrafts();
  }
  function applyDrafts() {
    if (!DATA) return;
    (DATA.matches || []).forEach(function (m) {
      var d = drafts[m.id];
      if (!d) return;
      ['scoreA', 'scoreB', 'status', 'attA', 'attB', 'note'].forEach(function (k) {
        if (k in d) m[k] = d[k];
      });
      m._local = !d.syncedAt;
    });
  }

  var DATA = null;          // 全量数据
  var VIEW = 'schedule';
  var SPORT_FILTER = 'all';
  var classFromURL = parseInt(new URLSearchParams(location.search).get('class') || '', 10);
  // 班级筛选会同步到链接里，方便直接分享给某个班，但不影响通用二维码。
  var CLASS_FILTER = classFromURL >= 1 && classFromURL <= 16 ? classFromURL : 0;
  var token = localStorage.getItem(TOKEN_KEY) || '';
  var isAdmin = localStorage.getItem(UNLOCK_KEY) === '1';
  // 只读模式：链接带 ?readonly=1 时，隐藏录入入口、强制为观众
  var READONLY = /^(1|true|yes)$/i.test(new URLSearchParams(location.search).get('readonly') || '');
  if (READONLY) isAdmin = false;
  var pending = { matches: {}, rounds: null, schedulePhotos: null }; // 待写入的改动
  var lastSync = 0;
  var lastSaveError = '';
  var lastSha = null;   // 最近一次已知的文件版本，读取失败时用来直接写入

  var $ = function (s) { return document.querySelector(s); };
  var app = $('#app');
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ---------- 提示 ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function sync(txt) { $('#syncState').textContent = txt; }

  /* ---------- 编码 / 网络 ---------- */
  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str), bin = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }
  function b64ToUtf8(str) {
    var bin = atob((str || '').replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function ghHeaders() {
    var h = { 'Accept': 'application/vnd.github+json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  /* 带超时的 JSON 读取（网络被墙时不会一直卡住） */
  async function fetchJSON(url, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 6000) : null;
    try {
      var r = await fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { if (timer) clearTimeout(timer); }
  }

  /* 第一步：读同源的 data/matches.json（一定拿得到，秒开） */
  async function loadLocal() {
    try {
      var j = await fetchJSON(DATA_PATH + '?t=' + Date.now(), 6000);
      if (j && j.matches) { DATA = j; lastSync = Date.now(); return true; }
    } catch (e) { /* 往下走 */ }
    if (!DATA) {
      DATA = { version: 1, title: CFG.title || '班级球类联赛', rounds: [], schedulePhotos: [], matches: [] };
      return false;
    }
    return true;
  }

  /* 第二步：后台静默拉取最新（拿不到也不影响看） */
  async function refreshRemote() {
    if (!CONFIGURED) { sync('本地数据'); return false; }
    var bases = [
      'https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/' + BRANCH + '/' + DATA_PATH,
      'https://cdn.jsdelivr.net/gh/' + OWNER + '/' + REPO + '@' + BRANCH + '/' + DATA_PATH
    ];
    for (var i = 0; i < bases.length; i++) {
      try {
        var j = await fetchJSON(bases[i] + '?t=' + Date.now(), 5000);
        if (j && j.matches) {
          DATA = j;
          lastSync = Date.now();
          sync('已同步 ' + new Date().toTimeString().slice(0, 5));
          return true;
        }
      } catch (e) { /* 换下一个源 */ }
    }
    sync(DATA && DATA.matches && DATA.matches.length ? '本地数据 · 实时刷新未连上' : '数据加载失败');
    return false;
  }

  /* 写入时从 GitHub API 取最新版本，绕过浏览器和镜像缓存 */
  async function ghGet(path) {
    var url = API + '/repos/' + OWNER + '/' + REPO + '/contents/' + path +
      '?ref=' + encodeURIComponent(BRANCH) + '&t=' + Date.now() + '-' + Math.random();
    var r = await fetch(url, { headers: ghHeaders(), cache: 'no-store' });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      var err = new Error((j && j.message) || ('HTTP ' + r.status));
      err.status = r.status;
      throw err;
    }
    if (j && j.sha) lastSha = j.sha;
    return j;
  }

  async function ghPut(path, contentB64, message, sha) {
    if (sha === undefined) {
      try { sha = (await ghGet(path)).sha; }
      catch (e) { if (e.status !== 404) throw e; sha = null; }
    }
    var body = { message: message, content: contentB64, branch: BRANCH };
    if (sha) body.sha = sha;
    var r = await fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + path, {
      method: 'PUT', headers: Object.assign(ghHeaders(), { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      var err = new Error((j && j.message) || ('HTTP ' + r.status));
      err.status = r.status;
      throw err;
    }
    return j;
  }

  function showSheetError(msg) {
    var body = $('#sheet').querySelector('.sheet-body') || $('#sheet');
    if (!body) return;
    var div = document.createElement('div');
    div.className = 'warn';
    div.style.marginBottom = '10px';
    div.textContent = '保存失败：' + msg;
    body.insertBefore(div, body.firstChild);
    $('#sheet').scrollTop = 0;
  }

  async function saveAll(msg) {
    lastSaveError = '';
    if (!CONFIGURED) { lastSaveError = '未配置 GitHub 仓库'; toast(lastSaveError); return false; }
    if (!token) { lastSaveError = '没填 GitHub Token（到「录入」页填写）'; toast(lastSaveError); return false; }
    sync('保存中…');
    try {
      var sha;
      try {
        sha = await loadLatestForSave();
      } catch (e0) {
        // 读不到远端内容时，用上一次已知版本直接写入（否则一断网就完全存不了）
        if (!lastSha) throw e0;
        sha = lastSha;
        toast('读取远端失败，直接尝试写入…');
      }
      DATA.updatedAt = new Date().toISOString();
      var j1 = await ghPut(DATA_PATH, utf8ToB64(JSON.stringify(DATA, null, 2)), msg || '更新比赛数据', sha);
      if (j1 && j1.content && j1.content.sha) lastSha = j1.content.sha;
      pending = { matches: {}, rounds: null, schedulePhotos: null };
      lastSync = Date.now();
      sync('已保存 ' + new Date().toTimeString().slice(0, 5));
      return true;
    } catch (e) {
      if (e.status === 409 || e.status === 422) {
        toast('远端有更新，正在合并重试…');
        try {
          var latestSha = await loadLatestForSave();
          DATA.updatedAt = new Date().toISOString();
          var j2 = await ghPut(DATA_PATH, utf8ToB64(JSON.stringify(DATA, null, 2)), msg || '更新比赛数据', latestSha);
          if (j2 && j2.content && j2.content.sha) lastSha = j2.content.sha;
          pending = { matches: {}, rounds: null, schedulePhotos: null };
          lastSync = Date.now();
          sync('已保存 ' + new Date().toTimeString().slice(0, 5));
          return true;
        } catch (e2) { lastSaveError = e2.message; toast('保存失败：' + e2.message); sync('保存失败'); return false; }
      }
      lastSaveError = e.message + (e.status ? '（HTTP ' + e.status + '）' : '');
      if (e.status === 401 || e.status === 403) {
        lastSaveError += ' → Token 无效、过期或没有 Contents 写权限，请到「录入」页重新粘贴 Token';
      } else if (!e.status) {
        lastSaveError += ' → 连不上 GitHub（网络问题），换网络或稍后再试';
      }
      toast('保存失败：' + e.message);
      sync('保存失败');
      return false;
    }
  }

  async function loadLatestForSave() {
    var latest = await ghGet(DATA_PATH);
    var data = JSON.parse(b64ToUtf8(latest.content));
    if (!data || !Array.isArray(data.matches)) throw new Error('GitHub 数据格式不正确');
    DATA = data;
    applyPending();
    return latest.sha;
  }

  function applyPending() {
    Object.keys(pending.matches).forEach(function (id) {
      for (var i = 0; i < DATA.matches.length; i++) {
        if (DATA.matches[i].id === id) { DATA.matches[i] = pending.matches[id]; break; }
      }
    });
    if (pending.rounds) DATA.rounds = pending.rounds;
    if (pending.schedulePhotos) DATA.schedulePhotos = pending.schedulePhotos;
  }
  function markPending(kind, id, obj) {
    if (kind === 'match') pending.matches[id] = obj;
    else pending[kind] = obj;
  }

  /* ---------- 图片压缩 ---------- */
  function compressImage(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          var scale = Math.min(1, maxSide / Math.max(w, h));
          var cw = Math.round(w * scale), ch = Math.round(h * scale);
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
          resolve(cv.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function uploadPhoto(dataUrl, nameHint) {
    var b64 = dataUrl.split(',')[1];
    var path = 'photos/' + nameHint + '-' + Date.now() + '.jpg';
    await ghPut(path, b64, '上传照片 ' + nameHint);
    return 'https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/' + BRANCH + '/' + path;
  }

  /* ---------- 工具 ---------- */
  function sportName(s) { return s === 'football' ? '足球' : '篮球'; }
  function pointsFor(sport) {
    var rules = CFG.points || {};
    if (rules[sport]) return rules[sport];
    // 兼容旧版配置：points 直接写成 { win, draw, lose }。
    if (typeof rules.win === 'number') return rules;
    return sport === 'basketball'
      ? { win: 3, draw: 0, lose: 1 }
      : { win: 3, draw: 1, lose: 0 };
  }
  function teamName(n) { return n + '班'; }
  function isThisWeek(dateStr) {
    if (!dateStr) return false;
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return false;
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var off = (now.getDay() + 6) % 7;
    var mon = new Date(now); mon.setDate(now.getDate() - off);
    var sun = new Date(mon); sun.setDate(mon.getDate() + 7);
    return d >= mon && d < sun;
  }
  function weekdayOf(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return '周' + '日一二三四五六'.charAt(d.getDay());
  }
  function roundMeta(r) {
    var list = (DATA.rounds || []).filter(function (x) { return x.round === r; });
    return list[0] || { round: r, date: '', label: '第' + r + '轮' };
  }
  function sessionMeta(s) {
    var list = (DATA.sessions || []).filter(function (x) { return x.session === s; });
    return list[0] || { session: s, label: s === 1 ? '第一节' : '第二节', desc: '' };
  }
  function shortDate(dateStr) {
    if (!dateStr) return '日期待定';
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function classNumbers() {
    var classes = {};
    (DATA.matches || []).forEach(function (m) { classes[m.a] = true; classes[m.b] = true; });
    return Object.keys(classes).map(Number).sort(function (a, b) { return a - b; });
  }
  function matchesForClass(cls) {
    return (DATA.matches || []).filter(function (m) { return m.a === cls || m.b === cls; })
      .sort(function (a, b) { return a.round - b.round || (a.session || 1) - (b.session || 1); });
  }
  function nextRoundInfo() {
    var byRound = {};
    (DATA.matches || []).forEach(function (m) {
      byRound[m.round] = byRound[m.round] || [];
      byRound[m.round].push(m);
    });
    var rounds = Object.keys(byRound).map(Number).sort(function (a, b) { return a - b; });
    if (!rounds.length) return null;
    var r = rounds.filter(function (n) {
      return byRound[n].some(function (m) { return m.status !== 'finished'; });
    })[0] || rounds[rounds.length - 1];
    var list = byRound[r];
    return {
      round: r,
      meta: roundMeta(r),
      total: list.length,
      finished: list.filter(function (m) { return m.status === 'finished'; }).length
    };
  }
  function publicShareURL() {
    var url = new URL(location.href);
    url.search = '';
    url.searchParams.set('readonly', '1');
    if (CLASS_FILTER) url.searchParams.set('class', String(CLASS_FILTER));
    return url.toString();
  }
  function saveClassFilter(cls) {
    CLASS_FILTER = cls;
    var url = new URL(location.href);
    if (CLASS_FILTER) url.searchParams.set('class', String(CLASS_FILTER));
    else url.searchParams.delete('class');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  function leagueStats() {
    var matches = DATA.matches || [], teams = {}, rounds = {};
    var finished = 0;
    matches.forEach(function (m) {
      teams[m.a] = true; teams[m.b] = true; rounds[m.round] = true;
      if (m.status === 'finished' && m.scoreA != null && m.scoreB != null) finished++;
    });
    return {
      teams: Object.keys(teams).length,
      matches: matches.length,
      rounds: Object.keys(rounds).length,
      finished: finished
    };
  }

  function matchdayHTML() {
    var next = nextRoundInfo();
    if (!next) return '';
    var meta = next.meta || {};
    var dateLabel = meta.date ? shortDate(meta.date) + ' · ' + weekdayOf(meta.date) : '日期待定';
    var sessionOne = sessionMeta(1);
    return '<section class="matchday-card" aria-label="下一比赛日">' +
      '<div class="matchday-date"><span>下一比赛日</span><strong>' + esc(dateLabel) + '</strong></div>' +
      '<div class="matchday-copy"><span class="matchday-kicker">ROUND ' + String(next.round).padStart(2, '0') + '</span>' +
      '<h3>' + esc(meta.label || ('第' + next.round + '轮')) + ' · ' + next.finished + '/' + next.total + ' 场已结束</h3>' +
      '<p>' + esc(sessionOne.desc || '两节比赛，足球和篮球轮换进行') + '</p></div>' +
      '<button class="round-jump" data-jump-round="' + next.round + '">查看<br>本轮</button>' +
      '</section>';
  }

  function classFocusHTML() {
    var classes = classNumbers();
    var focusMatches = CLASS_FILTER ? matchesForClass(CLASS_FILTER) : [];
    var finished = focusMatches.filter(function (m) { return m.status === 'finished'; }).length;
    var next = focusMatches.filter(function (m) { return m.status !== 'finished'; })[0];
    var title = CLASS_FILTER ? teamName(CLASS_FILTER) + '专属赛程' : '查找本班赛程';
    var detail = CLASS_FILTER
      ? '共 ' + focusMatches.length + ' 场 · 已结束 ' + finished + ' 场' +
        (next ? ' · 下一场：第' + next.round + '轮' + sessionMeta(next.session || 1).label + ' ' + sportName(next.sport) : ' · 全部比赛已结束')
      : '选择班级后，只看本班比赛；分享链接也会自动锁定这个班级。';
    var options = '<option value="0">查看全部班级</option>' + classes.map(function (n) {
      return '<option value="' + n + '"' + (CLASS_FILTER === n ? ' selected' : '') + '>' + teamName(n) + '</option>';
    }).join('');
    return '<section class="class-focus" aria-label="班级专属赛程">' +
      '<div class="focus-icon" aria-hidden="true">⌁</div>' +
      '<div class="focus-copy"><span class="focus-kicker">MY CLASS</span><h3>' + esc(title) + '</h3><p>' + esc(detail) + '</p></div>' +
      '<label class="class-select"><span>选择班级</span><select id="classFilter" aria-label="选择要查看的班级">' + options + '</select></label>' +
      '</section>';
  }

  /* ---------- 积分计算 ---------- */
  // parity: 1=单数组班, 0=双数组班, null=全部
  function standings(sport, parity) {
    var P = pointsFor(sport);
    var teams = {};
    (DATA.matches || []).forEach(function (m) {
      if (m.sport !== sport) return;
      if (parity !== null && m.a % 2 !== parity) return;
      teams[m.a] = true; teams[m.b] = true;
    });
    var rows = Object.keys(teams).map(Number).sort(function (a, b) { return a - b; }).map(function (n) {
      return { cls: n, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
    });
    var idx = {};
    rows.forEach(function (r, i) { idx[r.cls] = i; });
    (DATA.matches || []).forEach(function (m) {
      if (m.sport !== sport || m.status !== 'finished') return;
      if (m.scoreA == null || m.scoreB == null) return;
      var A = rows[idx[m.a]], B = rows[idx[m.b]];
      if (!A || !B) return;
      A.p++; B.p++;
      A.gf += m.scoreA; A.ga += m.scoreB;
      B.gf += m.scoreB; B.ga += m.scoreA;
      if (m.scoreA > m.scoreB) { A.w++; B.l++; A.pts += P.win; B.pts += P.lose; }
      else if (m.scoreA < m.scoreB) { B.w++; A.l++; B.pts += P.win; A.pts += P.lose; }
      // 篮球无平局；录入页会要求填写加时后的最终比分。
      else if (sport === 'football') { A.d++; B.d++; A.pts += P.draw; B.pts += P.draw; }
    });
    rows.forEach(function (r) { r.gd = r.gf - r.ga; });
    rows.sort(function (a, b) {
      return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.cls - b.cls;
    });
    return rows;
  }

  /* ---------- 渲染：赛程 ---------- */
  function scheduleHTML() {
    var rounds = {};
    (DATA.matches || []).forEach(function (m) {
      if (SPORT_FILTER !== 'all' && m.sport !== SPORT_FILTER) return;
      if (CLASS_FILTER && m.a !== CLASS_FILTER && m.b !== CLASS_FILTER) return;
      rounds[m.round] = rounds[m.round] || {};
      var s = m.session || 1;
      (rounds[m.round][s] = rounds[m.round][s] || []).push(m);
    });
    var keys = Object.keys(rounds).map(Number).sort(function (a, b) { return a - b; });
    if (!keys.length) return '<div class="card"><div class="empty">暂无赛程</div></div>';

    var stats = leagueStats();
    var brand = CFG.brand || {};
    var focusMatches = CLASS_FILTER ? matchesForClass(CLASS_FILTER) : [];
    var focusFinished = focusMatches.filter(function (m) { return m.status === 'finished'; }).length;
    var heroTitle = CLASS_FILTER ? teamName(CLASS_FILTER) : (brand.heroTitle || '双球联赛');
    var heroAccent = CLASS_FILTER ? '专属赛程' : (brand.heroAccent || '开赛');
    var heroStats = CLASS_FILTER
      ? '<div><strong>' + focusMatches.length + '</strong><span>本班场次</span></div>' +
        '<div><strong>' + focusMatches.filter(function (m) { return m.sport === 'football'; }).length + '</strong><span>足球场次</span></div>' +
        '<div><strong>' + focusMatches.filter(function (m) { return m.sport === 'basketball'; }).length + '</strong><span>篮球场次</span></div>'
      : '<div><strong>' + stats.teams + '</strong><span>参赛班级</span></div>' +
        '<div><strong>' + stats.matches + '</strong><span>全部对阵</span></div>' +
        '<div><strong>' + stats.rounds + '</strong><span>比赛轮次</span></div>';
    var html = '<section class="league-hero">' +
      '<div class="hero-copy"><span class="hero-kicker">' + esc(brand.heroKicker || '2026 · CLASS LEAGUE') + '</span>' +
      '<h2>' + esc(heroTitle) + ' <em>' + esc(heroAccent) + '</em></h2>' +
      '<p>' + esc(brand.motto || '16 个班 · 足球与篮球 · 一起为班级而战') + '</p></div>' +
      '<div class="hero-balls" aria-hidden="true"><span>⚽</span><span>🏀</span></div>' +
      '<div class="hero-stats">' + heroStats + '</div></section>' +
      matchdayHTML() +
      classFocusHTML() +
      '<div class="schedule-status"><span class="pulse-dot"></span>' +
      (CLASS_FILTER ? esc(teamName(CLASS_FILTER)) + '进度 <strong>' + focusFinished + ' / ' + focusMatches.length + '</strong> 场已结束'
        : '赛季进度 <strong>' + stats.finished + ' / ' + stats.matches + '</strong> 场已结束') + '</div>' +
      '<div class="seg">' +
      '<button data-sport="all" class="' + (SPORT_FILTER === 'all' ? 'on' : '') + '">全部</button>' +
      '<button data-sport="football" class="' + (SPORT_FILTER === 'football' ? 'on' : '') + '">⚽ 足球</button>' +
      '<button data-sport="basketball" class="' + (SPORT_FILTER === 'basketball' ? 'on' : '') + '">🏀 篮球</button>' +
      '</div>';

    keys.forEach(function (r) {
      var meta = roundMeta(r);
      var thisWeek = isThisWeek(meta.date);
      var photos = (DATA.schedulePhotos || []).filter(function (p) { return p.round === r; });
      html += '<div class="round-block" id="round-' + r + '">';
      html += '<div class="round-title"><span class="round-index">' + String(r).padStart(2, '0') + '</span><span class="dot"></span><span class="round-name">' + esc(meta.label || ('第' + r + '轮')) + '</span>' +
        (meta.date ? ' · ' + esc(meta.date) + ' ' + weekdayOf(meta.date) : '') +
        (thisWeek ? '<span class="week badge done">本周</span>' : '') + '</div>';
      photos.forEach(function (p) {
        html += '<div class="card"><img class="schedule-photo" src="' + esc(p.url) + '" alt="第' + r + '轮赛程图"></div>';
      });
      [1, 2].forEach(function (s) {
        var list = rounds[r][s];
        if (!list || !list.length) return;
        var sm = sessionMeta(s);
        html += '<div class="round-title session-title session-' + s + '"><span class="dot"></span>' +
          esc(sm.label) + '<span class="week">' + esc(sm.desc) + '</span></div>';
        html += '<div class="card">';
        list.forEach(function (m) { html += matchRowHTML(m); });
        html += '</div>';
      });
      html += '</div>';
    });
    if (READONLY) {
      html += '<div class="hint" style="text-align:center;padding:2px 0 10px">' +
        '<a href="./" style="color:var(--muted);text-decoration:none">裁判 / 组委会入口 →</a></div>';
    }
    return html;
  }

  function matchRowHTML(m) {
    var done = m.status === 'finished' && m.scoreA != null && m.scoreB != null;
    var aWin = done && m.scoreA > m.scoreB, bWin = done && m.scoreB > m.scoreA;
    var meta = [];
    if (m.venue) meta.push('📍' + esc(m.venue));
    if (m.date) meta.push('🕒' + esc(m.date));
    if (m.photos && m.photos.length) meta.push('📷' + m.photos.length);
    if (m.attA && m.attA.count) meta.push('👥' + m.attA.count + '+' + (m.attB && m.attB.count ? m.attB.count : 0));
    return '<div class="match match-' + m.sport + '" data-id="' + esc(m.id) + '">' +
      '<span class="tag ' + m.sport + '">' + sportName(m.sport) + '</span>' +
      '<div class="teams">' +
      '<div class="row ' + (done ? (aWin ? 'win' : (bWin ? 'lose' : '')) : '') + '"><span class="cls">' + teamName(m.a) + '</span><span class="sc">' + (done ? m.scoreA : '-') + '</span></div>' +
      '<div class="row ' + (done ? (bWin ? 'win' : (aWin ? 'lose' : '')) : '') + '"><span class="cls">' + teamName(m.b) + '</span><span class="sc">' + (done ? m.scoreB : '-') + '</span></div>' +
      (meta.length ? '<div class="meta">' + meta.join(' ') + '</div>' : '') +
      '</div>' +
      '<div class="right"><span class="badge ' + (m._local ? '' : (done ? 'done' : 'pending')) + '">' +
      (m._local ? '待同步' : (done ? '已结束' : '待战')) + '</span></div>' +
      '</div>';
  }

  /* ---------- 渲染：积分榜 ---------- */
  function groupTable(sport, parity, title) {
    var rows = standings(sport, parity);
    var unit = sport === 'football' ? '球' : '分';
    var basketball = sport === 'basketball';
    var html = '<div class="round-title ranking-group ranking-' + sport + '"><span class="dot"></span>' + title + '</div>';
    if (!rows.length) { return html + '<div class="card"><div class="empty">暂无数据</div></div>'; }
    html += '<div class="card standing-card"><table><thead><tr><th class="rk"></th>' +
      '<th style="text-align:left;padding-left:12px">班级</th><th>场</th><th>胜</th>' +
      (basketball ? '<th>负</th>' : '<th>平</th><th>负</th>') +
      '<th>进' + unit + '</th><th>失' + unit + '</th><th>净</th><th>积分</th></tr></thead><tbody>';
    rows.forEach(function (r, i) {
      var cls = i === 0 ? 'rank1' : (i === 1 ? 'rank2' : (i === 2 ? 'rank3' : ''));
      html += '<tr class="' + cls + '"><td class="rk"><span>' + (i + 1) + '</span></td>' +
        '<td class="name">' + teamName(r.cls) + '</td><td class="num">' + r.p + '</td>' +
        '<td class="num">' + r.w + '</td>' +
        (basketball ? '<td class="num">' + r.l + '</td>' : '<td class="num">' + r.d + '</td><td class="num">' + r.l + '</td>') +
        '<td class="num">' + r.gf + '</td><td class="num">' + r.ga + '</td>' +
        '<td class="num">' + (r.gd > 0 ? '+' : '') + r.gd + '</td>' +
        '<td class="num" style="font-weight:800">' + r.pts + '</td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function standingsHTML() {
    var stats = leagueStats();
    var html = '<section class="view-head view-head-rank"><span class="view-kicker">RANKING BOARD</span><h2>积分榜</h2>' +
      '<p>已完成 ' + stats.finished + ' 场比赛 · 单、双数组班分别排名</p></section>';
    ['football', 'basketball'].forEach(function (sp) {
      html += '<div class="card-hd sport-board sport-board-' + sp + '">' +
        '<h2>' + (sp === 'football' ? '⚽ 足球积分榜' : '🏀 篮球积分榜') + '</h2>' +
        '<span class="sub">16 个班全部参加</span></div>';
      html += groupTable(sp, 1, '单数组班（1/3/5/7/9/11/13/15班）');
      html += groupTable(sp, 0, '双数组班（2/4/6/8/10/12/14/16班）');
      var P = pointsFor(sp);
      var rule = sp === 'basketball'
        ? '胜' + P.win + '分 · 负' + P.lose + '分 · 不设平局'
        : '胜' + P.win + '分 · 平' + P.draw + '分 · 负' + P.lose + '分';
      html += '<div class="legend board-legend">' +
        rule + '；同分先比净' + (sp === 'football' ? '球' : '分') + '，再比进' + (sp === 'football' ? '球' : '分') + '</div>';
      html += '<div style="height:12px"></div>';
    });
    return html;
  }

  /* ---------- 渲染：考勤 ---------- */
  function attendanceHTML() {
    var byCls = {}, total = 0, done = 0;
    (DATA.matches || []).forEach(function (m) {
      var any = (m.attA && m.attA.count) || (m.attB && m.attB.count);
      if (any) done++;
      [[m.a, m.attA], [m.b, m.attB]].forEach(function (pair) {
        var cls = pair[0], att = pair[1] || {};
        if (!att.count) return;
        byCls[cls] = byCls[cls] || { matches: 0, people: 0 };
        byCls[cls].matches++;
        byCls[cls].people += Number(att.count) || 0;
        total += Number(att.count) || 0;
      });
    });
    var html = '<section class="view-head view-head-att"><span class="view-kicker">ATTENDANCE</span><h2>赛事考勤</h2><p>每场录入双方到场人数，自动汇总</p></section>' +
      '<div class="card attendance-overview"><div class="card-hd"><h2>考勤总览</h2></div><div class="att-sum">' +
      '<div class="box"><div class="n">' + done + '</div><div class="l">已考勤场次</div></div>' +
      '<div class="box"><div class="n">' + total + '</div><div class="l">累计到场人次</div></div>' +
      '</div></div>';

    var keys = Object.keys(byCls).map(Number).sort(function (a, b) { return a - b; });
    if (keys.length) {
      html += '<div class="card"><div class="card-hd"><h2>各班到场人次</h2></div><table><thead><tr>' +
        '<th style="text-align:left;padding-left:12px">班级</th><th>场次</th><th>人次</th></tr></thead><tbody>';
      keys.forEach(function (c) {
        html += '<tr><td class="name">' + teamName(c) + '</td><td class="num">' + byCls[c].matches + '</td><td class="num">' + byCls[c].people + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    var list = (DATA.matches || []).filter(function (m) { return (m.attA && m.attA.count) || (m.attB && m.attB.count); });
    if (list.length) {
      html += '<div class="card"><div class="card-hd"><h2>明细</h2><span class="sub">点击可修改</span></div>';
      list.forEach(function (m) {
        html += '<div class="att-item" data-id="' + esc(m.id) + '">' +
          '<div class="t">' + sportName(m.sport) + ' 第' + m.round + '轮' + sessionMeta(m.session || 1).label + ' · ' + teamName(m.a) + ' vs ' + teamName(m.b) + '</div>' +
          '<div class="d">' + teamName(m.a) + '：' + (m.attA.count || 0) + '人' + (m.attA.names ? '（' + esc(m.attA.names) + '）' : '') +
          ' ｜ ' + teamName(m.b) + '：' + (m.attB.count || 0) + '人' + (m.attB.names ? '（' + esc(m.attB.names) + '）' : '') + '</div>' +
          '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="card"><div class="empty">还没录考勤，裁判在「录入」页填写</div></div>';
    }
    return html;
  }

  /* ---------- 渲染：录入（管理） ---------- */
  function adminHTML() {
    if (!isAdmin) {
      return '<div class="card"><div class="card-hd"><h2>裁判 / 组委会入口</h2></div><div class="sheet-body">' +
        '<div class="field"><label>管理口令</label><input type="password" id="codeInput" inputmode="numeric" placeholder="输入口令"></div>' +
        '<div class="field"><label>GitHub Token（只存在本机，不会上传）</label><input type="password" id="tokenInput" placeholder="ghp_… / github_pat_…" value="' + esc(token) + '"></div>' +
        '<button class="btn" id="unlockBtn">进入录入</button>' +
        '<div class="divider"></div>' +
        '<div class="hint">Token 申请：GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → 只选这个仓库，权限勾 <code>Contents: Read and write</code> → 生成后粘贴到这里。Token 只保存在本机浏览器，请勿发到群里、二维码或链接里。</div>' +
        '</div></div>';
    }

    var pendings = (DATA.matches || []).filter(function (m) { return m.status !== 'finished'; });
    var thisWeek = (DATA.matches || []).filter(function (m) { return isThisWeek(m.date || roundMeta(m.round).date); });

    var html = '<div class="card"><div class="card-hd"><h2>快速录入</h2><span class="sub">点比赛即填</span></div>';
    if (thisWeek.length) {
      html += '<div class="round-title" style="padding:8px 14px 4px"><span class="dot"></span>本周场次</div>';
      thisWeek.forEach(function (m) { html += matchRowHTML(m); });
    }
    var rest = pendings.filter(function (m) { return thisWeek.indexOf(m) < 0; });
    if (rest.length) {
      html += '<div class="round-title" style="padding:8px 14px 4px"><span class="dot"></span>其他待录（' + rest.length + '）</div>';
      rest.slice(0, 30).forEach(function (m) { html += matchRowHTML(m); });
    }
    if (!pendings.length) html += '<div class="empty">全部比赛已录完 🎉</div>';
    html += '</div>';

    html += '<div class="card"><div class="card-hd"><h2>GitHub Token</h2>' +
      '<span class="sub">' + (token ? '已填写 ✅' : '未填写 ❌') + '</span></div><div class="sheet-body">' +
      (token
        ? '<div class="hint">已存在本机：' + esc(token.slice(0, 7)) + '••••••　<a href="https://github.com/settings/tokens" target="_blank" rel="noopener">GitHub 令牌管理</a></div>'
        : '<div class="warn">没填 Token 就保存不了数据。请在 GitHub 的 Fine-grained tokens 中创建 Token：只选择当前仓库，权限勾 <code>Contents: Read and write</code>，再复制粘贴到这里。</div>') +
      '<div style="height:8px"></div>' +
      '<input type="password" id="tokenInput2" placeholder="ghp_… / github_pat_…" value="' + esc(token) + '">' +
      '<div class="btn-row"><button class="btn ghost sm" id="saveTokenBtn">保存 Token</button>' +
      '<button class="btn ghost sm" id="testConnBtn">🔌 测试能否写入</button></div>' +
      '<div id="connResult" class="hint" style="margin-top:10px"></div>' +
      '</div></div>';

    var nDraft = draftCount();
    html += '<div class="card"><div class="card-hd"><h2>本机暂存 / 诊断</h2>' +
      '<span class="sub">' + (nDraft ? nDraft + ' 场待同步' : '无待同步') + '</span></div><div class="sheet-body">' +
      '<div class="hint">比分可以先存在本机（标记为「待同步」），有网或有 Token 时再一键上传。比赛现场网络差也能正常录。</div>' +
      '<div style="height:8px"></div>' +
      '<div class="btn-row"><button class="btn ghost sm" id="syncDraftsBtn">⬆️ 同步暂存（' + nDraft + '）</button>' +
      '<button class="btn ghost sm" id="diagBtn">🩺 运行诊断</button></div>' +
      '<pre id="diagOut" class="hint" style="display:none;white-space:pre-wrap;word-break:break-all;background:#f7f8fa;border:1px solid var(--line);border-radius:10px;padding:10px;margin:10px 0 0;max-height:260px;overflow:auto"></pre>' +
      '</div></div>';

    html += '<div class="card"><div class="card-hd"><h2>轮次时间（填了才会显示「本周」）</h2></div><div class="sheet-body">';
    var rounds = (DATA.rounds || []).slice().sort(function (a, b) { return a.round - b.round; });
    if (!rounds.length) {
      html += '<div class="hint">数据里没有轮次信息</div>';
    } else {
      rounds.forEach(function (r) {
        html += '<div class="field" style="margin-bottom:8px"><label>' + esc(r.label || ('第' + r.round + '轮')) + ' 比赛日期</label>' +
          '<input type="date" data-round="' + r.round + '" class="roundDate" value="' + esc(r.date || '') + '"></div>';
      });
      html += '<button class="btn sm" id="saveRounds">保存轮次时间</button>';
    }
    html += '</div></div>';

    html += '<div class="card"><div class="card-hd"><h2>拍照上传赛程表</h2><span class="sub">每周一张</span></div><div class="sheet-body">' +
      '<div class="row2"><div class="field"><label>属于第几轮</label><select id="schedRound">' +
      [1, 2, 3, 4, 5].map(function (i) { return '<option value="' + i + '">第' + i + '轮</option>'; }).join('') +
      '</select></div></div>' +
      '<input type="file" id="schedPhoto" accept="image/*" capture="environment" hidden>' +
      '<button class="btn ghost" id="schedPhotoBtn">📷 拍照 / 选择赛程图</button>' +
      '<div class="photos" style="margin-top:10px">' + (DATA.schedulePhotos || []).map(function (p, i) {
        return '<div class="ph"><img src="' + esc(p.url) + '"><button class="del" data-sched-del="' + i + '">×</button></div>';
      }).join('') + '</div>' +
      '</div></div>';

    html += '<div class="card"><div class="card-hd"><h2>分享与设置</h2></div><div class="sheet-body">' +
      '<button class="btn ghost" id="qrBtn">📱 生成访问二维码</button>' +
      '<div class="btn-row"><button class="btn ghost sm" id="refreshBtn">重新拉取数据</button>' +
      '<button class="btn danger sm" id="lockBtn">退出录入</button></div>' +
      '<div class="divider"></div>' +
      '<div class="hint">当前仓库：<code>' + esc(OWNER + '/' + REPO) + '</code>　口令在 <code>config.js</code> 里改。<br>所有人打开网页都能看赛程和积分；只有输入口令的这台设备能改数据。</div>' +
      '</div></div>';

    return html;
  }

  /* 按项目给不同的快捷比分，避免足球比赛误点 20:15 */
  function quickScores(sport) {
    if (sport === 'football') {
      return [['0:0', 0, 0], ['1:0', 1, 0], ['2:0', 2, 0], ['2:1', 2, 1], ['3:0', 3, 0], ['3:2', 3, 2], ['4:2', 4, 2], ['5:3', 5, 3]];
    }
    return [['10:8', 10, 8], ['15:12', 15, 12], ['20:15', 20, 15], ['25:20', 25, 20], ['30:22', 30, 22], ['40:35', 40, 35]];
  }

  /* ---------- 比赛详情弹层 ---------- */
  function openMatch(id) {
    var m = (DATA.matches || []).filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    var done = m.status === 'finished' && m.scoreA != null;
    var html = '<div class="sheet-hd"><h3>' + sportName(m.sport) + ' 第' + m.round + '轮' +
      sessionMeta(m.session || 1).label + ' · ' + teamName(m.a) + ' vs ' + teamName(m.b) + '</h3>' +
      '<button class="close" data-close>×</button></div><div class="sheet-body">';

    html += '<div class="hint" style="margin-bottom:10px">📍 ' + esc(m.venue || '未指定场地') +
      (m.date ? '　🕒 ' + esc(m.date) : '') + '　ID ' + esc(m.id) + '</div>';

    if (isAdmin && !token) {
      html += '<div class="warn">还没填 GitHub Token，现在保存不了。回到「录入」页把 Token 粘贴进去即可。</div><div style="height:10px"></div>';
    }

    if (isAdmin) {
      html += '<div class="field"><label>比分（点加减，或选常见比分）</label>' +
        '<div class="score-edit">' +
        '<div class="side"><div class="cls">' + teamName(m.a) + '</div><div class="stepper">' +
        '<button data-score="a" data-d="-1">−</button><span class="val" id="scoreA">' + (m.scoreA == null ? 0 : m.scoreA) + '</span>' +
        '<button data-score="a" data-d="1">+</button></div></div>' +
        '<span class="vs">:</span>' +
        '<div class="side"><div class="cls">' + teamName(m.b) + '</div><div class="stepper">' +
        '<button data-score="b" data-d="-1">−</button><span class="val" id="scoreB">' + (m.scoreB == null ? 0 : m.scoreB) + '</span>' +
        '<button data-score="b" data-d="1">+</button></div></div></div>' +
        '<div class="quick">' + quickScores(m.sport)
          .map(function (q) { return '<button data-quick="' + q[1] + ',' + q[2] + '">' + q[0] + '</button>'; }).join('') + '</div></div>';

      html += '<div class="field"><label>考勤：到场人数与名单</label>' +
        '<div class="row2"><div><input type="number" inputmode="numeric" id="attA" placeholder="' + teamName(m.a) + '到场人数" value="' + (m.attA && m.attA.count != null ? m.attA.count : '') + '"></div>' +
        '<div><input type="number" inputmode="numeric" id="attB" placeholder="' + teamName(m.b) + '到场人数" value="' + (m.attB && m.attB.count != null ? m.attB.count : '') + '"></div></div>' +
        '<div style="height:8px"></div>' +
        '<input type="text" id="namesA" placeholder="' + teamName(m.a) + '名单（空格分隔，可留空）" value="' + esc(m.attA && m.attA.names || '') + '">' +
        '<div style="height:8px"></div>' +
        '<input type="text" id="namesB" placeholder="' + teamName(m.b) + '名单（空格分隔，可留空）" value="' + esc(m.attB && m.attB.names || '') + '">' +
        '</div>';

      html += '<div class="field"><label>现场照片（成绩表 / 合影，自动压缩）</label>' +
        '<div class="photos">' + (m.photos || []).map(function (u, i) {
          return '<div class="ph"><img src="' + esc(u) + '"><button class="del" data-photo-del="' + i + '">×</button></div>';
        }).join('') +
        '<div class="add-photo" id="addPhoto"><span class="plus">＋</span>拍照</div></div>' +
        '<input type="file" id="photoInput" accept="image/*" capture="environment" hidden></div>';

      html += '<div class="field"><label>备注（弃权、天气、加时等）</label>' +
        '<textarea id="note" placeholder="可留空">' + esc(m.note || '') + '</textarea></div>';

      html += '<button class="btn" id="saveMatch">保存并同步</button>';
      html += '<div class="btn-row"><button class="btn ghost sm" id="clearScore">清除成绩</button>' +
        '<button class="btn ghost sm" id="setPending">标为待战</button></div>';
    } else {
      html += '<div class="card" style="margin-bottom:12px"><div class="card-hd"><h2>比分</h2></div>' +
        '<div class="att-sum"><div class="box"><div class="n">' + (done ? m.scoreA : '-') + '</div><div class="l">' + teamName(m.a) + '</div></div>' +
        '<div class="box"><div class="n">' + (done ? m.scoreB : '-') + '</div><div class="l">' + teamName(m.b) + '</div></div></div></div>';
      if ((m.attA && m.attA.count) || (m.attB && m.attB.count)) {
        html += '<div class="card" style="margin-bottom:12px"><div class="card-hd"><h2>考勤</h2></div>' +
          '<div class="att-item"><div class="t">' + teamName(m.a) + '：' + (m.attA.count || 0) + '人</div><div class="d">' + esc(m.attA.names || '') + '</div></div>' +
          '<div class="att-item"><div class="t">' + teamName(m.b) + '：' + (m.attB.count || 0) + '人</div><div class="d">' + esc(m.attB.names || '') + '</div></div></div>';
      }
      if (m.note) html += '<div class="warn">' + esc(m.note) + '</div>';
      if ((m.photos || []).length) {
        html += '<div class="field"><label>现场照片</label><div class="photos">' +
          m.photos.map(function (u) { return '<div class="ph"><img src="' + esc(u) + '"></div>'; }).join('') + '</div></div>';
      }
      html += '<div class="hint">查看赛程和积分不需要口令；如需录入比分，请在「录入」页输入口令。</div>';
    }
    html += '</div>';
    showSheet(html, m);
  }

  function showSheet(html, ctx) {
    var sheet = $('#sheet');
    sheet.innerHTML = html;
    sheet.dataset.ctx = ctx ? ctx.id : '';
    $('#sheetMask').hidden = false;
    sheet.hidden = false;
  }
  function closeSheet() {
    $('#sheet').hidden = true;
    $('#sheetMask').hidden = true;
    $('#sheet').innerHTML = '';
  }

  /* ---------- 事件 ---------- */
  function render() {
    if (!DATA) return;
    $('#appTitle').textContent = CFG.title || DATA.title || '班级球类联赛';
    var brandKicker = $('#brandKicker');
    if (brandKicker) brandKicker.textContent = (CFG.brand && CFG.brand.kicker) || '2026 CAMPUS LEAGUE';
    // 只读模式：隐藏「录入」页签，且不允许停留在该页
    var adminTab = document.querySelector('.tab[data-view="admin"]');
    if (adminTab) adminTab.style.display = READONLY ? 'none' : '';
    if (READONLY && VIEW === 'admin') VIEW = 'schedule';
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.view === VIEW);
    });
    if (VIEW === 'schedule') app.innerHTML = scheduleHTML();
    else if (VIEW === 'standings') app.innerHTML = standingsHTML();
    else if (VIEW === 'attendance') app.innerHTML = attendanceHTML();
    else app.innerHTML = adminHTML();
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', function (e) {
    var tab = e.target.closest('.tab');
    if (tab) {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      VIEW = tab.dataset.view;
      render();
      return;
    }
    var seg = e.target.closest('.seg button');
    if (seg) { SPORT_FILTER = seg.dataset.sport; render(); return; }

    var jump = e.target.closest('[data-jump-round]');
    if (jump) {
      var target = document.getElementById('round-' + jump.dataset.jumpRound);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    var m = e.target.closest('.match, .att-item');
    if (m && m.dataset.id) { openMatch(m.dataset.id); return; }

    if (e.target.closest('[data-close]')) { closeSheet(); return; }
    if (e.target.id === 'sheetMask') { closeSheet(); return; }

    // 比分加减
    var step = e.target.closest('[data-score]');
    if (step) {
      var el = $('#' + (step.dataset.score === 'a' ? 'scoreA' : 'scoreB'));
      var v = Math.max(0, (parseInt(el.textContent, 10) || 0) + parseInt(step.dataset.d, 10));
      el.textContent = v;
      return;
    }
    var q = e.target.closest('[data-quick]');
    if (q) {
      var p = q.dataset.quick.split(',');
      $('#scoreA').textContent = p[0]; $('#scoreB').textContent = p[1];
      return;
    }
    // 删除照片
    var pd = e.target.closest('[data-photo-del]');
    if (pd) { sheetDelPhoto(parseInt(pd.dataset.photoDel, 10)); return; }
    var sd = e.target.closest('[data-sched-del]');
    if (sd) { sheetDelSchedulePhoto(parseInt(sd.dataset.schedDel, 10)); return; }

    if (e.target.id === 'addPhoto') { $('#photoInput').click(); return; }
    if (e.target.id === 'saveMatch') { saveMatch(); return; }
    if (e.target.id === 'clearScore') { clearScore(); return; }
    if (e.target.id === 'setPending') { setPending(); return; }
    if (e.target.id === 'unlockBtn') { unlock(); return; }
    if (e.target.id === 'saveRounds') { saveRounds(); return; }
    if (e.target.id === 'schedPhotoBtn') { $('#schedPhoto').click(); return; }
    if (e.target.id === 'qrBtn') { showQR(); return; }
    if (e.target.id === 'saveTokenBtn') {
      var t2 = $('#tokenInput2').value.trim();
      if (!t2) { toast('请粘贴 Token'); return; }
      token = t2; localStorage.setItem(TOKEN_KEY, t2);
      render(); toast('Token 已保存到本机');
      return;
    }
    if (e.target.id === 'testConnBtn') { testConn(); return; }
    if (e.target.id === 'syncDraftsBtn') { syncDrafts(); return; }
    if (e.target.id === 'diagBtn') { runDiag(); return; }
    if (e.target.id === 'refreshBtn') { refreshRemote().then(function (ok) { render(); toast(ok ? '已刷新到最新' : '实时刷新未连上，显示的是本地数据'); }); return; }
    if (e.target.id === 'lockBtn') {
      localStorage.removeItem(UNLOCK_KEY);
      isAdmin = false; render(); toast('已退出录入');
      return;
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'classFilter') {
      var cls = parseInt(e.target.value || '0', 10) || 0;
      saveClassFilter(cls);
      render();
      return;
    }
    if (e.target.id === 'photoInput' && e.target.files[0]) {
      var f = e.target.files[0];
      compressImage(f, 1100, 0.62).then(function (dataUrl) {
        var id = $('#sheet').dataset.ctx;
        toast('上传中…');
        return uploadPhoto(dataUrl, id || 'm').then(function (url) {
          var mm = findMatch(id);
          mm.photos = mm.photos || [];
          mm.photos.push(url);
          markPending('match', id, mm);
          openMatch(id);
          return saveAll('添加比赛照片 ' + id);
        }).then(function () { openMatch(id); toast('照片已上传'); });
      }).catch(function (err) { toast('照片处理失败：' + err.message); });
      e.target.value = '';
    }
    if (e.target.id === 'schedPhoto' && e.target.files[0]) {
      var file = e.target.files[0];
      var rnd = $('#schedRound') ? $('#schedRound').value : '1';
      compressImage(file, 1400, 0.7).then(function (dataUrl) {
        toast('上传中…');
        return uploadPhoto(dataUrl, 'schedule-r' + rnd).then(function (url) {
          DATA.schedulePhotos = DATA.schedulePhotos || [];
          DATA.schedulePhotos.push({ url: url, round: Number(rnd), at: new Date().toISOString() });
          markPending('schedulePhotos', null, DATA.schedulePhotos);
          return saveAll('上传第' + rnd + '轮赛程图');
        }).then(function () { render(); toast('赛程图已上传'); });
      }).catch(function (err) { toast('上传失败：' + err.message); });
      e.target.value = '';
    }
  });

  function findMatch(id) {
    return (DATA.matches || []).filter(function (x) { return x.id === id; })[0];
  }

  function saveMatch() {
    var id = $('#sheet').dataset.ctx;
    var m = findMatch(id);
    var sa = parseInt($('#scoreA').textContent, 10) || 0;
    var sb = parseInt($('#scoreB').textContent, 10) || 0;
    if (m.sport === 'basketball' && sa === sb) {
      toast('篮球不设平局，请录入加时后的最终比分。');
      return;
    }
    m.scoreA = sa; m.scoreB = sb; m.status = 'finished';
    m.attA = { count: $('#attA').value === '' ? null : Number($('#attA').value), names: $('#namesA').value.trim() };
    m.attB = { count: $('#attB').value === '' ? null : Number($('#attB').value), names: $('#namesB').value.trim() };
    m.note = $('#note').value.trim();
    m._local = true;
    stashDraft(m);
    markPending('match', id, m);
    saveAll('录入比分 ' + teamName(m.a) + ' ' + sa + ':' + sb + ' ' + teamName(m.b)).then(function (ok) {
      if (ok) {
        stashDraft(m, true); m._local = false; closeSheet(); render();
        toast('已保存：' + teamName(m.a) + ' ' + sa + ':' + sb + ' ' + teamName(m.b));
      }
      else { closeSheet(); render(); toast('已存本机，可稍后「同步暂存」上传'); }
    });
  }

  function stashDraft(m, synced) {
    var prev = drafts[m.id] || {};
    drafts[m.id] = {
      scoreA: m.scoreA, scoreB: m.scoreB, status: m.status,
      attA: m.attA, attB: m.attB, note: m.note,
      ts: prev.ts || Date.now(),
      syncedAt: synced ? Date.now() : 0
    };
    saveDrafts();
  }
  function clearDraft(id) { delete drafts[id]; saveDrafts(); }

  async function syncDrafts() {
    var n = draftCount();
    if (!n) { toast('没有待同步的记录'); return; }
    if (!token) { toast('先在上面填好 Token 再同步'); return; }
    applyDrafts();
    var ok = await saveAll('同步本机暂存成绩（' + n + ' 场）');
    if (ok) {
      Object.keys(drafts).forEach(function (id) { drafts[id].syncedAt = drafts[id].syncedAt || Date.now(); });
      saveDrafts();
      (DATA.matches || []).forEach(function (m) { m._local = false; });
      render(); toast('已全部同步 ' + n + ' 场');
    } else {
      toast('同步失败：' + lastSaveError);
    }
  }
  function clearScore() {
    var id = $('#sheet').dataset.ctx, m = findMatch(id);
    m.scoreA = null; m.scoreB = null; m.status = 'pending';
    m._local = true; stashDraft(m);
    markPending('match', id, m);
    saveAll('清除成绩 ' + id).then(function (ok) {
      if (ok) { stashDraft(m, true); m._local = false; closeSheet(); render(); toast('已清除'); }
      else { closeSheet(); render(); toast('已存本机，稍后同步'); }
    });
  }
  function setPending() {
    var id = $('#sheet').dataset.ctx, m = findMatch(id);
    m.status = 'pending';
    markPending('match', id, m);
    saveAll('标记为待战 ' + id).then(function (ok) { if (ok) { closeSheet(); render(); toast('已更新'); } });
  }
  function sheetDelPhoto(i) {
    var id = $('#sheet').dataset.ctx, m = findMatch(id);
    m.photos.splice(i, 1);
    markPending('match', id, m);
    saveAll('删除照片 ' + id).then(function (ok) { if (ok) { openMatch(id); toast('已删除'); } });
  }
  function sheetDelSchedulePhoto(i) {
    DATA.schedulePhotos.splice(i, 1);
    markPending('schedulePhotos', null, DATA.schedulePhotos);
    saveAll('删除赛程图').then(function (ok) { if (ok) { render(); toast('已删除'); } });
  }
  function saveRounds() {
    var inputs = document.querySelectorAll('.roundDate');
    DATA.rounds = DATA.rounds || [];
    inputs.forEach(function (inp) {
      var r = Number(inp.dataset.round);
      var meta = roundMeta(r);
      meta.date = inp.value;
      if (DATA.rounds.indexOf(meta) < 0) DATA.rounds.push(meta);
    });
    markPending('rounds', null, DATA.rounds);
    saveAll('更新轮次时间').then(function (ok) { if (ok) toast('轮次时间已保存'); });
  }
  function unlock() {
    var code = ($('#codeInput').value || '').trim();
    // 全角数字/空格容错
    code = code.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248); }).replace(/\s+/g, '');
    var tk = ($('#tokenInput').value || '').trim();
    if (code !== String(CFG.adminCode)) { toast('口令不对'); return; }
    if (tk) { token = tk; localStorage.setItem(TOKEN_KEY, tk); }
    isAdmin = true;
    localStorage.setItem(UNLOCK_KEY, '1');
    render();
    toast('已进入录入模式');
  }

  async function testConn() {
    var el = document.getElementById('connResult');
    if (!el) return;
    el.textContent = '正在测试…';
    if (!token) { el.textContent = '❌ 还没填 Token，先粘到上面的输入框并点「保存 Token」'; return; }
    try {
      var r = await fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + DATA_PATH + '?ref=' + BRANCH, { headers: ghHeaders() });
      var j = await r.json().catch(function () { return {}; });
      if (r.ok) {
        var scopes = '';
        try { scopes = r.headers.get('x-oauth-scopes') || ''; } catch (e) { scopes = ''; }
        var canWrite = !scopes || /repo|contents|public_repo/.test(scopes);
        el.textContent = (canWrite ? '✅ 可以读写仓库，能保存数据。' : '⚠️ 能连上，但 Token 权限可能不足（当前：' + (scopes || '未知') + '），建议重新生成并勾选 repo。') +
          (scopes ? '（Token 权限：' + scopes + '）' : '');
      } else if (r.status === 401) {
        el.textContent = '❌ Token 无效或已过期（HTTP 401）。重新生成一个粘贴进来。';
      } else if (r.status === 403) {
        el.textContent = '❌ 没有权限（HTTP 403）：' + (j.message || '') + '。Token 要勾 repo，且只能用于这个仓库。';
      } else {
        el.textContent = '❌ 失败 HTTP ' + r.status + '：' + (j.message || '');
      }
    } catch (e) {
      el.textContent = '❌ 连不上 GitHub（' + e.message + '）。换网络或稍后再试；已录入的内容可以先记在纸上。';
    }
  }

  async function runDiag() {
    var out = document.getElementById('diagOut');
    if (!out) return;
    out.style.display = 'block';
    out.textContent = '诊断中…（约 5 秒）';
    var L = [];
    L.push('时间 ' + new Date().toLocaleString());
    L.push('页面 ' + location.href);
    L.push('模式 ' + (READONLY ? '只读（不能录入！去掉 ?readonly=1 再试）' : '完整'));
    L.push('在线 ' + (navigator.onLine ? '是' : '否'));
    L.push('浏览器 ' + navigator.userAgent);
    L.push('Token ' + (token ? ('已填 ' + token.length + ' 位（' + token.slice(0, 4) + '…）') : '未填'));
    L.push('待同步 ' + draftCount() + ' 场');
    L.push('仓库 ' + OWNER + '/' + REPO + '@' + BRANCH);
    try {
      var r0 = await fetchJSON(DATA_PATH + '?t=' + Date.now(), 6000);
      L.push('① 读本站数据    成功（' + (r0.matches ? r0.matches.length : 0) + ' 场）');
    } catch (e) { L.push('① 读本站数据    失败 ' + e.message); }
    try {
      var r = await fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + DATA_PATH + '?ref=' + BRANCH, { headers: ghHeaders() });
      var tj = await r.json().catch(function () { return {}; });
      L.push('② 连 api.github   HTTP ' + r.status + (r.ok ? '（通）' : '（' + (tj.message || '') + '）'));
    } catch (e) {
      L.push('② 连 api.github   失败 ' + e.message + ' → 这台设备访问不了 api.github.com');
    }
    if (!token) {
      L.push('③ 写入测试       跳过（没填 Token）');
    } else {
      try {
        await ghPut(DATA_PATH, utf8ToB64(JSON.stringify(DATA, null, 2)), '自检写入测试');
        L.push('③ 写入测试       成功 ✅ 录入功能正常');
      } catch (e) {
        L.push('③ 写入测试       失败 HTTP ' + (e.status || '-') + ' / ' + e.message);
      }
    }
    out.textContent = L.join('\n');
    toast('诊断完成，把结果发我');
  }

  function showQR() {
    var url = publicShareURL();
    var html = '<div class="sheet-hd"><h3>扫码访问</h3><button class="close" data-close>×</button></div>' +
      '<div class="sheet-body"><div class="qr-box"><div id="qr"></div>' +
      '<div class="qr-url">' + esc(url) + '</div></div>' +
      '<div class="divider"></div>' +
      '<div class="hint">把这个二维码打印贴在公告栏或发到班级群，扫码即可查看赛程、比分、积分榜。' +
      (CLASS_FILTER ? '当前二维码只显示' + esc(teamName(CLASS_FILTER)) + '赛程。' : '') +
      '裁判请在自己的设备中打开「录入」，手工输入管理口令和 Token；不要把 Token 放进链接或二维码。</div>' +
      '<button class="btn ghost" id="copyLink" style="margin-top:10px">复制链接</button></div>';
    showSheet(html);
    setTimeout(function () {
      var box = document.getElementById('qr');
      if (!box) return;
      if (window.QRCode && QRCode.toCanvas) {
        QRCode.toCanvas(url, { width: 220, margin: 1 }, function (err, canvas) {
          if (err || !canvas) {
            box.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(url) + '" alt="二维码">';
          } else { box.appendChild(canvas); }
        });
      } else {
        box.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(url) + '" alt="二维码">';
      }
      var cp = document.getElementById('copyLink');
      if (cp) cp.addEventListener('click', function () {
        navigator.clipboard && navigator.clipboard.writeText(url);
        toast('链接已复制');
      });
    }, 0);
  }

  /* ---------- 启动 ---------- */
  /* 启动：先本地秒开，再后台刷新 */
  (async function boot() {
    sync('加载中…');
    await loadLocal();
    pruneDrafts(); applyDrafts();
    render();
    refreshRemote().then(function (ok) {
      if (ok) { pruneDrafts(); applyDrafts(); render(); }
    });
  })();

  setInterval(function () {
    if (document.hidden) return;
    if (Date.now() - lastSync > 60000) {
      refreshRemote().then(function (ok) { if (ok) { pruneDrafts(); applyDrafts(); render(); } });
    }
  }, 60000);
})();
