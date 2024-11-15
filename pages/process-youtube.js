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

    const handleDirectDownload = async (output) => {
      if (output.data && output.data.audio_url) {
        try {
          setDownloadProgress(0);
          addDebugLog(`Starting direct browser download from: ${output.data.audio_url}`);

          // Create anchor element for direct download
          const link = document.createElement('a');
          link.href = output.data.audio_url;
          link.download = `${output.data.title || 'audio'}.${output.data.ext}`;
          link.target = '_blank';

          // Add custom headers
          const headers = new Headers({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/'
          });

          // Create fetch request
          const response = await fetch(output.data.audio_url, {
            headers: headers,
            mode: 'cors',
            credentials: 'omit'
          });

          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

          // Create blob from response
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);

          // Update link href to blob URL
          link.href = blobUrl;

          // Trigger download
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // Clean up
          setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

          setDownloadProgress(100);
          addDebugLog('Direct browser download completed');
        } catch (err) {
          const errorMessage = `An error occurred while downloading the audio: ${err.message}`;
          setError(errorMessage);
          addDebugLog(`Error: ${errorMessage}`);
        } finally {
          setDownloadProgress(null);
        }
      } else {
        setError('No audio URL found in the response');
        addDebugLog('Error: No audio URL found in the response');
      }
    };

    const handleChunkedDownload = async (output) => {
      if (!output.data?.audio_url) {
        setError('No audio URL found in the response');
        addDebugLog('Error: No audio URL found in the response');
        return;
      }

      try {
        setDownloadProgress(0);
        addDebugLog(`Starting chunked browser download from: ${output.data.audio_url}`);

        // Get file size with HEAD request
        const response = await fetch(output.data.audio_url, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/'
          }
        });

        const contentLength = Number(response.headers.get('content-length'));
        const chunks = [];
        let downloaded = 0;

        for (let start = 0; start < contentLength; start += CHUNK_SIZE) {
          const end = Math.min(start + CHUNK_SIZE - 1, contentLength - 1);
          addDebugLog(`Downloading chunk: ${start}-${end}`);

          const chunkResponse = await fetch(output.data.audio_url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
              'Accept': '*/*',
              'Origin': 'https://www.youtube.com',
              'Referer': 'https://www.youtube.com/',
              'Range': `bytes=${start}-${end}`
            }
          });

          if (!chunkResponse.ok) throw new Error(`HTTP error! status: ${chunkResponse.status}`);

          const chunk = await chunkResponse.arrayBuffer();
          chunks.push(chunk);
          downloaded += chunk.byteLength;
          setDownloadProgress(Math.round((downloaded / contentLength) * 100));
        }

        // Combine chunks and download
        const blob = new Blob(chunks, { type: output.data.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${output.data.title || 'audio'}.${output.data.ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        addDebugLog('Download completed successfully');
      } catch (err) {
        const errorMessage = `An error occurred while downloading the audio: ${err.message}`;
        setError(errorMessage);
        addDebugLog(`Error: ${errorMessage}`);
      } finally {
        setDownloadProgress(null);
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
                    <a
                      href={output.data.audio_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
                    >
                      Open in Browser
                    </a>
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