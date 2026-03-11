use std::{
    io::Error,
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    Device, Sample, SizedSample,
};

use crate::audio_toolkit::{
    audio::{AudioVisualiser, FrameResampler},
    constants,
    vad::{self, VadFrame},
    VoiceActivityDetector,
};

enum Cmd {
    Start,
    Stop(mpsc::Sender<Vec<f32>>),
    Shutdown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ResolvedSampleFormat {
    I8,
    I16,
    I24,
    I32,
    I64,
    U8,
    U16,
    U32,
    U64,
    F32,
    F64,
}

impl ResolvedSampleFormat {
    fn label(self) -> &'static str {
        match self {
            Self::I8 => "i8",
            Self::I16 => "i16",
            Self::I24 => "i24",
            Self::I32 => "i32",
            Self::I64 => "i64",
            Self::U8 => "u8",
            Self::U16 => "u16",
            Self::U32 => "u32",
            Self::U64 => "u64",
            Self::F32 => "f32",
            Self::F64 => "f64",
        }
    }
}

fn sample_format_label(sample_format: cpal::SampleFormat) -> &'static str {
    match sample_format {
        cpal::SampleFormat::I8 => "i8",
        cpal::SampleFormat::I16 => "i16",
        cpal::SampleFormat::I24 => "i24",
        cpal::SampleFormat::I32 => "i32",
        cpal::SampleFormat::I64 => "i64",
        cpal::SampleFormat::U8 => "u8",
        cpal::SampleFormat::U16 => "u16",
        cpal::SampleFormat::U32 => "u32",
        cpal::SampleFormat::U64 => "u64",
        cpal::SampleFormat::F32 => "f32",
        cpal::SampleFormat::F64 => "f64",
        _ => "unknown",
    }
}

fn resolve_supported_sample_format(
    sample_format: cpal::SampleFormat,
) -> Result<ResolvedSampleFormat, String> {
    resolve_supported_sample_format_name(sample_format_label(sample_format))
}

fn resolve_supported_sample_format_name(format_name: &str) -> Result<ResolvedSampleFormat, String> {
    match format_name {
        "i8" => Ok(ResolvedSampleFormat::I8),
        "i16" => Ok(ResolvedSampleFormat::I16),
        "i24" => Ok(ResolvedSampleFormat::I24),
        "i32" => Ok(ResolvedSampleFormat::I32),
        "i64" => Ok(ResolvedSampleFormat::I64),
        "u8" => Ok(ResolvedSampleFormat::U8),
        "u16" => Ok(ResolvedSampleFormat::U16),
        "u32" => Ok(ResolvedSampleFormat::U32),
        "u64" => Ok(ResolvedSampleFormat::U64),
        "f32" => Ok(ResolvedSampleFormat::F32),
        "f64" => Ok(ResolvedSampleFormat::F64),
        _ => Err(format!("unsupported sample format: {format_name}")),
    }
}

pub struct AudioRecorder {
    device: Option<Device>,
    cmd_tx: Option<mpsc::Sender<Cmd>>,
    worker_handle: Option<std::thread::JoinHandle<()>>,
    vad: Option<Arc<Mutex<Box<dyn vad::VoiceActivityDetector>>>>,
    level_cb: Option<Arc<dyn Fn(Vec<f32>) + Send + Sync + 'static>>,
}

