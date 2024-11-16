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

  const handleDirectYTDLDownload = async () => {
    try {
      setDownloadProgress(0);
      addDebugLog(`Starting direct YTDL download for: ${youtubeUrl}`);

      // Call the download-audio endpoint with ytdl option
      const response = await fetch(`/api/download-audio?url=${encodeURIComponent(youtubeUrl)}&method=ytdl`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Create blob from the response
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audio.mp3`;  // YTDL will convert to MP3
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setDownloadProgress(100);
      addDebugLog('YTDL Download completed successfully');
    } catch (err) {
      const errorMessage = `An error occurred while downloading with YTDL: ${err.message}`;
      setError(errorMessage);
      addDebugLog(`Error: ${errorMessage}`);
    } finally {
      setDownloadProgress(null);
    }
  };

  const handleSieveDownload = async (output) => {
    if (output.data && output.data.audio_url) {
      try {
        setDownloadProgress(0);
        addDebugLog(`Starting Sieve download from: ${output.data.audio_url}`);

        const downloadUrl = `/api/download-audio?url=${encodeURIComponent(output.data.audio_url)}&title=${encodeURIComponent(output.data.title || 'audio')}&method=sieve`;

        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${output.data.title || 'audio'}.${output.data.ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        setDownloadProgress(100);
        addDebugLog('Sieve Download completed successfully');
      } catch (err) {
        const errorMessage = `An error occurred while downloading: ${err.message}`;
        setError(errorMessage);
        addDebugLog(`Error: ${errorMessage}`);
      } finally {
        setDownloadProgress(null);
      }
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
        <div className="flex gap-2 mt-2">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            disabled={isLoading || !youtubeUrl}
          >
            {isLoading ? 'Processing...' : 'Process with Sieve'}
          </button>
          <button
            type="button"
            onClick={handleDirectYTDLDownload}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            disabled={isLoading || !youtubeUrl || downloadProgress !== null}
          >
            {downloadProgress !== null ? 'Downloading...' : 'Direct YTDL Download'}
          </button>
        </div>
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
          <h2 className="text-xl font-semibold mb-2">Sieve Result:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
          {result.map((output, index) => (
            <div key={index} className="mt-4">
              <h3 className="text-lg font-semibold mb-2">{output.data?.title || `Output ${index + 1}`}</h3>
              {output.data && output.data.audio_url && (
                <button
                  onClick={() => handleSieveDownload(output)}
                  className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
                  disabled={downloadProgress !== null}
                >
                  {downloadProgress !== null ? 'Downloading...' : 'Download with Sieve'}
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