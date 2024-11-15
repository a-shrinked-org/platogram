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

  const handleChunkedDownload = async (output) => {
    if (output.data && output.data.audio_url) {
      try {
        setDownloadProgress(0);
        addDebugLog(`Starting chunked download from: ${output.data.audio_url}`);

        const chunks = [];
        let start = 0;
        let end = CHUNK_SIZE - 1;
        let contentLength = 0;

        while (true) {
          const downloadUrl = `/api/download-audio?url=${encodeURIComponent(output.data.audio_url)}&title=${encodeURIComponent(output.data.title || 'audio')}&start=${start}&end=${end}&useChunks=true`;

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

        const blob = new Blob(chunks, { type: output.data.audio_url.includes('webm') ? 'audio/webm' : 'audio/mp4' });
        const blobUrl = URL.createObjectURL(blob);

        addDebugLog('Creating download link');
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${output.data.title || 'audio'}.${output.data.audio_url.includes('webm') ? 'webm' : 'm4a'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);

        setDownloadProgress(null);
        addDebugLog('Download process completed');
      } catch (err) {
        const errorMessage = `An error occurred while downloading the audio: ${err.message}`;
        setError(errorMessage);
        addDebugLog(`Error: ${errorMessage}`);
        setDownloadProgress(null);
      }
    } else {
      setError('No audio URL found in the response');
      addDebugLog('Error: No audio URL found in the response');
    }
  };

  const handleDirectDownload = async (output) => {
    if (output.data && output.data.audio_url) {
      try {
        setDownloadProgress(0);
        addDebugLog(`Starting direct download from: ${output.data.audio_url}`);

        const downloadUrl = `/api/download-audio?url=${encodeURIComponent(output.data.audio_url)}&title=${encodeURIComponent(output.data.title || 'audio')}&useChunks=false`;

        addDebugLog('Initiating direct download');
        const response = await fetch(downloadUrl);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        addDebugLog('Creating download link');
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${output.data.title || 'audio'}.${output.data.audio_url.includes('webm') ? 'webm' : 'm4a'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);

        setDownloadProgress(null);
        addDebugLog('Direct download completed');
      } catch (err) {
        const errorMessage = `An error occurred while downloading the audio: ${err.message}`;
        setError(errorMessage);
        addDebugLog(`Error: ${errorMessage}`);
        setDownloadProgress(null);
      }
    } else {
      setError('No audio URL found in the response');
      addDebugLog('Error: No audio URL found in the response');
    }
  };

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
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          disabled={isLoading}
        >
          {isLoading ? 'Processing...' : 'Process'}
        </button>
      </form>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
          <p>{error}</p>
        </div>
      )}

      {downloadProgress !== null && (
        <div className="mt-4">
          <p>Downloading: {downloadProgress}%</p>
          <div className="w-full bg-gray-200 rounded">
            <div
              className="bg-blue-600 rounded h-2 transition-all duration-300"
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
            <div key={index} className="mt-4">
              <h3 className="text-lg font-semibold mb-2">{output.data?.title || `Output ${index + 1}`}</h3>
              {output.data && output.data.audio_url && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDirectDownload(output)}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                    disabled={downloadProgress !== null}
                  >
                    {downloadProgress !== null ? 'Downloading...' : 'Direct Download'}
                  </button>
                  <button
                    onClick={() => handleChunkedDownload(output)}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    disabled={downloadProgress !== null}
                  >
                    {downloadProgress !== null ? 'Downloading...' : 'Chunked Download'}
                  </button>
                </div>
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