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

  function init(envId) {
    if (typeof window.cloudbase === 'undefined') {
      return Promise.reject(new Error('CloudBase SDK 未加载（请检查 assets/cloudbase.full.js）'));
    }
    app = window.cloudbase.init({ env: envId });
    db = app.database();
    return Promise.resolve();
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
