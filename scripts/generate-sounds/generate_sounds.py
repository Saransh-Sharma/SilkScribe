#!/usr/bin/env python3
"""Synthesise the SilkScribe "Silk" feedback cue set.

Pure standard library (``wave`` + ``math``) so the set is reproducible on any
machine with Python 3 and no third-party packages.

The five cues are deliberately one instrument: a soft struck-glass tone built
from a sine fundamental plus two fast-decaying, slightly inharmonic partials.
Pitches are drawn from a single F-major-pentatonic set so the cues sit together
musically, and ``cancel`` is the exact melodic inverse of ``start``.

    start        A4 -> D5    rising fourth    "opening"
    transcribing C5          single soft tap  "taken"
    done         F5 -> C6    rising fifth     "resolved"
    error        G4 -> Eb4   falling minor 3  "off"
    cancel       D5 -> A4    falling fourth   "closed"

Usage:
    python3 scripts/generate-sounds/generate_sounds.py
    python3 scripts/generate-sounds/generate_sounds.py --out /tmp/preview
"""

from __future__ import annotations

import argparse
import math
import wave
from array import array
from pathlib import Path

SAMPLE_RATE = 48_000
BIT_DEPTH = 16
MAX_AMPLITUDE = 2 ** (BIT_DEPTH - 1) - 1

# Hard peak limit. Nothing here should ever come close to full scale — these are
# background cues layered over whatever the user is already listening to.
PEAK_CEILING = 0.32

# Pitches (Hz).
A4 = 440.00
C5 = 523.25
D5 = 587.33
EB4 = 311.13
G4 = 392.00
F5 = 698.46
C6 = 1046.50

# Partial structure: (harmonic ratio, amplitude, decay multiplier).
# Higher partials are quieter and die faster, which is what makes a struck tone
# read as "soft" rather than "electronic". The slight detune off the exact
# integer ratio adds the faint inharmonicity of struck glass.
PARTIALS = (
    (1.000, 1.00, 1.00),
    (2.004, 0.26, 2.10),
    (3.011, 0.09, 3.40),
)


def _tone(freq: float, duration: float, attack: float, amplitude: float) -> list[float]:
    """One struck-glass note: fast-but-not-clicky attack, exponential decay."""
    count = int(SAMPLE_RATE * duration)
    attack_samples = max(1, int(SAMPLE_RATE * attack))
    samples = [0.0] * count

    for index in range(count):
        t = index / SAMPLE_RATE

        # Raised-cosine attack avoids the click of a linear ramp, then a
        # -60 dB exponential tail over the note's length.
        if index < attack_samples:
            envelope = 0.5 - 0.5 * math.cos(math.pi * index / attack_samples)
        else:
            envelope = 1.0
        envelope *= math.exp(-6.9 * t / duration)

        value = 0.0
        for ratio, partial_amp, decay_mult in PARTIALS:
            partial_env = math.exp(-6.9 * decay_mult * t / duration)
            value += partial_amp * partial_env * math.sin(2.0 * math.pi * freq * ratio * t)

        samples[index] = value * envelope * amplitude

    return samples


def _mix(layers: list[tuple[float, list[float]]]) -> list[float]:
    """Overlay notes at their start offsets (seconds) onto one buffer."""
    length = max(int(SAMPLE_RATE * offset) + len(data) for offset, data in layers)
    buffer = [0.0] * length

    for offset, data in layers:
        start = int(SAMPLE_RATE * offset)
        for index, value in enumerate(data):
            buffer[start + index] += value

    return buffer


def _lowpass(samples: list[float], cutoff_hz: float) -> list[float]:
    """One-pole lowpass. Takes the glassy edge off the upper partials."""
    dt = 1.0 / SAMPLE_RATE
    rc = 1.0 / (2.0 * math.pi * cutoff_hz)
    alpha = dt / (rc + dt)

    out = [0.0] * len(samples)
    previous = 0.0
    for index, value in enumerate(samples):
        previous += alpha * (value - previous)
        out[index] = previous

    return out


def _rms(samples: list[float]) -> float:
    if not samples:
        return 0.0
    return math.sqrt(sum(value * value for value in samples) / len(samples))


def _normalize(samples: list[float], target_rms: float) -> list[float]:
    """Normalise to a target RMS, then clamp the peak.

    RMS rather than peak: peak normalisation systematically underweights short
    transients, which would leave `cancel` and `transcribing` inaudible next to
    the longer cues. Targets are low on purpose — these must read as subtle.
    """
    current = _rms(samples)
    if current == 0.0:
        return samples

    scaled = [value * (target_rms / current) for value in samples]

    peak = max((abs(value) for value in scaled), default=0.0)
    if peak > PEAK_CEILING:
        scaled = [value * (PEAK_CEILING / peak) for value in scaled]

    return scaled


