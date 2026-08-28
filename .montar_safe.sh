#!/bin/bash
set -e
BASE="$HOME/montaje"
OUTDIR="$BASE/Montados"
MODELO="$BASE/modelos/ggml-small.bin"
NOMBRE="${1%.*}"
ENTRADA=$(ls "$BASE/entrada/$NOMBRE".* 2>/dev/null | head -1)
[ -z "$ENTRADA" ] && { echo "No encuentro $NOMBRE en $BASE/entrada/"; exit 1; }
if command -v whisper-cli >/dev/null 2>&1; then WHISPER=whisper-cli; else WHISPER=whisper-cpp; fi
LOGO=$(ls "$BASE"/marca/logo.* 2>/dev/null | head -1)
CIERRE=$(ls "$BASE"/marca/cierre.* 2>/dev/null | head -1)

mkdir -p "$OUTDIR"
SALIDA="$OUTDIR/${NOMBRE}_reel.mp4"
SUBSALIDA="$OUTDIR/${NOMBRE}.srt"
if [ -e "$SALIDA" ] || [ -e "$SUBSALIDA" ]; then
  n=2
  while [ -e "$OUTDIR/${NOMBRE}_reel_${n}.mp4" ] || [ -e "$OUTDIR/${NOMBRE}_${n}.srt" ]; do n=$((n+1)); done
  SALIDA="$OUTDIR/${NOMBRE}_reel_${n}.mp4"
  SUBSALIDA="$OUTDIR/${NOMBRE}_${n}.srt"
fi

TMP=$(mktemp -d)
echo "==> 1/5 Extrayendo audio"
ffmpeg -y -loglevel error -i "$ENTRADA" -ar 16000 -ac 1 -c:a pcm_s16le "$TMP/audio.wav"

echo "==> 2/5 Transcribiendo palabra a palabra"
$WHISPER -m "$MODELO" -f "$TMP/audio.wav" -l es -ml 1 -sow -osrt -of "$TMP/subs" \
  --prompt "Cultivo de cannabis. Terminos: pH, EC, VPD, PPM, sustrato, drenaje, fertilizante, nutrientes, sales, floracion, vegetativo, Cannabicultor, Growers Alliance." >/dev/null 2>&1

echo "==> 3/5 Corrigiendo y generando subtitulos"
python3 - "$TMP/subs.srt" "$TMP/subs.ass" "$TMP/recorte.txt" <<'EOF'
import sys, re
srt, ass, rec = sys.argv[1], sys.argv[2], sys.argv[3]
C = {"f":"EC","efe":"EC","ece":"EC","ec":"EC","e.c.":"EC","ph":"pH","p.h.":"pH",
     "vpd":"VPD","ppm":"PPM","led":"LED","thc":"THC","cbd":"CBD",
     "cannabicultor":"Cannabicultor","growers":"Growers"}
def t2s(t):
    h,m,r=t.split(":"); s,ms=r.split(","); return int(h)*3600+int(m)*60+int(s)+int(ms)/1000
cues=[]
for b in re.split(r"\n\n+", open(srt,encoding="utf-8").read().strip()):
    L=[x for x in b.split("\n") if x.strip()]
    if len(L)<2 or "-->" not in L[1]: continue
    a,f=[x.strip() for x in L[1].split("-->")]
    txt=" ".join(L[2:]).strip()
    if not txt: continue
    k=txt.strip(" .,;:¡!¿?").lower()
    if k in C: txt=C[k]
    cues.append((t2s(a),t2s(f),txt))
