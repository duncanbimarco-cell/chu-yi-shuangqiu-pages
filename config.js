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
  // 组委会/裁判录入口令（改这里即可，改完重新推送一次）
  adminCode: "20261118",
  // 足球：胜3 平1 负0；篮球：胜3 负1，不设平局
  points: {
    football: { win: 3, draw: 1, lose: 0 },
    basketball: { win: 3, draw: 0, lose: 1 }
  },
  // 联赛标题
  title: "初一年级足球·篮球联赛",
  // 页面品牌文案：以后改学校名称、赛季或口号，只需要修改这里
  brand: {
    kicker: "2026 秋季 · CLASS LEAGUE",
    heroKicker: "初一年级 · 双球联赛",
    heroTitle: "双球联赛",
    heroAccent: "开赛",
    motto: "16 个班 · 为班级而战 · 为热爱喝彩"
  }
};
