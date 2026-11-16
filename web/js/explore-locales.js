/* New desk copy; existing catalogs continue to cover shared controls and metrics. */
(function () {
  const simplified = {
    "Below average":"低于平均", "Above average":"高于平均", "Goals scored":"进球数", "{0} teams · {1} matches · {2} style indicators":"{0} 支球队 · {1} 场比赛 · {2} 项风格指标",
    "Explore teams":"球队分析", "WORLD CUP {0} · STYLE TWINS":"{0} 世界杯 · 风格双生",
    "Same style.":"相似风格。", "Different story.":"不同结果。", "Choose a question. Start with your team.":"选择你感兴趣的问题，从你的球队开始。",
    "What do you want to explore?":"你想探索什么？", "Who plays like my team?":"谁和我的球队踢得相似？",
    "Explore the style map and closest teams.":"查看风格地图，发现最相似的球队。", "Similar style. Different results?":"风格相似，结果为何不同？",
    "Compare chances created and actual scorelines.":"对比创造的机会与实际比分。", "Which matches make the difference?":"哪些比赛带来了差异？",
    "Follow the individual games behind the averages.":"查看平均数据背后的每一场比赛。", "Your team":"你的球队", "Explore my team":"开始分析",
    "YOUR STARTING COMPARISON":"从这组对比开始", "From match data":"基于比赛数据", "Style similarity percentile":"风格相似度百分位",
    "Goal difference gap / match":"场均净胜球差距", "One workspace. Every panel connected.":"一个工作台，所有面板联动。", "Data & method ↗":"数据与方法 ↗",
    "Play alike. Compare the difference.":"风格相似，差异在哪？", "Find style twins":"寻找相似球队", "Compare results":"比较比赛结果", "Inspect matches":"查看比赛证据",
    "Team A":"球队 A", "Team B":"球队 B", "Match scope":"比赛范围", "Full tournament":"整个赛事", "Style indicators ({0})":"风格指标（{0}）",
    "Choose at least two indicators":"至少选择两项指标", "Reset indicators":"重置指标", "Reset filters":"重置筛选", "Similarity percentile: {0}/{1}":"相似度百分位：{0}/{1}",
    "{0} + {1} matches":"{0} + {1} 场比赛", "{0} teams in view":"当前显示 {0} 支球队", "Clear region ×":"清除框选 ×", "No comparable profile in this scope":"该范围内没有可比较的风格数据",
    "Select region":"框选区域", "All style groups":"所有风格组", "Closest styles":"最相似的球队", "For {0} · click to set B":"与 {0} 比较 · 点击设为 B", "Distance ↓":"距离 ↓",
    "Style fingerprint":"风格指纹", "Selected teams + closest candidates":"所选球队及最相似候选", "Lower":"较低", "Higher":"较高",
    "Standardized indicators · {0} = tournament average · values shown in σ":"标准化指标 · {0} 为赛事平均 · 单位 σ",
    "Chances & results":"机会与结果", "Averages per match · same selected scope":"所选比赛范围内的场均值", "Open detail ↗":"查看详情 ↗",
    "Test this comparison ↗":"检验这组对比 ↗", "Chances vs scorelines":"机会与比分", "One dot per team · averages per match":"每个点代表一支球队 · 场均值",
    "PCA projection · {0} of style variation shown":"PCA 投影 · 展示 {0} 的风格差异", "Style axis {0} →":"风格轴 {0} →", "Style axis {0} ↑":"风格轴 {0} ↑",
    "Click a team to set B · Shift-click to set A · Hover to link panels":"点击设为 B · Shift + 点击设为 A · 悬停联动",
    "Drag a region to filter candidates across panels. A and B stay pinned.":"拖动框选以联动筛选候选球队，A、B 始终保留。",
    "No candidates in this selection.":"该选择中没有候选球队。", "Change the scope or reset filters.":"请调整比赛范围或重置筛选。",
    "Per-match averages · xG = expected goals":"场均值 · xG 为预期进球", "Expected conceded":"预期失球",
    "Match evidence":"比赛证据", "Each dot is a match · click to inspect":"每个点代表一场比赛 · 点击查看", "Goal difference by match · dashed line = team average":"每场比赛的净胜球 · 虚线为球队平均值",
    "Matches in chronological order →":"按比赛时间排序 →", "Difference per match":"场均差值", "Goal difference by match":"各场比赛净胜球", "Latest four matches / team · goal difference":"每队最近四场比赛 · 净胜球"
  };
  Object.assign(window.STYLE_TWINS_MESSAGES["zh-Hans"], simplified);
  const traditional = {
    "Below average":"低於平均", "Above average":"高於平均", "Goals scored":"進球數", "{0} teams · {1} matches · {2} style indicators":"{0} 支球隊 · {1} 場比賽 · {2} 項風格指標",
    "Explore teams":"球隊分析", "Same style.":"相似風格。", "Different story.":"不同結果。",
    "Choose a question. Start with your team.":"選擇你感興趣的問題，從你的球隊開始。", "What do you want to explore?":"你想探索什麼？",
    "Who plays like my team?":"誰和我的球隊踢得相似？", "Explore the style map and closest teams.":"查看風格地圖，發現最相似的球隊。",
    "Similar style. Different results?":"風格相似，結果為何不同？", "Compare chances created and actual scorelines.":"對比創造的機會與實際比數。",
    "Which matches make the difference?":"哪些比賽帶來了差異？", "Follow the individual games behind the averages.":"查看平均數據背後的每一場比賽。",
    "Your team":"你的球隊", "Explore my team":"開始分析", "YOUR STARTING COMPARISON":"從這組對比開始", "From match data":"基於比賽數據",
    "Style similarity percentile":"風格相似度百分位", "Goal difference gap / match":"場均淨勝球差距", "One workspace. Every panel connected.":"一個工作台，所有面板聯動。",
    "Data & method ↗":"數據與方法 ↗", "Play alike. Compare the difference.":"風格相似，差異在哪？", "Find style twins":"尋找相似球隊",
    "Compare results":"比較比賽結果", "Inspect matches":"查看比賽證據", "Team A":"球隊 A", "Team B":"球隊 B", "Match scope":"比賽範圍",
    "Full tournament":"整個賽事", "Style indicators ({0})":"風格指標（{0}）", "Choose at least two indicators":"至少選擇兩項指標",
    "Reset indicators":"重設指標", "Reset filters":"重設篩選", "Similarity percentile: {0}/{1}":"相似度百分位：{0}/{1}", "{0} + {1} matches":"{0} + {1} 場比賽",
    "{0} teams in view":"目前顯示 {0} 支球隊", "Clear region ×":"清除框選 ×", "Select region":"框選區域", "All style groups":"所有風格組",
    "Closest styles":"最相似的球隊", "For {0} · click to set B":"與 {0} 比較 · 點擊設為 B", "Distance ↓":"距離 ↓", "Style fingerprint":"風格指紋",
    "Selected teams + closest candidates":"所選球隊及最相似候選", "Lower":"較低", "Higher":"較高", "Standardized indicators · {0} = tournament average · values shown in σ":"標準化指標 · {0} 為賽事平均 · 單位 σ",
    "Chances & results":"機會與結果", "Averages per match · same selected scope":"所選比賽範圍內的場均值", "Open detail ↗":"查看詳情 ↗", "Test this comparison ↗":"檢驗這組對比 ↗",
    "Per-match averages · xG = expected goals":"場均值 · xG 為預期進球", "Chances vs scorelines":"機會與比數", "One dot per team · averages per match":"每個點代表一支球隊 · 場均值", "PCA projection · {0} of style variation shown":"PCA 投影 · 展示 {0} 的風格差異",
    "Click a team to set B · Shift-click to set A · Hover to link panels":"點擊設為 B · Shift + 點擊設為 A · 懸停聯動",
    "Drag a region to filter candidates across panels. A and B stay pinned.":"拖動框選以聯動篩選候選球隊，A、B 始終保留。",
    "Match evidence":"比賽證據", "Each dot is a match · click to inspect":"每個點代表一場比賽 · 點擊查看", "Goal difference by match · dashed line = team average":"每場比賽的淨勝球 · 虛線為球隊平均值"
  };
  Object.assign(window.STYLE_TWINS_MESSAGES["zh-Hant"], traditional);
})();
