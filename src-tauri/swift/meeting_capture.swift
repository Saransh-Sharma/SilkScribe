import Foundation
import AVFoundation
import ScreenCaptureKit
import CoreAudio

private func response(_ object: [String: Any]) -> UnsafeMutablePointer<CChar>? {
    guard let data = try? JSONSerialization.data(withJSONObject: object), let text = String(data: data, encoding: .utf8) else { return strdup("{}") }
    return strdup(text)
}
@_cdecl("ss_capture_free") public func ssCaptureFree(_ pointer: UnsafeMutablePointer<CChar>?) { free(pointer) }

@available(macOS 13.0, *)
private final class MeetingCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    let queue = DispatchQueue(label: "app.silkscribe.meeting.audio")
    let engine = AVAudioEngine()
    var stream: SCStream?
    var micFile: AVAudioFile?
    var systemFile: AVAudioFile?
    var started = ProcessInfo.processInfo.systemUptime
    var pausedAt: Double?
    var pausedDuration = 0.0
    var error: String?
    var microphoneLevel = 0.0
    var systemLevel = 0.0
    var lastMicrophoneBuffer = ProcessInfo.processInfo.systemUptime
    var lastSystemBuffer = ProcessInfo.processInfo.systemUptime
    let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false)!
    var micFrames: AVAudioFramePosition = 0
    var systemFrames: AVAudioFramePosition = 0
    var finished = false
    var stopping = false
    let path: String
    init(path: String) { self.path = path }
    var elapsed: Double { max(0, (pausedAt ?? ProcessInfo.processInfo.systemUptime) - started - pausedDuration) }
    func start(system: Bool, device: AudioDeviceID?) async throws {
        guard await AVCaptureDevice.requestAccess(for: .audio) else { throw NSError(domain:"SilkScribe",code:1,userInfo:[NSLocalizedDescriptionKey:"Microphone access is required. Enable it in System Settings → Privacy & Security."]) }
        micFile = try AVAudioFile(forWriting: URL(fileURLWithPath: path + ".mic.wav"), settings: format.settings)
        systemFile = try AVAudioFile(forWriting: URL(fileURLWithPath: path + ".system.wav"), settings: format.settings)
        let input = engine.inputNode
        if var device = device, let unit = input.audioUnit {
            let status = AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &device, UInt32(MemoryLayout<AudioDeviceID>.size))
            if status != noErr { throw NSError(domain:NSOSStatusErrorDomain,code:Int(status),userInfo:[NSLocalizedDescriptionKey:"The selected microphone is unavailable."]) }
        }
        // Apple's voice processing input provides echo/noise suppression on supported devices.
        try input.setVoiceProcessingEnabled(true)
        let sourceFormat = input.outputFormat(forBus: 0)
        guard sourceFormat.sampleRate > 0, let converter = AVAudioConverter(from: sourceFormat, to: format) else { throw NSError(domain:"SilkScribe",code:2,userInfo:[NSLocalizedDescriptionKey:"The microphone format is unavailable."]) }
        input.installTap(onBus: 0, bufferSize: 2048, format: sourceFormat) { [weak self] buffer, when in
            guard let self = self else { return }
            let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * 16000 / sourceFormat.sampleRate)) + 32
            guard let output = AVAudioPCMBuffer(pcmFormat:self.format,frameCapacity:capacity) else { return }
            var supplied = false
            var conversionError: NSError?
            converter.convert(to:output,error:&conversionError) { _, status in
                if supplied { status.pointee = .noDataNow; return nil }
                supplied = true; status.pointee = .haveData; return buffer
            }
            let time = when.isHostTimeValid ? AVAudioTime.seconds(forHostTime:when.hostTime) + Double(buffer.frameLength)/sourceFormat.sampleRate : ProcessInfo.processInfo.systemUptime
            self.queue.async { if let e = conversionError { self.error = e.localizedDescription } else { self.write(output, microphone:true, time:time) } }
        }
        started = ProcessInfo.processInfo.systemUptime
        try engine.start()
        if system {
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
                guard let display = content.displays.first else { throw NSError(domain:"SilkScribe",code:3,userInfo:[NSLocalizedDescriptionKey:"No display is available for computer audio capture."]) }
                let config = SCStreamConfiguration()
                config.capturesAudio = true
                config.excludesCurrentProcessAudio = true
                config.sampleRate = 16000
                config.channelCount = 1
                config.width = 2; config.height = 2
                config.minimumFrameInterval = CMTime(value:1,timescale:1)
                let stream = SCStream(filter:SCContentFilter(display:display,excludingApplications:[],exceptingWindows:[]),configuration:config,delegate:self)
                self.stream = stream
                try stream.addStreamOutput(self,type:.audio,sampleHandlerQueue:queue)
                try await stream.startCapture()
            } catch {
                engine.inputNode.removeTap(onBus:0); engine.stop()
                throw error
            }
        }
    }
    func write(_ buffer: AVAudioPCMBuffer, microphone: Bool, time: Double) {
        guard !finished, pausedAt == nil, buffer.frameLength > 0, let data = buffer.floatChannelData?[0] else { return }
        let received = ProcessInfo.processInfo.systemUptime
        if microphone { lastMicrophoneBuffer = received } else { lastSystemBuffer = received }
        let level = sqrt((0..<Int(buffer.frameLength)).reduce(Float(0)) { $0 + data[$1]*data[$1] } / Float(buffer.frameLength))
        if microphone { microphoneLevel = Double(min(1,level*5)) } else { systemLevel = Double(min(1,level*5)) }
        let target = max(0, AVAudioFramePosition((time-started-pausedDuration)*16000) - AVAudioFramePosition(buffer.frameLength))
        let current = microphone ? micFrames : systemFrames
        do {
            let file = microphone ? micFile : systemFile
            var gap = max(0,target-current)
            while gap > 0 {
                let count = AVAudioFrameCount(min(gap,16000))
                let silence = AVAudioPCMBuffer(pcmFormat:format,frameCapacity:count)!
                silence.frameLength = count
                memset(silence.floatChannelData![0],0,Int(count)*MemoryLayout<Float>.size)
                try file?.write(from:silence); gap -= AVAudioFramePosition(count)
            }
            try file?.write(from:buffer)
            if microphone { micFrames = max(current,target)+AVAudioFramePosition(buffer.frameLength) } else { systemFrames = max(current,target)+AVAudioFramePosition(buffer.frameLength) }
        } catch {
            self.error = "Recording paused because audio could not be saved: " + error.localizedDescription
            pausedAt = ProcessInfo.processInfo.systemUptime
            microphoneLevel = 0; systemLevel = 0
        }
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, sampleBuffer.isValid, let description = sampleBuffer.formatDescription else { return }
        let inputFormat = AVAudioFormat(cmAudioFormatDescription:description)
        guard let input = AVAudioPCMBuffer(pcmFormat:inputFormat,frameCapacity:AVAudioFrameCount(sampleBuffer.numSamples)) else { return }
        input.frameLength = input.frameCapacity
        let status = CMSampleBufferCopyPCMDataIntoAudioBufferList(sampleBuffer,at:0,frameCount:Int32(sampleBuffer.numSamples),into:input.mutableAudioBufferList)
        guard status == noErr else { error = "Computer audio could not be decoded."; return }
        let pts = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
        let time = pts.isFinite ? pts + Double(input.frameLength)/inputFormat.sampleRate : ProcessInfo.processInfo.systemUptime
        if inputFormat == format { write(input,microphone:false,time:time); return }
        guard let converter = AVAudioConverter(from:inputFormat,to:format), let output = AVAudioPCMBuffer(pcmFormat:format,frameCapacity:input.frameCapacity*2) else { return }
        var used=false;var e:NSError?
        converter.convert(to:output,error:&e) { _,status in if used {status.pointee = .noDataNow;return nil};used=true;status.pointee = .haveData;return input }
        if let e=e {error=e.localizedDescription} else {write(output,microphone:false,time:time)}
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) { queue.async { self.error = "Computer audio stopped: " + error.localizedDescription } }
    func stop() async throws {
        if let stream=stream { do { try await stream.stopCapture() } catch { queue.sync { self.error=error.localizedDescription } } }
        engine.inputNode.removeTap(onBus:0); engine.stop()
        queue.sync { if pausedAt == nil { pausedAt=ProcessInfo.processInfo.systemUptime }; finished=true; micFile=nil;systemFile=nil }
        let mic = try AVAudioFile(forReading:URL(fileURLWithPath:path+".mic.wav"))
        let system = try AVAudioFile(forReading:URL(fileURLWithPath:path+".system.wav"))
        let output = try AVAudioFile(forWriting:URL(fileURLWithPath:path),settings:format.settings)
        while mic.framePosition < mic.length || system.framePosition < system.length {
            let a=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:16000)!
            let b=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:16000)!
            if mic.framePosition<mic.length {try mic.read(into:a)}
            if system.framePosition<system.length {try system.read(into:b)}
            let frames=max(a.frameLength,b.frameLength)
            let out=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:frames)!;out.frameLength=frames
            for i in 0..<Int(frames) {
                let x=i<Int(a.frameLength) ? a.floatChannelData![0][i] : 0
                let y=i<Int(b.frameLength) ? b.floatChannelData![0][i] : 0
                out.floatChannelData![0][i]=max(-1,min(1,x+y))
            }
            try output.write(from:out)
        }
    }
}
private var capture: AnyObject?
@_cdecl("ss_capture_call") public func ssCaptureCall(_ json: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>? {
    guard let data=String(cString:json).data(using:.utf8),let request=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] else {return response(["error":"Invalid capture request"])}
    guard #available(macOS 13.0, *) else {return response(["error":"Meeting recording requires macOS 13 or later."])}
    let operation=request["operation"] as? String ?? "status"
    if operation=="devices" {
        var size:UInt32=0
        var address=AudioObjectPropertyAddress(mSelector:kAudioHardwarePropertyDevices,mScope:kAudioObjectPropertyScopeGlobal,mElement:kAudioObjectPropertyElementMain)
        AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject),&address,0,nil,&size)
        var devices=[AudioDeviceID](repeating:0,count:Int(size)/MemoryLayout<AudioDeviceID>.size)
        AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject),&address,0,nil,&size,&devices)
        let results:[[String:String]]=devices.compactMap { device in
            var streams=AudioObjectPropertyAddress(mSelector:kAudioDevicePropertyStreams,mScope:kAudioDevicePropertyScopeInput,mElement:kAudioObjectPropertyElementMain)
            var bytes:UInt32=0; AudioObjectGetPropertyDataSize(device,&streams,0,nil,&bytes)
            guard bytes>0 else {return nil}
            var property=AudioObjectPropertyAddress(mSelector:kAudioObjectPropertyName,mScope:kAudioObjectPropertyScopeGlobal,mElement:kAudioObjectPropertyElementMain)
            var name:CFString="Microphone" as CFString;var length=UInt32(MemoryLayout<CFString>.size)
            AudioObjectGetPropertyData(device,&property,0,nil,&length,&name)
            return ["id":String(device),"name":name as String]
        }
        return response(["devices":results])
    }
    if operation=="start" {
        guard capture==nil,let path=request["path"] as? String else {return response(["error":"A recording is already active."])}
        let instance=MeetingCapture(path:path);capture=instance
        let semaphore=DispatchSemaphore(value:0);var failure:String?
        Task { do {try await instance.start(system:request["system"] as? Bool ?? true,device:(request["device"] as? String).flatMap(UInt32.init))} catch {failure=error.localizedDescription};semaphore.signal() }
        semaphore.wait()
        if let failure=failure {capture=nil;return response(["error":failure])}
        return response(["ok":true])
    }
    guard let instance=capture as? MeetingCapture else {return response(["seconds":0,"paused":false])}
    if operation=="pause" { instance.queue.sync {if instance.pausedAt==nil {instance.pausedAt=ProcessInfo.processInfo.systemUptime}} }
    if operation=="resume" { instance.queue.sync {if let time=instance.pausedAt {
        let now = ProcessInfo.processInfo.systemUptime
        instance.pausedDuration += now-time;instance.pausedAt=nil
        instance.lastMicrophoneBuffer=now;instance.lastSystemBuffer=now;instance.error=nil
    }} }
    if operation=="stop" {
        let semaphore=DispatchSemaphore(value:0);var failure:String?
        Task { do {try await instance.stop()} catch {failure=error.localizedDescription};semaphore.signal() };semaphore.wait();capture=nil
        if let failure=failure {return response(["error":failure])}
        return response(["ok":true])
    }
    return instance.queue.sync {
        let now = ProcessInfo.processInfo.systemUptime
        let paused = instance.pausedAt != nil
        let microphoneStalled = !paused && now-instance.lastMicrophoneBuffer > 3
        let microphoneLevel = paused || microphoneStalled ? 0 : instance.microphoneLevel
        let systemLevel = paused || now-instance.lastSystemBuffer > 3 ? 0 : instance.systemLevel
        let error = instance.error ?? (microphoneStalled ? "The microphone stopped delivering audio. Check the selected input, then pause and resume or save the recording." : nil)
        return response(["seconds":instance.elapsed,"paused":paused,"microphone_level":microphoneLevel,"system_level":systemLevel,"error":error as Any? ?? NSNull()])
    }
}
