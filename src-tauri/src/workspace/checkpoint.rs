use super::types::Segment;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize)]
pub struct Checkpoint {
    pub key: String,
    pub next: f64,
    pub segments: Vec<Segment>,
}
impl Checkpoint {
    pub fn load(path: &Path, key: &str, duration: f64) -> Option<Self> {
        let saved: Self = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
        (saved.key == key
            && saved.next.is_finite()
            && saved.next > 0.0
            && saved.next <= duration
            && saved.segments.iter().all(|s| {
                s.start.is_finite()
                    && s.end.is_finite()
                    && s.start >= 0.0
                    && s.end >= s.start
                    && s.end <= duration + 1.0
            }))
        .then_some(saved)
    }
    pub fn save(&self, path: &Path) -> Result<()> {
        let temp = path.with_extension("checkpoint-partial");
        let file = std::fs::File::create(&temp)?;
        serde_json::to_writer(&file, self)?;
        file.sync_all()?;
        std::fs::rename(temp, path)?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_resume_seeks_to_the_first_unprocessed_sample() {
        let dir = tempfile::tempdir().unwrap();
        let audio = dir.path().join("audio.wav");
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16000,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };
        let mut writer = hound::WavWriter::create(&audio, spec).unwrap();
        for index in 0..64000 {
            writer.write_sample(index as f32 / 64000.0).unwrap();
        }
        writer.finalize().unwrap();
        let path = dir.path().join("audio.native-checkpoint");
        Checkpoint {
            key: "native-v1".into(),
            next: 2.0,
            segments: vec![],
        }
        .save(&path)
        .unwrap();
        let saved = Checkpoint::load(&path, "native-v1", 4.0).unwrap();
        let mut reader = hound::WavReader::open(audio).unwrap();
        reader.seek((saved.next * 16000.0).round() as u32).unwrap();
        let tail: Vec<f32> = reader.samples().map(Result::unwrap).collect();
        assert_eq!(tail.len(), 32000);
        assert_eq!(tail[0], 0.5);
    }
    #[test]
    fn checkpoints_reject_changed_models_and_corruption() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("recording.checkpoint");
        Checkpoint {
            key: "revision-a".into(),
            next: 120.0,
            segments: vec![],
        }
        .save(&path)
        .unwrap();
        assert_eq!(
            Checkpoint::load(&path, "revision-a", 240.0).unwrap().next,
            120.0
        );
        assert!(Checkpoint::load(&path, "revision-b", 240.0).is_none());
        assert!(Checkpoint::load(&path, "revision-a", 60.0).is_none());
        std::fs::write(&path, b"incomplete").unwrap();
        assert!(Checkpoint::load(&path, "revision-a", 240.0).is_none());
    }
}
