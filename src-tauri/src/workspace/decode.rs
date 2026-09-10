//! Incremental decoder: bounded buffers, never load an entire imported file into RAM.
use anyhow::{bail, Result};
use std::{
    fs::File,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};
use symphonia::core::{
    audio::SampleBuffer, codecs::DecoderOptions, formats::FormatOptions, io::MediaSourceStream,
    meta::MetadataOptions, probe::Hint,
};

pub fn decode(input: &Path, output: &Path, cancelled: &AtomicBool) -> Result<f64> {
    let source = MediaSourceStream::new(Box::new(File::open(input)?), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = input.extension().and_then(|s| s.to_str()) {
        hint.with_extension(ext);
    }
    let mut reader = symphonia::default::get_probe()
        .format(
            &hint,
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )?
        .format;
    let track = reader
        .default_track()
        .ok_or_else(|| anyhow::anyhow!("No audio track was found"))?;
    let track_id = track.id;
    let mut decoder =
        symphonia::default::get_codecs().make(&track.codec_params, &DecoderOptions::default())?;
    let mut writer = hound::WavWriter::create(
        output,
        hound::WavSpec {
            channels: 1,
            sample_rate: 16000,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        },
    )?;
    let mut count = 0u64;
    let mut input_frames = 0u64;
    let mut delay = 0usize;
    let mut resampler: Option<rubato::SincFixedIn<f32>> = None;
    let mut pending = Vec::new();
    let mut rate = 0;
    use rubato::Resampler;
    loop {
        if cancelled.load(Ordering::Relaxed) {
            bail!("Cancelled");
        }
        let packet = match reader.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break
            }
            Err(e) => return Err(e.into()),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = decoder.decode(&packet)?;
        let spec = *decoded.spec();
        if rate != spec.rate {
            if rate != 0 {
                bail!("Audio sample rate changes within this file are unsupported");
            }
            rate = spec.rate;
            resampler = Some(rubato::SincFixedIn::<f32>::new(
                16000.0 / rate as f64,
                1.0,
                rubato::SincInterpolationParameters {
                    sinc_len: 128,
                    f_cutoff: 0.95,
                    interpolation: rubato::SincInterpolationType::Linear,
                    oversampling_factor: 128,
                    window: rubato::WindowFunction::BlackmanHarris2,
                },
                4096,
                1,
            )?);
            delay = resampler.as_ref().unwrap().output_delay();
        }
        let mut samples = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        samples.copy_interleaved_ref(decoded);
        input_frames += (samples.samples().len() / spec.channels.count()) as u64;
        for frame in samples.samples().chunks(spec.channels.count()) {
            pending.push(frame.iter().copied().sum::<f32>() / frame.len() as f32);
        }
        while pending.len() >= 4096 {
            let block: Vec<f32> = pending.drain(..4096).collect();
            let out = resampler.as_mut().unwrap().process(&[block], None)?;
            for value in &out[0] {
                if delay > 0 {
                    delay -= 1;
                    continue;
                }
                writer.write_sample(*value)?;
                count += 1;
            }
        }
    }
    if let Some(resampler) = &mut resampler {
        let expected = (input_frames as f64 * 16000.0 / rate as f64).round() as u64;
        while count < expected {
            let out = resampler.process_partial(Some(&[pending]), None)?;
            pending = vec![0.0; 4096];
            for value in &out[0] {
                if delay > 0 {
                    delay -= 1;
                    continue;
                }
                if count == expected {
                    break;
                }
                writer.write_sample(*value)?;
                count += 1;
            }
        }
    }
    writer.finalize()?;
    if count == 0 {
        bail!("This file contains no decodable audio");
    }
    Ok(count as f64 / 16000.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resampling_preserves_duration_and_stereo_speech() {
        let dir = tempfile::tempdir().unwrap();
        for rate in [16000, 44100, 48000] {
            let input = dir.path().join(format!("{rate}.wav"));
            let output = dir.path().join(format!("{rate}-out.wav"));
            let mut writer = hound::WavWriter::create(
                &input,
                hound::WavSpec {
                    channels: 2,
                    sample_rate: rate,
                    bits_per_sample: 16,
                    sample_format: hound::SampleFormat::Int,
                },
            )
            .unwrap();
            for i in 0..rate {
                let value = ((i as f32 * 440.0 / rate as f32 * std::f32::consts::TAU).sin()
                    * 16000.0) as i16;
                writer.write_sample(value).unwrap();
                writer.write_sample(value).unwrap();
            }
            writer.finalize().unwrap();
            let duration = decode(&input, &output, &AtomicBool::new(false)).unwrap();
            assert_eq!(duration, 1.0);
            let mut reader = hound::WavReader::open(output).unwrap();
            assert_eq!(reader.duration(), 16000);
            let samples: Vec<f32> = reader.samples().map(Result::unwrap).collect();
            assert!(samples[1000..15000].iter().any(|v| v.abs() > 0.4));
        }
    }
    #[test]
    fn rejects_cancelled_and_corrupt_input() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("bad.mp3");
        std::fs::write(&input, b"not audio").unwrap();
        assert!(decode(&input, &dir.path().join("out.wav"), &AtomicBool::new(false)).is_err());
    }
}
