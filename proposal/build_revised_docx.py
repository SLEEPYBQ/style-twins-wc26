"""Write the revised proposal into a copy of the original .docx so fonts, spacing and numbering stay identical.

Usage: python3 -I build_revised_docx.py <original.docx> <out.docx>
"""
import copy
import sys

import docx
from docx.oxml.ns import qn

ORIG, OUT = sys.argv[1], sys.argv[2]
d = docx.Document(ORIG)
P = d.paragraphs
T = {"title": P[0], "subtitle": P[1], "team": P[2], "section": P[3], "lead": P[4], "plain": P[6],
     "design": P[14], "question": P[22], "ref": P[29]}
proto = {k: copy.deepcopy(v._p) for k, v in T.items()}
run_bold = copy.deepcopy(P[4].runs[0]._r)
run_norm = copy.deepcopy(P[4].runs[1]._r)
run_ref = copy.deepcopy(P[29].runs[1]._r)

body = d.element.body
for p in list(body.iterchildren(qn("w:p"))):
    body.remove(p)
sect = body.find(qn("w:sectPr"))


def para(kind, parts, italic=False):
    """parts: list of (text, bold) tuples or a plain string."""
    el = copy.deepcopy(proto[kind])
    for child in list(el):
        if child.tag in (qn("w:r"), qn("w:hyperlink"), qn("w:proofErr"), qn("w:bookmarkStart"), qn("w:bookmarkEnd")):
            el.remove(child)
    if isinstance(parts, str):
        parts = [(parts, False)]
    base_runs = {"ref": run_ref}
    for text, bold in parts:
        if kind in ("title", "subtitle", "team", "section"):
            r = copy.deepcopy(T[kind].runs[0]._r)
        else:
            r = copy.deepcopy(base_runs.get(kind, run_bold if bold else run_norm))
        rpr = r.find(qn("w:rPr"))
        if rpr is None:
            rpr = r.makeelement(qn("w:rPr"), {})
            r.insert(0, rpr)
        for tag in ("w:b", "w:bCs", "w:i", "w:iCs"):
            for e in rpr.findall(qn(tag)):
                rpr.remove(e)
        if bold:
            rpr.append(rpr.makeelement(qn("w:b"), {}))
        if italic:
            rpr.append(rpr.makeelement(qn("w:i"), {}))
        for t in r.findall(qn("w:t")):
            r.remove(t)
        t = r.makeelement(qn("w:t"), {})
        t.text = text
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        r.append(t)
        el.append(r)
    sect.addprevious(el)


para("title", "Group Project Proposal (Revised)")
para("subtitle", [("Style Twins: Why Teams That Play Alike Get Different Results at the 2026 World Cup", True)])
para("team", "Team: 6   |   Members: Chonghao Zhong, Zhixiang Zhang, Xuning Hu, Baiqiao Zhang")
para("plain", "Revised after instructor feedback: one user group, explanatory questions, all 104 matches alike.", italic=True)

para("section", "1. Topic and Problem")
para("lead", [("Problem. ", True), ("Fans explain results through style (“they parked the bus”), yet teams with almost identical styles end the "
              "tournament with very different results. Was the gap the team’s own execution, the opponents it met, finishing luck or the "
              "goalkeeper? This needs style similarity, an opponent-aware expectation and a split of each result, which no single table "
              "or pivot provides.", False)])
para("lead", [("Why visualization? ", True), ("The answer is a chain of comparisons: who plays alike, how their results differ, and which matches "
              "made the difference. We link a clustering overview, a pairwise explanation view and a per-match reconstruction, following "
              "CrossSet [1] (overview and drill-down) and SoccerStories [3] (linked soccer views). Without tracking data, replays are schematic.", False)])

para("section", "2. Data")
para("lead", [("Source. ", True), ("Worldcup26 [2], an independently maintained CSV dataset derived from FIFA Training Centre reports: 104 matches, "
              "48 teams, 1,277 players, 21 tables and 95,739 rows. The primary unit is one team in one match (208 records), linked to 2,571 "
              "shots, 2,587 events and 52,072 passing links.", False)])
para("lead", [("Style features. ", True), ("Ten “style dials” describe how a team plays, never how well: ball share, patient build-up, "
              "direct play, transition attacks, final-third presence, crosses, high press, deep block, counter-press and press intensity. "
              "Goals, xG and shots are kept separate as outcomes.", False)])
