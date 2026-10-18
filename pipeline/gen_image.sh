#!/bin/zsh
# Generate one transparent illustration with the ChatGPT-desktop-bundled Codex CLI.
# Usage: gen_image.sh <output-name-without-ext> <subject-prompt-file> [reference-image ...]
set -u
CX=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex
HERE=${0:A:h}
OUT_DIR=${HERE:h}/web/img/gen
NAME=$1; SUBJECT=$(cat "$2"); shift 2
REFS=""
for r in "$@"; do REFS+="- Reference image (likeness reference only, do not copy its background or photo style): $r"$'\n'; done
mkdir -p "$OUT_DIR"
"$CX" exec --skip-git-repo-check -s workspace-write -m gpt-6.1-sol -c model_reasoning_effort="low" -C "$OUT_DIR" \
"Use your built-in image generation tool (the imagegen skill's built-in image_gen path, NOT the CLI fallback) to create ONE image. Ask for a genuinely transparent background and preserve the alpha channel.
${REFS:+If reference images are listed, first load each with view_image so it is in context, then generate.
$REFS}
$(cat "$HERE/image_prompts/STYLE.txt")

SUBJECT:
$SUBJECT

After generating, copy the final PNG into the current working directory as ${NAME}.png (overwrite only that file). Then run: python3 -c \"from PIL import Image; im=Image.open('${NAME}.png'); print(im.mode, im.size, im.getextrema()[-1] if im.mode=='RGBA' else 'no alpha')\" and report the output. Do not create any other files."
