import { useState } from 'react';
import axios from 'axios';

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

export default function YouTubeProcessor() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [debugLog, setDebugLog] = useState([]);

  const addDebugLog = (message) => {
    setDebugLog(prevLog => [...prevLog, `${new Date().toISOString()}: ${message}`]);
    console.log(message);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setIsLoading(true);
    setDebugLog([]);
    addDebugLog('Processing YouTube URL');
    try {
      const response = await axios.post('/api/process-youtube', { youtubeUrl });
      setResult(response.data);
      addDebugLog('YouTube URL processed successfully');
    } catch (err) {
      const errorMessage = `An error occurred while processing the YouTube URL: ${err.response?.data?.details || err.message}`;
      setError(errorMessage);
      addDebugLog(`Error: ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const audioContextRef = useRef(null);

  const detectSilence = async (audioBuffer) => {
    const channelData = audioBuffer.getChannelData(0); // Get the first channel
    const sampleRate = audioBuffer.sampleRate;
    const silenceSamples = SILENCE_DURATION * sampleRate;
    let silenceStart = null;

    for (let i = channelData.length - 1; i >= 0; i--) {
      const amplitude = Math.abs(channelData[i]);
      const db = 20 * Math.log10(amplitude);

      if (db > SILENCE_THRESHOLD) {
        // Found non-silent sample
        if (silenceStart !== null && (silenceStart - i) >= silenceSamples) {
          // Silence duration met, trim here
          return i + silenceSamples;
        }
        break;
      } else if (silenceStart === null) {
        silenceStart = i;
      }
    }

    return channelData.length; // No silence detected or not long enough
  };

  const trimSilence = async (audioBuffer) => {
    const trimPoint = await detectSilence(audioBuffer);
    if (trimPoint < audioBuffer.length) {
      const trimmedBuffer = audioContextRef.current.createBuffer(
        audioBuffer.numberOfChannels,
        trimPoint,
        audioBuffer.sampleRate
      );

      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        trimmedBuffer.copyToChannel(audioBuffer.getChannelData(channel).subarray(0, trimPoint), channel);
      }

      return trimmedBuffer;
    }
    return audioBuffer;
  };
  const handleDownload = async (output) => {
    if (output.data && output.data.audio_url) {
      try {
        setDownloadProgress(0);
        addDebugLog(`Starting chunked download from: ${output.data.audio_url}`);

        const chunks = [];
        let start = 0;
        let end = CHUNK_SIZE - 1;
        let contentLength = 0;

        while (true) {
          const downloadUrl = `/api/download-audio?url=${encodeURIComponent(output.data.audio_url)}&title=${encodeURIComponent(output.data.title || 'audio')}&start=${start}&end=${end}`;

          addDebugLog(`Downloading chunk: ${start}-${end}`);
          const response = await fetch(downloadUrl);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const chunk = await response.arrayBuffer();
          chunks.push(chunk);

          const rangeHeader = response.headers.get('Content-Range');
          if (rangeHeader) {
            contentLength = parseInt(rangeHeader.split('/')[1]);
          }

          const receivedLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
          const progress = contentLength ? Math.round((receivedLength / contentLength) * 100) : 0;
          setDownloadProgress(progress);
          addDebugLog(`Download progress: ${progress}%`);

          if (receivedLength >= contentLength) {
            addDebugLog('Download completed');
            break;
          }

          start = end + 1;
          end = start + CHUNK_SIZE - 1;
        }

        addDebugLog('Processing audio to remove silence');
        const completeBuffer = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0));
        let offset = 0;
        for (const chunk of chunks) {
          completeBuffer.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }

        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioContextRef.current.decodeAudioData(completeBuffer.buffer);
        const trimmedBuffer = await trimSilence(audioBuffer);

        addDebugLog('Silence removed, preparing file for download');

        // Convert AudioBuffer to WAV
        const wavBuffer = await audioBufferToWav(trimmedBuffer);
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        const blobUrl = URL.createObjectURL(blob);

        addDebugLog('Creating download link');
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${output.data.title || 'audio'}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);

        setDownloadProgress(null);
        addDebugLog('Download process completed');
      } catch (err) {
        const errorMessage = `An error occurred while processing the audio: ${err.message}`;
        setError(errorMessage);
        addDebugLog(`Error: ${errorMessage}`);
        setDownloadProgress(null);
      }
    } else {
      setError('No audio URL found in the response');
      addDebugLog('Error: No audio URL found in the response');
    }
  };

  function audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new ArrayBuffer(length);
    const view = new DataView(out);
    const channels = [];
    let sample,
        offset = 0;

    // write WAVE header
    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"

    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);  // avg. bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit (hardcoded in this demo)

    setUint32(0x61746164);                         // "data" - chunk
    setUint32(length - offset - 4);                // chunk length

    // write interleaved data
    for(let i = 0; i < buffer.numberOfChannels; i++)
      channels.push(buffer.getChannelData(i));

    while(offset < length) {
      for(let i = 0; i < numOfChan; i++) {             // interleave channels
        sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
        view.setInt16(offset * numOfChan * 2 + i * 2, sample, true); // write 16-bit sample
      }
      offset++                                     // next source sample
    }

    return out;

    function setUint16(data) {
      view.setUint16(offset, data, true);
      offset += 2;
    }

    function setUint32(data) {
      view.setUint32(offset, data, true);
      offset += 4;
    }
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">YouTube Audio Extractor</h1>
      <form onSubmit={handleSubmit} className="mb-4">
        <input
          type="text"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="Enter YouTube URL"
          className="w-full p-2 border rounded"
          required
        />
        <button
          type="submit"
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
          disabled={isLoading}
        >
          {isLoading ? 'Processing...' : 'Process'}
        </button>
      </form>
      {error && <p className="text-red-500">{error}</p>}
      {downloadProgress !== null && (
        <div className="mt-4">
          <p>Downloading: {downloadProgress}%</p>
          <div className="w-full bg-gray-200 rounded">
            <div
              className="bg-blue-600 rounded h-2"
              style={{ width: `${downloadProgress}%` }}
            ></div>
          </div>
        </div>
      )}
      {result && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Result:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
          {result.map((output, index) => (
            <div key={index}>
              <h3 className="text-lg font-semibold mt-4 mb-2">{output.name || `Output ${index + 1}`}</h3>
              {output.data && output.data.audio_url && (
                <button
                  onClick={() => handleDownload(output)}
                  className="px-4 py-2 bg-green-500 text-white rounded"
                  disabled={downloadProgress !== null}
                >
                  {downloadProgress !== null ? 'Downloading...' : 'Download Audio'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4">
        <h3 className="text-lg font-semibold mb-2">Debug Log:</h3>
        <pre className="bg-gray-100 p-4 rounded overflow-x-auto h-40 overflow-y-auto">
          {debugLog.join('\n')}
        </pre>
      </div>
    </div>
  );
}