para("lead", [("Preparation. ", True), ("We pivot metric tables, parse compound values such as “20 (12)”, rescale overlapping phase shares "
              "within the in- and out-of-possession groups, pair substitutions, detect second yellows and remove zero-weight and self-passing "
              "links. The goal events reproduce all 104 final scores.", False)])

para("section", "3. Goals and Visualization Design")
para("lead", [("Main goal. ", True), ("Explain why stylistically similar teams get different results. k-means (k = 5) on standardized team styles "
              "gives five playstyles, and PCA places teams on a style map. For each team-match, expected xG for and against comes from the 20 "
              "most similar team-matches by other teams plus the opponent’s leave-one-out xG record (linear regression). Goal difference "
              "then splits exactly into style, opponents, chance creation, chance prevention, finishing (goals − xG) and goalkeeping "
              "(xG faced − goals conceded). All views are linked.", False)])
para("design", [("Playstyle overview: archetype cards; a style map with cluster hulls, colour plus shape per playstyle, match "
                 "trajectories and twin links; a 48-team × 10-dial heatmap. Toggling dials recomputes it all live.", False)])
para("design", [("Style twins: pairs ranked by similarity and result gap; a head-to-head page with a plain-language verdict, an attribution "
                 "bar (style / opponents / own execution) and both six-part result recipes with per-match dots.", False)])
para("design", [("Match replay for all 104 matches: a schematic pitch (role lines ordered by passing-network seriation), a play/scrub "
                 "timeline with animated shots, cards and substitutions, a passing-web mode, player cards and the per-match recipe.", False)])
para("design", [("Visual design: a flat cartoon style for enthusiasts, with archetype mascots and player avatars stylised from CC-licensed "
                 "Wikimedia Commons photos; a colour-vision-checked palette plus marker shapes.", False)])
para("design", [("Implementation and evaluation: Python (pandas, scikit-learn) and D3.js. Case studies plus a task study with 5–6 "
                 "enthusiasts against the raw tables (correctness, time, confidence).", False)])

para("section", "4. Target Users and Questions")
para("lead", [("Target users. ", True), ("Football enthusiasts who understand the rules and everyday tactical terms (possession, pressing, "
              "low block, xG) but are not professional analysts. They want evidence for claims like “they only won because of their keeper”.", False)])
para("lead", [("Questions the system should help answer:", True)])
para("question", "When two teams play the same style, why does one get better results: its own chance creation or prevention, finishing "
                 "and goalkeeping, easier opponents, or remaining style differences?")
para("question", "Are the playstyle groups real: do clusters and twins survive when features are switched off?")
para("question", "Do teams abandon their style against some opponents, and does it pay off?")
para("question", "For any match, how did the result come about (chances, substitutions, cards, passing)?")
para("lead", [("Early findings. ", True), ("Once style is known, opponents add little to expected attack (weight 0.09 vs 1.05). Execution carries over — the 32 "
              "knockout teams’ group-stage chance creation and prevention correlate r = 0.38 with their knockout rate — while finishing and goalkeeping do not "
              "(r = 0.03), separating skill from luck. Spain won while scoring 3.5 goals below its xG; its edge was chance prevention (2.5 xG conceded in eight "
              "matches). The Netherlands and Croatia are more alike than 99% of team pairs, yet the Dutch did 1.75 goals per match better, "
              "finishing being the largest factor. In the final, Argentina played like a Fortress team, not its usual Architects.", False)])

para("section", "5. References")
para("ref", "Matković, K., Splechtna, R., Gračanin, D., and Hauser, H. “CrossSet: Unveiling the Complex Interplay of Two Set-typed "
            "Dimensions in Multivariate Data.” arXiv:2508.00424, 2025.")
para("ref", "Alamyy. “Worldcup26.” CSV dataset, table inventory, and data dictionary derived from FIFA Training Centre reports. "
            "https://github.com/Alamyy/Worldcup26")
para("ref", "Perin, C., Vuillemot, R., and Fekete, J.-D. “SoccerStories: A Kick-off for Visual Soccer Analysis.” IEEE TVCG 19(12), "
            "2506–2515, 2013. doi:10.1109/TVCG.2013.192.")

d.save(OUT)
print("saved", OUT)
