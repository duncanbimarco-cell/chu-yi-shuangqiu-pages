(function () {
  'use strict';

  var base = new URL('./', location.href).href;
  var publicURL = base + '?readonly=1';
  var entries = [
    {
      key: 'public', kind: '公开入口', title: '通用公开赛程',
      detail: '适合公告栏、年级群和家长群；扫码查看全部赛程、比分、积分榜、考勤。',
      url: publicURL, featured: true
    },
    {
      key: 'admin', kind: '组委会专用', title: '管理员录入入口',
      detail: '仅裁判 / 组委会使用；录入时仍需管理口令和本机 GitHub Token。',
      url: base, featured: true, admin: true
    }
  ];
  for (var i = 1; i <= 16; i++) {
    entries.push({
      key: 'class-' + i, kind: '班级专属', title: i + '班专属赛程',
      detail: '只显示 ' + i + '班的 10 场足球、篮球比赛。',
      url: publicURL + '&class=' + i, classOnly: true
    });
  }

  function text(el, value) { el.textContent = value; return el; }
  function make(tag, cls, value) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (value != null) text(el, value);
    return el;
  }
  function copyURL(url, button) {
    var done = function () {
      var old = button.textContent;
      button.textContent = '已复制 ✓';
      setTimeout(function () { button.textContent = old; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(function () { window.prompt('请复制链接：', url); });
    } else {
      window.prompt('请复制链接：', url);
    }
  }
  function downloadCanvas(holder, filename) {
    var canvas = holder.querySelector('canvas');
    if (!canvas) return;
    var link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = filename + '.png';
    link.click();
  }
  function fallback(holder, item) {
    var image = new Image();
    image.alt = item.title + '二维码';
    image.src = 'https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=' + encodeURIComponent(item.url);
    holder.appendChild(image);
  }
  function addQR(holder, item) {
    if (!window.QRCode || !QRCode.toCanvas) { fallback(holder, item); return; }
    QRCode.toCanvas(item.url, {
      width: item.featured ? 220 : 170,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#082c66', light: '#ffffff' }
    }, function (err, canvas) {
      if (err || !canvas) { fallback(holder, item); return; }
      canvas.setAttribute('aria-label', item.title + '二维码');
      holder.appendChild(canvas);
    });
  }
  function card(item) {
    var article = make('article', 'qr-card' + (item.featured ? ' featured' : '') + (item.admin ? ' admin' : '') + (item.key === 'public' ? ' public' : ''));
    article.appendChild(make('span', 'qr-type', item.kind));
    article.appendChild(make('h3', '', item.title));
    article.appendChild(make('p', '', item.detail));
    var holder = make('div', 'qr-canvas');
    article.appendChild(holder);
    addQR(holder, item);
    var actions = make('div', 'qr-actions');
    var download = make('button', '', '保存二维码');
    download.type = 'button';
    download.addEventListener('click', function () { downloadCanvas(holder, '北大附中初一双球联赛-' + item.key); });
    var copy = make('button', '', '复制链接');
    copy.type = 'button';
    copy.addEventListener('click', function () { copyURL(item.url, copy); });
    actions.appendChild(download);
    actions.appendChild(copy);
    article.appendChild(actions);
    article.appendChild(make('div', 'card-url', item.url));
    return article;
  }
  var featured = document.getElementById('featuredGrid');
  var classes = document.getElementById('classGrid');
  entries.forEach(function (item) { (item.featured ? featured : classes).appendChild(card(item)); });
  document.getElementById('printPage').addEventListener('click', function () { window.print(); });
})();
