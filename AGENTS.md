# AGENTS.md — 交接说明（给接手的人 / AI 编码助手）

初一年级班级球类联赛的赛程、比分、积分、考勤系统。**纯静态站点 + GitHub 仓库当数据库**，无服务器、无数据库、无构建步骤。

- 仓库：`duncanbimarco-cell/chu-yi-shuangqiu-pages`（分支 `main`）
- 线上：https://duncanbimarco-cell.github.io/chu-yi-shuangqiu-pages/
- 只读入口：https://duncanbimarco-cell.github.io/chu-yi-shuangqiu-pages/?readonly=1
- 备用镜像：https://cdn.jsdelivr.net/gh/duncanbimarco-cell/chu-yi-shuangqiu-pages@main/index.html?readonly=1

## 一、技术栈与文件

原生 HTML/CSS/JS（ES2017，无框架、无打包、无依赖安装）。仅一个外部 CDN 脚本（qrcode）用于生成二维码，失败时有兜底。

```
index.html      页面骨架：顶栏 / #app / 底部四个页签 / 弹层 / toast
config.js       唯一配置：owner / repo / branch / adminCode / points / title
app.js          全部逻辑（IIFE，约 800 行）
styles.css      全部样式（CSS 变量 + 移动端优先，浅色主题）
data/matches.json   全部业务数据（赛程 + 比分 + 考勤 + 照片URL），唯一数据源
tools/seed.py   赛程生成脚本，按对阵表生成 80 场，改赛程优先改它再重跑
README.md       面向使用者的说明
```

改完直接 `git push`，GitHub Pages 约 1 分钟自动重建。

## 二、业务规则（改动前必读）

- 16 个班，**两个项目都参加**：5 轮 × 2 节 × 8 场 = **80 场**，每班足球 5 场 + 篮球 5 场
- 第一节：单数组班（1/3/5/7/9/11/13/15）足球，双数组班（2/4/6/8/10/12/14/16）篮球
- 第二节：轮换 —— 单数组班篮球，双数组班足球
- 场地轮转：足球 `["1/5号场地","2/6号场地","3/7号场地","4/8号场地"]`、篮球 `["5/1号场地"…"8/4号场地"]`，第 r 轮第 i 场取 `venue[(i + r - 1) % 4]`
- 足球积分：胜 3 / 平 1 / 负 0；篮球积分：胜 3 / 负 1、无平局。排序：积分 → 净胜 → 得分 → 班号
- **积分榜按单/双数组班分开排名**，两组之间不交叉比赛，不要合并成一个榜
- 原表存在重复对阵的可能，改赛程前先和负责人确认

## 三、数据结构 `data/matches.json`

```jsonc
{
  "version": 2,
  "title": "初一年级班级球类联赛",
  "rounds":   [{ "round": 1, "date": "", "label": "第1轮" }],           // date 填了才显示"本周"
  "sessions": [{ "session": 1, "label": "第一节", "desc": "单数组班踢足球 · 双数组班打篮球" }],
  "schedulePhotos": [{ "url": "…", "round": 1, "at": "ISO" }],          // 每周赛程表照片
  "matches": [{
    "id": "r1s1-F1",          // r{轮}s{节}-{F球|B篮}{序号}
    "round": 1, "session": 1,
    "sport": "football",      // football | basketball
    "a": 1, "b": 3,           // 班级号
    "venue": "1/5号场地",
    "date": "2026-11-03",     // 可选，YYYY-MM-DD
    "scoreA": null, "scoreB": null,
    "status": "pending",      // pending | finished
    "attA": { "count": null, "names": "" },   // 考勤：到场人数 + 名单
    "attB": { "count": null, "names": "" },
    "photos": ["https://raw.githubusercontent.com/…/photos/xxx.jpg"],
    "note": ""
  }]
}
```

## 四、数据读写机制（最关键，别改坏）

**读（所有访客）** — `boot()` → `loadLocal()` → `render()` → `refreshRemote()`

1. 先读**同源** `data/matches.json`（必定成功，秒开）
2. 立即渲染
3. 后台再拉 raw.githubusercontent → jsDelivr（各 5 秒超时），成功则静默重渲染
4. 失败只把顶栏文字改成"本地数据"，**绝不能因此不渲染**

> 历史坑：最早先请求 `raw.githubusercontent.com`，国内被墙时请求悬挂，页面永远停在"加载中"。不要改回这种顺序。

**写（仅裁判）** — 需要 GitHub Personal Access Token（`repo` 权限），存 `localStorage` 键 `bl_token_<owner>_<repo>`

1. `GET /repos/{owner}/{repo}/contents/data/matches.json` 取 `sha`
2. `PUT` 同路径，body = `{ message, content: base64(utf8 JSON), branch, sha }`
3. 遇 409/422 → `refreshRemote()` + `applyPending()` + 重试一次
4. 401/403 → 提示 Token 无效/权限不足；无 `status` → 提示网络问题

**照片**：前端 canvas 压缩（最长边 1100px，JPEG 0.62）→ `PUT photos/{id}-{时间戳}.jpg` → 存 raw URL 到 `photos[]`。

**权限模型**：查看公开无鉴权；录入靠 `config.adminCode`（纯前端校验，只防误触）。Token 绝不写进代码/仓库/链接/二维码。

**只读模式**：URL 带 `?readonly=1` 时强制 `isAdmin = false` 并隐藏「录入」页签。

## 五、验证方式（改完请自测）

本机（macOS）可用 jsdom 做无头冒烟测试：`/tmp/smoke/test.js`（观众视图渲染 80 场、积分榜 4 张表）和 `/tmp/smoke/admin.js`（录入→保存→PUT 带 Authorization 与 sha）。

手工必测点：

1. 首屏 < 2 秒出 80 场赛程，顶栏不出现"加载中…"停住
2. 断网/挂代理模拟 raw 不可达，页面仍完整显示
3. `?readonly=1` 只剩三个页签
4. 录一场比分 → 保存 → 刷新可见；`git log` 出现提交
5. 手机宽度 375px 下表格与弹层不横向溢出

## 六、当前限制与已知待办

- 访客端每 60 秒轮询一次 + 写入后需等 Pages 重建（1–2 分钟）才全量同步；实时性要求高可考虑加 WebSocket/轮询加速
- 无登录体系，Token 泄露风险由使用者自控（建议定期重置）
- 国内部分网络访问 `github.io` 不稳定，已有 jsDelivr 镜像兜底（有缓存延迟）
- 未做：淘汰赛/决赛阶段、个人数据（得分王）、Excel/CSV 导出、班级专属二维码

## 七、编码约定

- 继续用原生 JS，**不要引入框架/打包器**（Pages 直接托管静态文件，无构建）
- 所有插入 DOM 的用户数据必须走 `esc()`
- 文案用中文，移动端优先（375px 起），浅色主题
- 改动数据文件时保持 `indent=2`、`ensure_ascii=False`，避免整文件 diff
- 提交信息用中文简述，例如"修复只读模式下仍可录入"