def _fade_out(samples: list[float], duration: float = 0.012) -> list[float]:
    """Guarantee the buffer ends at true zero so there is no tail click."""
    count = min(len(samples), int(SAMPLE_RATE * duration))
    for index in range(count):
        position = count - index
        samples[len(samples) - position] *= index / count if count else 0.0
    return samples


def _write(path: Path, samples: list[float]) -> None:
    frames = array(
        "h",
        (int(max(-1.0, min(1.0, value)) * MAX_AMPLITUDE) for value in samples),
    )

    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(BIT_DEPTH // 8)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(frames.tobytes())


# name -> (notes, lowpass cutoff, target RMS)
# notes: (frequency, start offset s, duration s, attack s, relative amplitude)
CUES: dict[str, tuple[tuple[tuple[float, float, float, float, float], ...], float, float]] = {
    # Rising fourth. The second note lands while the first is still ringing.
    "start": (
        ((A4, 0.000, 0.150, 0.010, 0.85), (D5, 0.062, 0.170, 0.008, 1.00)),
        7200.0,
        0.040,
    ),
    # A single soft tap: the app has taken the audio and is working on it.
    "transcribing": (
        ((C5, 0.000, 0.140, 0.010, 1.00),),
        6200.0,
        0.026,
    ),
    # Rising fifth with the longest tail of the set — the one moment of release.
    "done": (
        ((F5, 0.000, 0.230, 0.008, 0.80), (C6, 0.085, 0.300, 0.007, 1.00)),
        9000.0,
        0.032,
    ),
    # Falling minor third, low and filtered: reads as "off" without alarming.
    "error": (
        ((G4, 0.000, 0.190, 0.012, 0.90), (EB4, 0.105, 0.280, 0.012, 1.00)),
        3600.0,
        0.029,
    ),
    # The melodic inverse of `start` — deliberately the same gesture, undone.
    "cancel": (
        ((D5, 0.000, 0.150, 0.010, 0.85), (A4, 0.062, 0.180, 0.010, 1.00)),
        5200.0,
        0.026,
    ),
}


def build(name: str) -> list[float]:
    notes, cutoff, target_rms = CUES[name]
    layers = [
        (offset, _tone(freq, duration, attack, amplitude))
        for freq, offset, duration, attack, amplitude in notes
    ]
    samples = _mix(layers)
    samples = _lowpass(samples, cutoff)
    samples = _normalize(samples, target_rms)
    return _fade_out(samples)


def main() -> None:
    default_out = Path(__file__).resolve().parents[2] / "src-tauri" / "resources"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=default_out)
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Re-read each written file and report its measured levels.",
    )
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    for name in CUES:
        samples = build(name)
        path = args.out / f"silk_{name}.wav"
        _write(path, samples)
        print(f"  silk_{name}.wav  {len(samples) / SAMPLE_RATE * 1000:6.1f} ms  ->  {path}")

    if args.verify:
        print()
        _verify(args.out)


def _verify(out: Path) -> None:
    """Report what actually landed on disk.

    This is the artefact a reviewer can check without an audio editor: the cues
    should be within a couple of dB of each other in RMS, and nowhere near full
    scale in peak.
    """
    header = f"{'cue':<14}{'ch':>3}{'rate':>7}{'ms':>8}{'peak':>8}{'peak dB':>9}{'rms':>9}{'rms dB':>9}"
    print(header)
    print("-" * len(header))

    for name in CUES:
        path = out / f"silk_{name}.wav"
        with wave.open(str(path), "rb") as handle:
            channels = handle.getnchannels()
            rate = handle.getframerate()
            frames = handle.getnframes()
            raw = array("h")
            raw.frombytes(handle.readframes(frames))

        samples = [value / MAX_AMPLITUDE for value in raw]
        peak = max((abs(value) for value in samples), default=0.0)
        rms = _rms(samples)
        to_db = lambda v: 20 * math.log10(v) if v > 0 else float("-inf")  # noqa: E731

        print(
            f"{name:<14}{channels:>3}{rate:>7}{frames / rate * 1000:>8.1f}"
            f"{peak:>8.3f}{to_db(peak):>9.1f}{rms:>9.4f}{to_db(rms):>9.1f}"
        )


if __name__ == "__main__":
    main()
