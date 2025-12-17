/**
 * WAV 录音工具 - 使用 MediaRecorder 录制后转换为 WAV
 * 阿里云 ASR 需要: 16kHz, 单声道, 16bit PCM WAV
 */

export class WavRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording = false;

  async start(): Promise<void> {
    if (this.isRecording) return;

    try {
      // 获取麦克风权限
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // 创建 MediaRecorder
      const options: MediaRecorderOptions = {
        mimeType: 'audio/webm;codecs=opus',
      };
      
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
      this.audioChunks = [];
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.start();
      this.isRecording = true;
    } catch (err) {
      this.cleanup();
      throw err;
    }
  }

  stop(): Blob | null {
    if (!this.isRecording || !this.mediaRecorder) return null;
    
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = async () => {
        if (this.audioChunks.length === 0) {
          this.cleanup();
          resolve(null);
          return;
        }

        // 创建 webm blob
        const webmBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        // 使用 AudioContext 转换为 WAV
        const wavBlob = await this.convertToWav(webmBlob);
        
        this.cleanup();
        resolve(wavBlob);
      };

      this.isRecording = false;
      this.mediaRecorder.stop();
    }) as any;
  }

  cancel(): void {
    this.isRecording = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.mediaRecorder) {
      this.mediaRecorder = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.audioChunks = [];
  }

  private async convertToWav(webmBlob: Blob): Promise<Blob> {
    try {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const arrayBuffer = await webmBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // 获取单声道数据
      const channelData = audioBuffer.getChannelData(0);
      
      // 编码为 WAV
      const wavBlob = this.encodeWAV(channelData, 16000);
      
      audioContext.close();
      return wavBlob;
    } catch (err) {
      console.error('WAV转换失败:', err);
      // 如果转换失败，返回原始 webm（后端会处理）
      return webmBlob;
    }
  }

  private encodeWAV(samples: Float32Array, sampleRate: number): Blob {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataLength = samples.length * bytesPerSample;
    
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    
    // WAV Header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    this.writeString(view, 8, 'WAVE');
    
    // fmt chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // data chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);
    
    // PCM data
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(offset, val, true);
      offset += 2;
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}
