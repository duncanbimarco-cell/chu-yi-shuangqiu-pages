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
  },
  // 学校吉尼斯纪录挑战榜：成绩保留全部记录，公开页面展示每个男女组前 3 名。
  // order: desc = 数值越大越好；asc = 数值越小越好。
  guinness: {
    podiumSize: 3,
    categories: [
      {
        id: "fitness", label: "体能吉尼斯", icon: "⚡", color: "blue",
        events: [
          { id: "standing-long-jump", name: "立定跳远", unit: "cm", order: "desc", input: "number", hint: "例如 225" },
          { id: "push-up", name: "俯卧撑", unit: "次", order: "desc", input: "number", hint: "例如 42" },
          { id: "run-50m", name: "50 米", unit: "秒", order: "asc", input: "decimal", hint: "例如 7.20" },
          { id: "pull-up", name: "引体向上", unit: "次", order: "desc", input: "number", hint: "例如 18" },
          { id: "sit-up", name: "仰卧起坐", unit: "次", order: "desc", input: "number", hint: "例如 55" },
          { id: "run-1000m", name: "1000 米", unit: "分秒", order: "asc", input: "duration", hint: "例如 3:45 或 225" },
          { id: "run-800m", name: "800 米", unit: "分秒", order: "asc", input: "duration", hint: "例如 3:20 或 200" },
          { id: "grip-left", name: "左手握力", unit: "kg", order: "desc", input: "decimal", hint: "例如 42.5" },
          { id: "grip-right", name: "右手握力", unit: "kg", order: "desc", input: "decimal", hint: "例如 45.0" }
        ]
      },
      {
        id: "basketball", label: "篮球吉尼斯", icon: "🏀", color: "orange",
        events: [
          { id: "basketball-free-throw-60", name: "60 秒罚球 自投自抢", unit: "球", order: "desc", input: "number", genders: ["female"], hint: "女生项目，例如 16" },
          { id: "basketball-three-point-60", name: "60 秒三分球 自投自抢", unit: "球", order: "desc", input: "number", genders: ["female"], hint: "女生项目，例如 8" },
          { id: "basketball-touch-height", name: "摸高", unit: "cm", order: "desc", input: "number", hint: "例如 285" }
        ]
      },
      {
        id: "football", label: "足球吉尼斯", icon: "⚽", color: "green",
        events: [
          { id: "football-juggle-60", name: "60 秒颠球", unit: "个", order: "desc", input: "number", hint: "例如 86" },
          { id: "football-target-kick", name: "吊准", unit: "分", order: "desc", input: "number", hint: "例如 24" }
        ]
      },
      {
        id: "martial-arts", label: "武术吉尼斯", icon: "🥋", color: "red",
        events: [
          { id: "martial-front-kick", name: "正踢腿 单拍脚 30 秒", unit: "次", order: "desc", input: "number", hint: "例如 48" },
          { id: "martial-horse-stance", name: "扎马步最长时间", unit: "分秒", order: "desc", input: "duration", hint: "例如 2:30 或 150" },
          { id: "martial-tornado-kick", name: "旋风脚", unit: "度", order: "desc", input: "number", hint: "例如 540" },
          { id: "martial-outside-lotus", name: "外摆莲", unit: "度", order: "desc", input: "number", hint: "例如 360" }
        ]
      }
    ]
  }
};
