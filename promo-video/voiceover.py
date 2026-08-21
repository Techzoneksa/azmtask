# Generates the 6 Arabic voiceover clips (ar-SA-HamedNeural) for the promo.
# Requires: pip install edge-tts  (and the proxy CA appended to certifi's bundle)
import asyncio, json, subprocess, sys, os

FFPROBE = os.environ.get("FFPROBE", "ffprobe")

CLIPS = [
    # (filename, start_sec, max_dur, text)
    ("vo1", 0.35, 4.1, "مع برايم بوس، تحكم في جميع عمليات مطعمك من مكان واحد."),
    ("vo2", 4.55, 4.3, "استقبل الطلبات، وأصدر الفواتير، وسرع خدمة عملائك بكل سهولة."),
    ("vo3", 9.40, 5.4, "تابع الطلبات، واربط الكاشير بالمطبخ، لتقليل الأخطاء وتسريع التجهيز."),
    ("vo4", 15.35, 6.4, "راقب المبيعات والمخزون والفروع والموظفين، واتخذ قراراتك بناء على تقارير دقيقة."),
    ("vo5", 22.20, 4.6, "سواء كنت تدير فرعا واحدا أو عدة فروع، كل التفاصيل بين يديك."),
    ("vo6", 27.15, 2.8, "برايم بوس. إدارة أذكى، ونجاح أكبر."),
]

VOICE = "ar-SA-HamedNeural"

async def gen(name, text, rate):
    import edge_tts
    tts = edge_tts.Communicate(text, voice=VOICE, rate=rate)
    await tts.save(f"audio/{name}.mp3")

def dur(path):
    out = subprocess.check_output([FFPROBE, "-v", "quiet", "-show_entries",
        "format=duration", "-of", "csv=p=0", path])
    return float(out.strip())

async def main():
    os.makedirs("audio", exist_ok=True)
    report = {}
    for name, start, max_dur, text in CLIPS:
        rate = "+5%"
        await gen(name, text, rate)
        d = dur(f"audio/{name}.mp3")
        # speed up further if the clip overflows its scene window
        while d > max_dur and int(rate[1:-1]) < 5:
            rate = f"+{int(rate[1:-1]) + 5}%"
            await gen(name, text, rate)
            d = dur(f"audio/{name}.mp3")
        report[name] = {"start": start, "dur": round(d, 2), "max": max_dur, "rate": rate}
        print(name, report[name])
    json.dump(report, open("audio/vo_report.json", "w"), indent=1)

asyncio.run(main())
