/* ===== 部署配置：改成你自己的 GitHub 仓库 ===== */
window.APP_CONFIG = {
  // GitHub 用户名（或组织名）
  owner: "duncanbimarco-cell",
  // 仓库名
  repo: "chu-yi-shuangqiu-pages",
  // 分支名（GitHub Pages 一般用 main）
  branch: "main",
  // 数据文件路径
  dataPath: "data/matches.json",
  // 数据后端：'github'（默认，沿用旧方案）或 'cloudbase'（国内云数据库，根治国内访问不稳）
  backend: "github",
  // 腾讯云 CloudBase 环境 ID（backend='cloudbase' 时必填，部署时由我填好）
  envId: "",
  // 组委会/裁判录入口令（改这里即可，改完重新推送一次）
  adminCode: "20261118",
  // 足球：胜3 平1 负0；篮球：胜3 负1，不设平局
  points: {
    football: { win: 3, draw: 1, lose: 0 },
    basketball: { win: 3, draw: 0, lose: 1 }
  },
  // 联赛标题
  title: "北大附中初一双球联赛",
  // 页面品牌文案：以后改学校名称、赛季或口号，只需要修改这里
  brand: {
    kicker: "北京大学附属中学 · 2026 秋季",
    heroKicker: "完全人格，首在体育",
    heroTitle: "初一双球",
    heroAccent: "联赛",
    motto: "北大附中初一年级 · 16 个班同场竞技"
  }
};