if not cues: raise SystemExit("Sin transcripcion")
INICIO=max(0,cues[0][0]-0.15); FINAL=cues[-1][1]+0.35
open(rec,"w").write(f"{INICIO:.3f} {FINAL:.3f}\n")
def fmt(x):
    x=max(0,x-INICIO); h=int(x//3600); m=int(x%3600//60); s=x%60
    return f"{h}:{m:02d}:{s:05.2f}"
cab="""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Default,Helvetica,74,&H00FFFFFF,&H000000FF,&H00000000,&HA0000000,-1,0,0,0,100,100,0,0,1,6,2,2,60,60,320,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
ev=[]
AMA=r"{\\c&H20A0E8&}"; BLA=r"{\\c&HFFFFFF&}"
for i,(a,b,txt) in enumerate(cues):
    fin=cues[i+1][0] if i+1<len(cues) else b
    if fin-a<0.08: fin=a+0.08
    if fin-a>1.2: fin=a+1.2
    g=(i//3)*3
    trozo=cues[g:g+3]
    linea="".join((AMA+c[2].upper()+BLA if g+j==i else c[2].upper())+(" " if j<len(trozo)-1 else "") for j,c in enumerate(trozo))
    ev.append(f"Dialogue: 0,{fmt(a)},{fmt(fin)},Default,,0,0,0,,{BLA}{linea}")
open(ass,"w",encoding="utf-8").write(cab+"\n".join(ev)+"\n")
EOF

read -r INICIO FINAL < "$TMP/recorte.txt" || true
DUR=$(python3 -c "print(f'{float('$FINAL')-float('$INICIO'):.3f}')")
echo "    Recorte: desde ${INICIO}s durante ${DUR}s"
echo "    Logo: ${LOGO:-NO ENCONTRADO}"
echo "    Cierre: ${CIERRE:-NO ENCONTRADO}"

echo "==> 4/5 Montando cuerpo"
cd "$TMP"
if [ -n "$LOGO" ]; then
  ffmpeg -y -loglevel error -i "$ENTRADA" -i "$LOGO" \
    -filter_complex "[0:v]trim=start=$INICIO:duration=$DUR,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,subtitles=subs.ass[b];[1:v]scale=170:-1,format=rgba,colorchannelmixer=aa=0.85[l];[b][l]overlay=W-w-45:70[v];[0:a]atrim=start=$INICIO:duration=$DUR,asetpts=PTS-STARTPTS,loudnorm=I=-16:TP=-1.5:LRA=11[a]" \
    -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 21 -pix_fmt yuv420p -r 30 \
    -c:a aac -b:a 192k -ar 44100 -ac 2 -movflags +faststart "$TMP/cuerpo.mp4"
else
  ffmpeg -y -loglevel error -i "$ENTRADA" \
    -filter_complex "[0:v]trim=start=$INICIO:duration=$DUR,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,subtitles=subs.ass[v];[0:a]atrim=start=$INICIO:duration=$DUR,asetpts=PTS-STARTPTS,loudnorm=I=-16:TP=-1.5:LRA=11[a]" \
    -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 21 -pix_fmt yuv420p -r 30 \
    -c:a aac -b:a 192k -ar 44100 -ac 2 -movflags +faststart "$TMP/cuerpo.mp4"
fi

if [ -n "$CIERRE" ]; then
  echo "==> 5/5 Anadiendo cierre"
  ffmpeg -y -loglevel error -loop 1 -t 2.5 -i "$CIERRE" -f lavfi -t 2.5 -i anullsrc=r=44100:cl=stereo \
    -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x1a5c32,setsar=1,fade=t=in:st=0:d=0.4" \
    -c:v libx264 -preset medium -crf 21 -pix_fmt yuv420p -r 30 \
    -c:a aac -b:a 192k -ar 44100 -ac 2 "$TMP/cierre.mp4"
  printf "file '%s'\nfile '%s'\n" "$TMP/cuerpo.mp4" "$TMP/cierre.mp4" > "$TMP/lista.txt"
  ffmpeg -y -loglevel error -f concat -safe 0 -i "$TMP/lista.txt" \
    -c:v libx264 -preset medium -crf 21 -pix_fmt yuv420p -r 30 \
    -c:a aac -b:a 192k -ar 44100 -ac 2 -movflags +faststart "$SALIDA"
else
  echo "==> 5/5 Sin cierre"
  cp "$TMP/cuerpo.mp4" "$SALIDA"
fi

cd "$BASE"
cp "$TMP/subs.srt" "$SUBSALIDA"
rm -rf "$TMP"
echo "OK"
ls -lh "$SALIDA"