impl AudioRecorder {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(AudioRecorder {
            device: None,
            cmd_tx: None,
            worker_handle: None,
            vad: None,
            level_cb: None,
        })
    }

    pub fn with_vad(mut self, vad: Box<dyn VoiceActivityDetector>) -> Self {
        self.vad = Some(Arc::new(Mutex::new(vad)));
        self
    }

    pub fn with_level_callback<F>(mut self, cb: F) -> Self
    where
        F: Fn(Vec<f32>) + Send + Sync + 'static,
    {
        self.level_cb = Some(Arc::new(cb));
        self
    }

    pub fn open(&mut self, device: Option<Device>) -> Result<(), Box<dyn std::error::Error>> {
        if self.worker_handle.is_some() {
            return Ok(()); // already open
        }

        let (sample_tx, sample_rx) = mpsc::channel::<Vec<f32>>();
        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let (init_tx, init_rx) = mpsc::channel::<Result<(), String>>();

        let host = crate::audio_toolkit::get_cpal_host();
        let device = match device {
            Some(dev) => dev,
            None => host
                .default_input_device()
                .ok_or_else(|| Error::new(std::io::ErrorKind::NotFound, "No input device found"))?,
        };

        let device_name = device
            .name()
            .unwrap_or_else(|_| "<unavailable>".to_string());
        let thread_device = device.clone();
        let vad = self.vad.clone();
        let level_cb = self.level_cb.clone();

        let worker = std::thread::spawn(move || {
            let init_result = (|| -> Result<(cpal::Stream, u32), String> {
                let config = AudioRecorder::get_preferred_config(&thread_device).map_err(|e| {
                    format!(
                        "Failed to initialize recorder (stage=config, device={device_name}): {e}"
                    )
                })?;

                let sample_rate = config.sample_rate().0;
                let channels = config.channels() as usize;
                let sample_format = resolve_supported_sample_format(config.sample_format()).map_err(
                    |e| {
                        format!(
                            "Failed to initialize recorder (stage=format, device={device_name}, sample_rate={sample_rate}, sample_format={}): {e}",
                            sample_format_label(config.sample_format())
                        )
                    },
                )?;

                log::info!(
                    "Using device: {}\nSample rate: {}\nChannels: {}\nFormat: {}",
                    device_name,
                    sample_rate,
                    channels,
                    sample_format.label()
                );

                let stream = AudioRecorder::build_stream_for_format(
                    &thread_device,
                    &config,
                    sample_tx,
                    channels,
                    sample_format,
                )
                .map_err(|e| {
                    format!(
                        "Failed to initialize recorder (stage=build_stream, device={device_name}, sample_rate={sample_rate}, sample_format={}): {e}",
                        sample_format.label()
                    )
                })?;

                stream.play().map_err(|e| {
                    format!(
                        "Failed to initialize recorder (stage=play, device={device_name}, sample_rate={sample_rate}, sample_format={}): {e}",
                        sample_format.label()
                    )
                })?;

                Ok((stream, sample_rate))
            })();

            match init_result {
                Ok((stream, sample_rate)) => {
                    let _ = init_tx.send(Ok(()));
                    run_consumer(sample_rate, vad, sample_rx, cmd_rx, level_cb);
                    drop(stream);
                }
                Err(error) => {
                    let _ = init_tx.send(Err(error));
                }
            }
        });

        let worker = match Self::wait_for_worker_init(init_rx, worker) {
            Ok(worker) => worker,
            Err(error) => {
                return Err(Box::new(Error::new(std::io::ErrorKind::Other, error)));
            }
        };

        self.device = Some(device);
        self.cmd_tx = Some(cmd_tx);
        self.worker_handle = Some(worker);

        Ok(())
    }

    pub fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(tx) = &self.cmd_tx {
            tx.send(Cmd::Start)?;
        }
        Ok(())
    }

    pub fn stop(&self) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
        let (resp_tx, resp_rx) = mpsc::channel();
        if let Some(tx) = &self.cmd_tx {
            tx.send(Cmd::Stop(resp_tx))?;
        }
        Ok(resp_rx.recv()?) // wait for the samples
    }

    pub fn close(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(tx) = self.cmd_tx.take() {
            let _ = tx.send(Cmd::Shutdown);
        }
        if let Some(h) = self.worker_handle.take() {
            let _ = h.join();
        }
        self.device = None;
        Ok(())
    }

    fn build_stream<T>(
        device: &cpal::Device,
        config: &cpal::SupportedStreamConfig,
        sample_tx: mpsc::Sender<Vec<f32>>,
        channels: usize,
    ) -> Result<cpal::Stream, cpal::BuildStreamError>
    where
        T: Sample + SizedSample + Send + 'static,
        f32: cpal::FromSample<T>,
    {
        let mut output_buffer = Vec::new();

        let stream_cb = move |data: &[T], _: &cpal::InputCallbackInfo| {
            output_buffer.clear();

            if channels == 1 {
                // Direct conversion without intermediate Vec
                output_buffer.extend(data.iter().map(|&sample| sample.to_sample::<f32>()));
            } else {
                // Convert to mono directly
                let frame_count = data.len() / channels;
                output_buffer.reserve(frame_count);

                for frame in data.chunks_exact(channels) {
                    let mono_sample = frame
                        .iter()
                        .map(|&sample| sample.to_sample::<f32>())
                        .sum::<f32>()
                        / channels as f32;
                    output_buffer.push(mono_sample);
                }
            }

            if sample_tx.send(output_buffer.clone()).is_err() {
                log::error!("Failed to send samples");
            }
        };

        device.build_input_stream(
            &config.clone().into(),
            stream_cb,
            |err| log::error!("Stream error: {}", err),
            None,
        )
    }

    fn build_stream_for_format(
        device: &cpal::Device,
        config: &cpal::SupportedStreamConfig,
        sample_tx: mpsc::Sender<Vec<f32>>,
        channels: usize,
        sample_format: ResolvedSampleFormat,
    ) -> Result<cpal::Stream, String> {
        match sample_format {
            ResolvedSampleFormat::I8 => {
                Self::build_stream::<i8>(device, config, sample_tx, channels)
            }
            ResolvedSampleFormat::I16 => {
                Self::build_stream::<i16>(device, config, sample_tx, channels)
            }
            ResolvedSampleFormat::I24 => {
                Self::build_stream::<cpal::I24>(device, config, sample_tx, channels)
            }
            ResolvedSampleFormat::I32 => {
                Self::build_stream::<i32>(device, config, sample_tx, channels)
            }
            ResolvedSampleFormat::I64 => {
                Self::build_stream::<i64>(device, config, sample_tx, channels)
            }
            ResolvedSampleFormat::U8 => {
                Self::build_stream::<u8>(device, config, sample_tx, channels)
            }
            ResolvedSampleFormat::U16 => {
                Self::build_stream::<u16>(device, config, sample_tx, channels)
            }
            ResolvedSampleFormat::U32 => {
                Self::build_stream::<u32>(device, config, sample_tx, channels)
            }
            ResolvedSampleFormat::U64 => {
                Self::build_stream::<u64>(device, config, sample_tx, channels)
            }
            ResolvedSampleFormat::F32 => {
                Self::build_stream::<f32>(device, config, sample_tx, channels)
            }
            ResolvedSampleFormat::F64 => {
                Self::build_stream::<f64>(device, config, sample_tx, channels)
            }
        }
        .map_err(|e| e.to_string())
    }

    fn get_preferred_config(
        device: &cpal::Device,
    ) -> Result<cpal::SupportedStreamConfig, Box<dyn std::error::Error>> {
        let supported_configs = device.supported_input_configs()?;
        let mut best_config: Option<cpal::SupportedStreamConfigRange> = None;

        // Try to find a config that supports 16kHz, prioritizing better formats
        for config_range in supported_configs {
            if config_range.min_sample_rate().0 <= constants::WHISPER_SAMPLE_RATE
                && config_range.max_sample_rate().0 >= constants::WHISPER_SAMPLE_RATE
            {
                match best_config {
                    None => best_config = Some(config_range),
                    Some(ref current) => {
                        // Prioritize F32 > I16 > I32 > others
                        let score = |fmt: cpal::SampleFormat| match fmt {
                            cpal::SampleFormat::F32 => 4,
                            cpal::SampleFormat::I16 => 3,
                            cpal::SampleFormat::I32 => 2,
                            _ => 1,
                        };

                        if score(config_range.sample_format()) > score(current.sample_format()) {
                            best_config = Some(config_range);
                        }
                    }
                }
            }
        }

        if let Some(config) = best_config {
            return Ok(config.with_sample_rate(cpal::SampleRate(constants::WHISPER_SAMPLE_RATE)));
        }

        // If no config supports 16kHz, fall back to default
        Ok(device.default_input_config()?)
    }

    fn wait_for_worker_init(
        init_rx: mpsc::Receiver<Result<(), String>>,
        worker: std::thread::JoinHandle<()>,
    ) -> Result<std::thread::JoinHandle<()>, String> {
        match init_rx.recv() {
            Ok(Ok(())) => Ok(worker),
            Ok(Err(error)) => {
                let _ = worker.join();
                Err(error)
            }
            Err(_) => {
                let _ = worker.join();
                Err("Recorder initialization thread exited before reporting status".into())
            }
        }
    }
}

