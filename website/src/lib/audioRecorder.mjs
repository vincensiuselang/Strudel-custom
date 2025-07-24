import { encode } from 'wav-encoder';
import { getAudioContext, getDestinationGain, panic } from '@strudel/superdough';
import { uploadSamplesToDB, userSamplesDBConfig } from '../repl/idbutils.mjs';

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let audioContext;
let destinationNode;

export const saveRecording = async (audioBuffer, filename, format) => {
  try {
    let encodedBlob;
    let fileExtension;

    if (format === 'mp3') {
      encodedBlob = encodeAudioBufferToMp3(audioBuffer);
      fileExtension = '.mp3';
    } else {
      // Default to WAV
      const wavBuffer = await encode({
        sampleRate: audioBuffer.sampleRate,
        channelData: Array.from({ length: audioBuffer.numberOfChannels }, (_, i) => audioBuffer.getChannelData(i)),
      });
      encodedBlob = new Blob([wavBuffer], { type: 'audio/wav' });
      fileExtension = '.wav';
    }

    const title = filename.endsWith(fileExtension) ? filename : `${filename}${fileExtension}`;

    // Create a download link and click it programmatically
    const url = URL.createObjectURL(encodedBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = title;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    // Save to IndexedDB as well
    await uploadSamplesToDB(userSamplesDBConfig, [encodedBlob], () => {
      if (onRecordingCompleteCallback) {
        onRecordingCompleteCallback();
      }
    });
    console.log(`Recording saved to IndexedDB and downloaded as: ${title} (Format: ${format})`);
  } catch (error) {
    console.error('Error saving recording to IndexedDB or downloading:', error);
  }
};

function encodeAudioBufferToMp3(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const kbps = 128; // MP3 bitrate

  const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
  const mp3Data = [];

  const samplesLeft = audioBuffer.getChannelData(0);
  const samplesRight = channels > 1 ? audioBuffer.getChannelData(1) : null;

  // Convert Float32 samples to Int16
  const convertBuffer = (array) => {
    const data = new Int16Array(array.length);
    for (let i = 0; i < array.length; i++) {
      data[i] = Math.max(-1, Math.min(1, array[i])) * 32767;
    }
    return data;
  };

  const dataLeft = convertBuffer(samplesLeft);
  const dataRight = samplesRight ? convertBuffer(samplesRight) : null;

  const sampleBlockSize = 1152;
  for (let i = 0; i < dataLeft.length; i += sampleBlockSize) {
    const leftChunk = dataLeft.subarray(i, i + sampleBlockSize);
    let rightChunk = null;
    if (dataRight) {
      rightChunk = dataRight.subarray(i, i + sampleBlockSize);
    }

    let mp3buf;
    if (channels > 1) {
      mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    } else {
      mp3buf = mp3encoder.encodeBuffer(leftChunk);
    }

    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }
  }

  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(new Uint8Array(mp3buf));
  }

  return new Blob(mp3Data, { type: 'audio/mp3' });
}

export const startRecording = async () => {
  if (isRecording) {
    console.warn('Already recording.');
    return;
  }

  audioContext = getAudioContext();
  if (!audioContext) {
    console.error('AudioContext not available.');
    return;
  }

  // Create a MediaStreamDestinationNode to capture the audio
  destinationNode = audioContext.createMediaStreamDestination();

  // Ensure audio output is initialized before connecting
  initializeAudioOutput();
  // Connect the main audio output to the destinationNode
  getDestinationGain().connect(destinationNode);

  mediaRecorder = new MediaRecorder(destinationNode.stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };

  mediaRecorder.start();
  isRecording = true;
  console.log('Recording started.');
};

let onRecordingCompleteCallback = null;
let onStopPlaybackCallback = null;

export const setOnRecordingCompleteCallback = (callback) => {
  onRecordingCompleteCallback = callback;
};

export const setOnStopPlaybackCallback = (callback) => {
  onStopPlaybackCallback = callback;
};

export const stopRecording = (onStopCallback) => {
  if (!isRecording) {
    console.warn('Not recording.');
    return;
  }
  mediaRecorder.onstop = async (event) => {
    console.log('mediaRecorder.onstop triggered.', event);
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    console.log('audioBlob created:', audioBlob.size, audioBlob.type);

    if (audioBlob.size === 0) {
      console.error('Audio blob is empty. No audio data captured. This might happen if recording was too short or no audio was playing.');
      // Disconnect the destinationNode from the audio graph
      destinationNode.disconnect();
      // Clear chunks for next recording attempt
      audioChunks = [];
      return;
    }

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      console.log('arrayBuffer created.');
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      console.log('audioBuffer created.', audioBuffer.sampleRate, audioBuffer.numberOfChannels);

      // Pass audioBuffer directly to onStopCallback
      if (onStopCallback) {
        console.log('Calling onStopCallback with audioBuffer.');
        onStopCallback(audioBuffer);
      }

    } catch (error) {
      console.error('Error during WAV encoding or processing:', error);
      // Ensure disconnection even on error
      destinationNode.disconnect();
      audioChunks = []; // Clear chunks on error too
    }
  };
  mediaRecorder.stop();
  isRecording = false;
  panic();
  if (onStopPlaybackCallback) {
    onStopPlaybackCallback();
  }
  console.log('Recording stopping...');
};

export const getIsRecording = () => isRecording;
