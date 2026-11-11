/* ============================================================
 * CloudBase 云数据库适配层（双后端之一）
 * 用法：在 index.html 引入本文件前先引入 assets/cloudbase.full.js
 * 数据模型：集合 league 里一条 _id="state" 的文档，存整个赛事数据
 *   { version, title, rounds, schedulePhotos, matches, updatedAt }
 * 读取由前端直连（匿名登录），安全规则：读公开、写需登录
 * ============================================================ */
(function () {
  'use strict';

  var app = null;
  var db = null;
  var authed = false;

  /* 按需加载 SDK：默认走 GitHub 免费方案时不下载这 378KB，首屏更快 */
  function loadSdk() {
    if (window.cloudbase) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'assets/cloudbase.full.js';
      s.onload = function () { window.cloudbase ? resolve() : reject(new Error('CloudBase SDK 加载失败')); };
      s.onerror = function () { reject(new Error('CloudBase SDK 加载失败（网络问题）')); };
      document.head.appendChild(s);
    });
  }

  function init(envId) {
    return loadSdk().then(function () {
      app = window.cloudbase.init({ env: envId });
      db = app.database();
    });
  }

  function ensureAuth() {
    if (authed) return Promise.resolve();
    var auth = app.auth({ persistence: 'local' });
    return auth.signInAnonymously().then(function () {
      authed = true;
    }).catch(function (e) {
      // 匿名登录未开启时，退一步尝试已登录态
      authed = true; // 由安全规则决定是否可写
      return Promise.resolve();
    });
  }

  function load() {
    return ensureAuth().then(function () {
      return db.collection('league').doc('state').get();
    }).then(function (res) {
      var docs = (res && res.data) || [];
      if (docs.length && docs[0] && docs[0].matches) return docs[0];
      return null;
    });
  }

  function save(data) {
    return ensureAuth().then(function () {
      var doc = Object.assign({}, data, { updatedAt: Date.now() });
      return db.collection('league').doc('state').set(doc);
    });
  }

  window.CloudStore = { init: init, load: load, save: save, isAuthed: function () { return authed; } };
})();
