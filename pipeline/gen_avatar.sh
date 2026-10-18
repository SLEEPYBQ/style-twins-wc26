#!/bin/zsh
# Generate one capsule-eye avatar with the ChatGPT-desktop-bundled Codex CLI.
# Usage: gen_avatar.sh <player_id> <reference-photo-path>
# Reads kit colours from data/avatar_manifest.csv, writes web/img/avatars/<player_id>.png
# Env overrides: AVATAR_MODEL (default gpt-6.1-sol), AVATAR_OUT_DIR (default web/img/avatars)
set -eu
CX=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex
HERE=${0:A:h}
ROOT=${HERE:h}
PID=$1; REF=${2:A}
MODEL=${AVATAR_MODEL:-gpt-6.1-sol}
OUT_DIR=${AVATAR_OUT_DIR:-$ROOT/web/img/avatars}
mkdir -p "$OUT_DIR"
ROW=$(python3 -I -c "
import csv,sys
for r in csv.DictReader(open('$ROOT/data/avatar_manifest.csv')):
    if r['player_id']=='$PID': print(r['kit'], r['trim'], r['bg'], r['display_name'].replace(' ','_')); break
")
[[ -z "$ROW" ]] && { echo "unknown player $PID" >&2; exit 2; }
read KIT TRIM BG NAME <<< "$ROW"
PROMPT=$(sed -e "s/{KIT}/$KIT/g" -e "s/{TRIM}/$TRIM/g" -e "s/{BG}/$BG/g" "$HERE/image_prompts/avatar_front_template.txt")
# Clarification of the existing beard rule (most frequent QC failure: smooth dark chin bars read as a mouth).
PROMPT+=$'\n\n[补充说明]\n胡须只能画成贴在下巴/脸颊外轮廓上、边缘带一点毛发质感的色块；不要在脸内画光滑的深色横条、圆角块或弧线（会被看成嘴巴）。没有明显胡须就不画。\n球衣（包括肩部和袖子）完全是纯色，不要画肩部条纹、袖口条纹或拼色。'
# On a regeneration after visual QC, remind the model which existing rule the previous image broke (rules unchanged).
RETRY=$(python3 -I -c "
import csv,os,re
p='$ROOT/data/avatar_status.csv'
if os.path.exists(p):
    for r in csv.DictReader(open(p, encoding='utf-8')):
        if r['player_id']=='$PID':
            m=re.search(r'QC rejected \\((.*)\\), queued', r['note']); print(m.group(1) if m else ''); break
")
[[ -n "$RETRY" ]] && PROMPT+=$'\n\n[重试说明]\n上一张图在质检中被退回，原因：'"$RETRY"$'。请在完全遵守以上全部规则的前提下修正这一问题。'

"$CX" exec --skip-git-repo-check -s workspace-write -m "$MODEL" -c model_reasoning_effort="low" -C "$OUT_DIR" \
"Use your built-in image generation tool (imagegen skill, built-in image_gen path, NOT the CLI fallback) to create exactly ONE square image.
First load the reference photo with view_image so it is in context: $REF
The person to convert is the footballer ${NAME//_/ } shown in that reference photo (if several people appear, use the most prominent footballer).

$PROMPT

After generating, copy the final image into the current working directory as ${PID}.png (overwrite only that file). Do not create any other files. Reply with just the saved filename."
test -s "$OUT_DIR/${PID}.png" && echo "ok $PID"
