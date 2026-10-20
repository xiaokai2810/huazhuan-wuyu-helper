"""渲染原创循环曲《瓷光小调》：柔和键琴、木音琶音与铺底和弦，无外部素材。

运行需要 numpy 和 ffmpeg；游戏播放只使用生成的 MP3，不在手机实时合成。
"""
from pathlib import Path
import subprocess
import tempfile
import wave
import numpy as np

ROOT = Path(__file__).resolve().parent
RATE, BPM, BARS = 44100, 84, 16
BEAT = 60 / BPM
LENGTH = round(BARS * 4 * BEAT * RATE)
mix = np.zeros((LENGTH, 2), dtype=np.float64)


def note(midi, beat, length, volume, pan=0, tone="keys"):
    n = round(length * RATE)
    t = np.arange(n) / RATE
    frequency = 440 * 2 ** ((midi - 69) / 12)
    if tone == "pad":
        sound = np.sin(2 * np.pi * frequency * t) * 0.8
        sound += np.sin(2 * np.pi * frequency * 1.002 * t) * 0.12
        envelope = np.minimum(t / 0.45, 1) * np.minimum((length - t) / 0.85, 1)
    else:
        decay = 1.1 if tone == "keys" else 0.5
        sound = np.sin(2 * np.pi * frequency * t) * np.exp(-t / decay)
        sound += 0.22 * np.sin(2 * np.pi * frequency * 2.002 * t) * np.exp(-t / (decay * 0.5))
        sound += 0.045 * np.sin(2 * np.pi * frequency * 3 * t) * np.exp(-t / 0.2)
        envelope = np.minimum(t / 0.012, 1) * np.minimum((length - t) / 0.12, 1)
    sound *= np.clip(envelope, 0, 1) * volume
    stereo = sound[:, None] * np.array([np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)])
    start = round(beat * BEAT * RATE) % LENGTH
    first = min(n, LENGTH - start)
    mix[start:start + first] += stereo[:first]
    if first < n:
        mix[:n - first] += stereo[first:]


chords = [[50, 57, 64, 66], [45, 52, 59, 61], [47, 54, 57, 62], [43, 50, 57, 59],
          [40, 47, 54, 55], [47, 54, 57, 62], [43, 50, 57, 59], [45, 52, 57, 62]]
melody = [[(0, 74), (1.5, 78), (2.5, 76)], [(0.5, 73), (2, 71), (3, 69)],
          [(0, 74), (1, 78), (2.5, 81)], [(0.5, 79), (2, 78), (3, 74)],
          [(0, 76), (1.5, 74), (3, 71)], [(0.5, 74), (2, 73), (3, 69)],
          [(0, 71), (1.5, 74), (2.5, 78)], [(0, 76), (2, 73), (3, 69)]]
for bar in range(BARS):
    chord = chords[bar % 8]
    for i, pitch in enumerate(chord):
        note(pitch, bar * 4, BEAT * 5, 0.027, (i - 1.5) * 0.22, "pad")
    note(chord[0] - 12, bar * 4, BEAT * 3, 0.13, 0, "keys")
    for i, off in enumerate([0.5, 1.5, 2.5, 3.5]):
        note(chord[1 + i % 3] + 12, bar * 4 + off, 1.6, 0.09, -0.3 if i % 2 else 0.3, "wood")
    for off, pitch in melody[bar % 8]:
        # 后半段增加轻柔的回答声部，循环仍以属和弦回到首句。
        note(pitch, bar * 4 + off, 2.6, 0.19 if bar < 8 else 0.17, -0.12, "keys")
    if bar >= 8 and bar % 2 == 0:
        note(chord[2] + 12, bar * 4 + 3.5, 2.0, 0.055, 0.38, "keys")

# 回声尾音绕回开头，使循环接缝连续；轻微立体声空间，不使用噪声或鼓点。
dry = mix.copy()
for delay, amount in [(0.137, 0.14), (0.283, 0.10), (0.437, 0.065), (0.691, 0.035)]:
    mix += np.roll(dry[:, ::-1], round(delay * RATE), axis=0) * amount
mix *= 0.7 / max(0.7, np.max(np.abs(mix)))
pcm = (mix * 32767).astype("<i2")
output = ROOT / "assets" / "porcelain-garden.mp3"
output.parent.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as temp:
    wav = Path(temp) / "music.wav"
    with wave.open(str(wav), "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav),
                    "-c:a", "libmp3lame", "-b:a", "96k", "-map_metadata", "-1", str(output)], check=True)
print(f"{output.name}: {LENGTH / RATE:.2f}s, {output.stat().st_size} bytes, peak={np.max(np.abs(mix)):.3f}")
