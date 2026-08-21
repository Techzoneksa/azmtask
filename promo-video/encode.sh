#!/usr/bin/env bash
# Mixes voiceover + music and encodes the final 1080x1920@30 H.264 MP4.
# Usage: FF=/path/to/ffmpeg-bin-dir ./encode.sh <framesDir> <outFile>
set -euo pipefail
FF="${FF:?set FF to the ffmpeg bin directory}"
FRAMES="${1:?frames dir}"
OUT="${2:?output mp4}"
cd "$(dirname "$0")"

# --- 1. voiceover bed: tempo-fit each trimmed clip and place it on the timeline ---
"$FF/ffmpeg" -y -v error \
  -i audio/vo1_trim.wav -i audio/vo2_trim.wav -i audio/vo3_trim.wav \
  -i audio/vo4_trim.wav -i audio/vo5_trim.wav -i audio/vo6_trim.wav \
  -filter_complex "\
[0:a]atempo=1.076,adelay=350|350[v1];\
[1:a]atempo=1.124,adelay=4400|4400[v2];\
[2:a]adelay=9450|9450[v3];\
[3:a]atempo=1.026,adelay=15350|15350[v4];\
[4:a]atempo=1.055,adelay=22200|22200[v5];\
[5:a]adelay=27150|27150[v6];\
[v1][v2][v3][v4][v5][v6]amix=inputs=6:normalize=0,volume=2.1,apad=whole_dur=30[vo]" \
  -map "[vo]" -t 30 -ar 44100 audio/vo_bed.wav

# --- 2. duck music under the voiceover, master to ad loudness ---
"$FF/ffmpeg" -y -v error -i audio/music.wav -i audio/vo_bed.wav \
  -filter_complex "\
[0:a]volume=0.85[m];\
[m][1:a]sidechaincompress=threshold=0.03:ratio=5:attack=25:release=450:makeup=1[md];\
[md][1:a]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.97[mix]" \
  -map "[mix]" -t 30 -ar 44100 audio/final_mix.wav

# --- 3. encode frames + audio ---
"$FF/ffmpeg" -y -v error \
  -framerate 30 -i "$FRAMES/f_%04d.jpg" \
  -i audio/final_mix.wav \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -level 4.2 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 192k \
  -movflags +faststart -shortest "$OUT"

"$FF/ffprobe" -v quiet -show_entries "format=duration,size" -of default=noprint_wrappers=1 "$OUT"
echo "final: $OUT"
