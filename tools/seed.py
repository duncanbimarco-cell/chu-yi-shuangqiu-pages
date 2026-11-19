import json
from collections import Counter

# 每个班都要参加足球和篮球：
#   第一节：单数组班踢足球、双数组班打篮球（原对阵表）
#   第二节：轮换 —— 单数组班打篮球、双数组班踢足球
# 每轮 16 场（每节 8 场），5 轮共 80 场；每班足球 5 场 + 篮球 5 场 = 10 场。

# 第1轮按2026-11-18实际对阵校正；第2—4轮保留原安排。
# 第5轮调整两组各两场，避免13班vs15班、14班vs16班重复。
ROUND_PAIRS = {
    1: {"odd": [(1, 3), (5, 7), (9, 11), (13, 15)], "even": [(2, 4), (6, 8), (10, 12), (14, 16)]},
    2: {"odd": [(1, 5), (3, 13), (7, 11), (9, 15)], "even": [(2, 6), (4, 14), (8, 12), (10, 16)]},
    3: {"odd": [(1, 7), (3, 15), (5, 11), (9, 13)], "even": [(2, 8), (4, 16), (6, 12), (10, 14)]},
    4: {"odd": [(1, 9), (3, 11), (5, 13), (7, 15)], "even": [(2, 10), (4, 12), (6, 14), (8, 16)]},
    5: {"odd": [(1, 13), (3, 7), (5, 9), (11, 15)], "even": [(2, 14), (4, 8), (6, 10), (12, 16)]},
}

# 场地按轮次轮转（与原表一致）：足球 1/5~4/8 号，篮球 5/1~8/4 号
FB_VENUES = ["1/5号场地", "2/6号场地", "3/7号场地", "4/8号场地"]
BK_VENUES = ["5/1号场地", "6/2号场地", "7/3号场地", "8/4号场地"]


def venue(list_or_fb, i, rnd):
    return list_or_fb[(i + rnd - 1) % 4]


def blank_att():
    return {"count": None, "names": ""}


matches = []
for rnd in sorted(ROUND_PAIRS):
    pairs = ROUND_PAIRS[rnd]
    for session in (1, 2):
        # 第一节：单数组足球 + 双数组篮球；第二节：单数组篮球 + 双数组足球
        if session == 1:
            plan = [("football", "odd"), ("basketball", "even")]
        else:
            plan = [("basketball", "odd"), ("football", "even")]
        for sport, group in plan:
            letter = "F" if sport == "football" else "B"
            venues = FB_VENUES if sport == "football" else BK_VENUES
            for i, (a, b) in enumerate(pairs[group]):
                matches.append({
                    "id": "r%ds%d-%s%d" % (rnd, session, letter, i + 1),
                    "round": rnd,
                    "session": session,
                    "sport": sport,
                    "a": a,
                    "b": b,
                    "venue": venue(venues, i, rnd),
                    "date": "",
                    "scoreA": None,
                    "scoreB": None,
                    "status": "pending",
                    "attA": blank_att(),
                    "attB": blank_att(),
                    "photos": [],
                    "note": "",
                })

data = {
    "version": 2,
    "title": "初一年级班级球类联赛",
    "rounds": [{"round": i, "date": "", "label": "第%d轮" % i} for i in range(1, 6)],
    "sessions": [
        {"session": 1, "label": "第一节", "desc": "单数组班踢足球 · 双数组班打篮球"},
        {"session": 2, "label": "第二节", "desc": "单数组班打篮球 · 双数组班踢足球"},
    ],
    "schedulePhotos": [],
    "matches": matches,
}

out = "/Users/zhangsanmao/WorkBuddy/2026-11-01-18-06-50/ball-league/data/matches.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("总场次:", len(matches),
      "| 足球", sum(1 for m in matches if m["sport"] == "football"),
      "| 篮球", sum(1 for m in matches if m["sport"] == "basketball"))

for sport in ("football", "basketball"):
    cnt = Counter()
    for m in matches:
        if m["sport"] == sport:
            cnt[m["a"]] += 1
            cnt[m["b"]] += 1
    print(sport, "参赛班:", len(cnt), "| 每班场次:", sorted(set(cnt.values())))