fn run_consumer(
    in_sample_rate: u32,
    vad: Option<Arc<Mutex<Box<dyn vad::VoiceActivityDetector>>>>,
    sample_rx: mpsc::Receiver<Vec<f32>>,
    cmd_rx: mpsc::Receiver<Cmd>,
    level_cb: Option<Arc<dyn Fn(Vec<f32>) + Send + Sync + 'static>>,
) {
    let mut frame_resampler = FrameResampler::new(
        in_sample_rate as usize,
        constants::WHISPER_SAMPLE_RATE as usize,
        Duration::from_millis(30),
    );

    let mut processed_samples = Vec::<f32>::new();
    let mut recording = false;

    // ---------- spectrum visualisation setup ---------------------------- //
    const BUCKETS: usize = 16;
    const WINDOW_SIZE: usize = 512;
    let mut visualizer = AudioVisualiser::new(
        in_sample_rate,
        WINDOW_SIZE,
        BUCKETS,
        400.0,  // vocal_min_hz
        4000.0, // vocal_max_hz
    );

    fn handle_frame(
        samples: &[f32],
        recording: bool,
        vad: &Option<Arc<Mutex<Box<dyn vad::VoiceActivityDetector>>>>,
        out_buf: &mut Vec<f32>,
    ) {
        if !recording {
            return;
        }

        if let Some(vad_arc) = vad {
            let mut det = vad_arc.lock().unwrap();
            match det.push_frame(samples).unwrap_or(VadFrame::Speech(samples)) {
                VadFrame::Speech(buf) => out_buf.extend_from_slice(buf),
                VadFrame::Noise => {}
            }
        } else {
            out_buf.extend_from_slice(samples);
        }
    }

    loop {
        let raw = match sample_rx.recv() {
            Ok(s) => s,
            Err(_) => break, // stream closed
        };

        // ---------- spectrum processing ---------------------------------- //
        if let Some(buckets) = visualizer.feed(&raw) {
            if let Some(cb) = &level_cb {
                cb(buckets);
            }
        }

        // ---------- existing pipeline ------------------------------------ //
        frame_resampler.push(&raw, &mut |frame: &[f32]| {
            handle_frame(frame, recording, &vad, &mut processed_samples)
        });

        // non-blocking check for a command
        while let Ok(cmd) = cmd_rx.try_recv() {
            match cmd {
                Cmd::Start => {
                    processed_samples.clear();
                    recording = true;
                    visualizer.reset(); // Reset visualization buffer
                    if let Some(v) = &vad {
                        v.lock().unwrap().reset();
                    }
                }
                Cmd::Stop(reply_tx) => {
                    recording = false;

                    // Drain any audio chunks that were captured but not yet consumed
                    while let Ok(remaining) = sample_rx.try_recv() {
                        frame_resampler.push(&remaining, &mut |frame: &[f32]| {
                            handle_frame(frame, true, &vad, &mut processed_samples)
                        });
                    }

                    frame_resampler.finish(&mut |frame: &[f32]| {
                        handle_frame(frame, true, &vad, &mut processed_samples)
                    });

                    let _ = reply_tx.send(std::mem::take(&mut processed_samples));
                }
                Cmd::Shutdown => return,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_extended_sample_formats() {
        assert_eq!(
            resolve_supported_sample_format(cpal::SampleFormat::F64).unwrap(),
            ResolvedSampleFormat::F64
        );
        assert_eq!(
            resolve_supported_sample_format(cpal::SampleFormat::U16).unwrap(),
            ResolvedSampleFormat::U16
        );
        assert_eq!(
            resolve_supported_sample_format(cpal::SampleFormat::U32).unwrap(),
            ResolvedSampleFormat::U32
        );
        assert_eq!(
            resolve_supported_sample_format(cpal::SampleFormat::I24).unwrap(),
            ResolvedSampleFormat::I24
        );
    }

    #[test]
    fn rejects_unknown_sample_format_names_without_panicking() {
        let error = resolve_supported_sample_format_name("future_format").unwrap_err();
        assert!(error.contains("future_format"));
    }

    #[test]
    fn worker_init_error_returns_err() {
        let (tx, rx) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            let _ = tx.send(Err("startup failed".to_string()));
        });

        assert!(AudioRecorder::wait_for_worker_init(rx, worker).is_err());
    }

    #[test]
    fn worker_init_success_returns_worker_handle() {
        let (tx, rx) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            let _ = tx.send(Ok(()));
        });

        let worker = AudioRecorder::wait_for_worker_init(rx, worker).unwrap();
        worker.join().unwrap();
    }
}
