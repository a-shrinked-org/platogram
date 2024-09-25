import { useState } from 'react';
import axios from 'axios';

export default function YouTubeProcessor() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setIsLoading(true);
    try {
      const response = await axios.post('/api/process-youtube', { youtubeUrl });
      setResult(response.data);
    } catch (err) {
      setError(`An error occurred while processing the YouTube URL: ${err.response?.data?.details || err.message}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (output) => {
    if (output.data && output.data.audio_url) {
      const downloadUrl = `/api/download-audio?url=${encodeURIComponent(output.data.audio_url)}&title=${encodeURIComponent(output.data.title || 'audio')}`;

      try {
        setDownloadProgress(0);
        const response = await fetch(downloadUrl);
        const reader = response.body.getReader();
        const contentLength = +response.headers.get('Content-Length');

        let receivedLength = 0;
        const chunks = [];

        while(true) {
          const {done, value} = await reader.read();

          if (done) {
            break;
          }

          chunks.push(value);
          receivedLength += value.length;
          setDownloadProgress(Math.round((receivedLength / contentLength) * 100));
        }

        const blob = new Blob(chunks, { type: 'audio/mp4' });
        const downloadUrl = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${output.data.title || 'audio'}.m4a`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

        setDownloadProgress(null);
      } catch (err) {
        setError(`An error occurred while downloading the audio: ${err.message}`);
        setDownloadProgress(null);
      }
    } else {
      setError('No audio URL found in the response');
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
    </div>
  );
}