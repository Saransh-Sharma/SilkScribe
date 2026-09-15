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

#[derive(serde::Serialize, specta::Type)]
pub struct FileInspection {
    pub path: String,
    pub bytes: u64,
    pub duration: Option<f64>,
    pub error: Option<String>,
}
pub fn inspect(input: &Path) -> Result<(u64, Option<f64>)> {
    let extension = input
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !["wav", "mp3", "m4a", "flac", "ogg"].contains(&extension.as_str()) {
        bail!("Unsupported audio format");
    }
    let file = File::open(input)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() == 0 {
        bail!("Choose a nonempty audio file");
    }
    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    hint.with_extension(&extension);
    let reader = symphonia::default::get_probe()
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
    symphonia::default::get_codecs().make(&track.codec_params, &DecoderOptions::default())?;
    let duration = track
        .codec_params
        .n_frames
        .zip(track.codec_params.sample_rate)
        .filter(|(_, rate)| *rate > 0)
        .map(|(frames, rate)| frames as f64 / rate as f64);
    Ok((metadata.len(), duration))
}

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
            // A codec can end exactly on our input-block boundary. Rubato treats
            // Some(empty) as a missing channel; pad the final block explicitly.
            pending.resize(4096, 0.0);
            let out = resampler.process(&[pending], None)?;
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
    fn all_advertised_containers_decode_with_bundled_codecs() {
        let dir = tempfile::tempdir().unwrap();
        for extension in ["wav", "mp3", "m4a", "flac", "ogg"] {
            let source = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join(format!("../tests/fixtures/audio/tone.{extension}"));
            let (bytes, _) =
                inspect(&source).unwrap_or_else(|error| panic!("{extension}: {error}"));
            assert!(bytes > 0);
            let output = dir.path().join(format!("{extension}.wav"));
            let length = decode(&source, &output, &AtomicBool::new(false))
                .unwrap_or_else(|error| panic!("{extension}: {error}"));
            assert!(
                (length - 1.0).abs() < 0.15,
                "{extension}: duration {length}"
            );
            let mut reader = hound::WavReader::open(output).unwrap();
            assert!(reader
                .samples::<f32>()
                .map(Result::unwrap)
                .any(|sample| sample.abs() > 0.01));
        }
    }
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

/// Keep copying cancellable, bounded, and durable before the document is queued.
pub fn partial_copy_path(media: &Path, input: &Path) -> Result<std::path::PathBuf> {
    use sha2::{Digest, Sha256};
    let canonical = std::fs::canonicalize(input).or_else(|error| {
        if input.is_absolute() {
            Ok(input.to_path_buf())
        } else {
            Err(error)
        }
    })?;
    let fingerprint = format!(
        "{:x}",
        Sha256::digest(canonical.to_string_lossy().as_bytes())
    );
    Ok(media.join(format!(".copy-{fingerprint}.partial")))
}
pub fn copy_audio(
    input: &Path,
    output: &Path,
    cancelled: &AtomicBool,
    mut progress: impl FnMut(u64),
) -> Result<()> {
    use std::io::{Read, Seek, SeekFrom, Write};
    let mut source = File::open(input)?;
    let source_length = source.metadata()?.len();
    let source_modified = source.metadata()?.modified()?;
    let mut target = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(output)?;
    let mut buffer = vec![0u8; 1024 * 1024];
    // Validate the entire saved prefix before trusting a resumed copy. This
    // catches changed originals and partially written/corrupt output without
    // holding the recording in memory or downloading anything again.
    let resume = target.metadata()?.len().min(source_length);
    let mut previous = vec![0u8; buffer.len()];
    let mut copied = 0u64;
    while copied < resume {
        if cancelled.load(Ordering::Relaxed) {
            bail!("Import cancelled");
        }
        let n = (resume - copied).min(buffer.len() as u64) as usize;
        source.read_exact(&mut buffer[..n])?;
        target.read_exact(&mut previous[..n])?;
        if buffer[..n] != previous[..n] {
            break;
        }
        copied += n as u64;
        progress(copied);
    }
    target.set_len(copied)?;
    source.seek(SeekFrom::Start(copied))?;
    target.seek(SeekFrom::Start(copied))?;
    loop {
        if cancelled.load(Ordering::Relaxed) {
            target.sync_all()?;
            bail!("Import cancelled");
        }
        let n = source.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        target.write_all(&buffer[..n])?;
        copied += n as u64;
        progress(copied);
    }
    target.sync_all()?;
    if copied != source_length
        || source.metadata()?.len() != source_length
        || source.metadata()?.modified()? != source_modified
    {
        bail!("The original file changed during import. Retry after it finishes saving.");
    }
    Ok(())
}
#[cfg(test)]
mod copy_tests {
    use super::*;
    #[test]
    fn cancellation_stops_copy_between_bounded_blocks() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("input.wav");
        let output = dir.path().join("copy.partial");
        std::fs::write(&input, vec![1u8; 3 * 1024 * 1024]).unwrap();
        let cancelled = AtomicBool::new(false);
        let result = copy_audio(&input, &output, &cancelled, |_| {
            cancelled.store(true, Ordering::SeqCst)
        });
        assert!(result.is_err());
        assert_eq!(std::fs::metadata(&output).unwrap().len(), 1024 * 1024);
        assert_eq!(std::fs::metadata(input).unwrap().len(), 3 * 1024 * 1024);
    }
    #[test]
    fn resumed_copy_validates_and_repairs_saved_prefix() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("input.wav");
        let output = dir.path().join("copy.partial");
        let bytes = vec![7u8; 3 * 1024 * 1024 + 37];
        std::fs::write(&input, &bytes).unwrap();
        std::fs::write(&output, &bytes[..1024 * 1024]).unwrap();
        copy_audio(&input, &output, &AtomicBool::new(false), |_| {}).unwrap();
        assert_eq!(std::fs::read(&output).unwrap(), bytes);
        let mut corrupt = bytes.clone();
        corrupt[1024 * 1024 + 9] = 1;
        corrupt.extend_from_slice(b"trailing bytes");
        std::fs::write(&output, corrupt).unwrap();
        copy_audio(&input, &output, &AtomicBool::new(false), |_| {}).unwrap();
        assert_eq!(std::fs::read(&output).unwrap(), bytes);
    }
}
