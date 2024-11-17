import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

export default function YouTubeProcessor() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [debugLog, setDebugLog] = useState([]);
  const [progress, setProgress] = useState(0);
  const pollInterval = useRef();

    const addDebugLog = (message) => {
      setDebugLog(prevLog => [...prevLog, `${new Date().toISOString()}: ${message}`]);
      console.log(message);
    };

    useEffect(() => {
      return () => {
        if (pollInterval.current) {
          clearInterval(pollInterval.current);
        }
      };
    }, []);

    const checkStatus = async (id) => {
      try {
        const response = await axios.get(`/api/process-youtube?jobId=${id}`);
        addDebugLog(`Received status response: ${JSON.stringify(response.data)}`);

        if (response.data.status === 'finished') {
          clearInterval(pollInterval.current);
          setIsLoading(false);
          if (response.data.result) {
            addDebugLog(`Processing completed. Result URL: ${response.data.result.url}`);
            setResult(response.data.result);
          } else {
            addDebugLog('Processing completed but no result URL found');
            setError('No download URL available');
          }
        } else if (response.data.status === 'failed') {
          clearInterval(pollInterval.current);
          setIsLoading(false);
          setError('Processing failed');
          addDebugLog('Processing failed');
        } else {
          setProgress(response.data.progress || 0);
          addDebugLog(`Processing status: ${response.data.status}`);
        }
      } catch (error) {
        clearInterval(pollInterval.current);
        setIsLoading(false);
        setError('Failed to check status');
        addDebugLog(`Error checking status: ${error.message}`);
      }
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      setError(null);
      setResult(null);
      setIsLoading(true);
      setProgress(0);
      setDebugLog([]);
      addDebugLog('Submitting YouTube URL');

      try {
        const response = await axios.post('/api/process-youtube', { youtubeUrl });
        setJobId(response.data.jobId);
        addDebugLog(`Job submitted with ID: ${response.data.jobId}`);

        // Start polling for status
        if (pollInterval.current) {
          clearInterval(pollInterval.current);
        }

        pollInterval.current = setInterval(() => {
          checkStatus(response.data.jobId);
        }, 2000);

      } catch (err) {
        setError(`Failed to submit job: ${err.message}`);
        addDebugLog(`Error: ${err.message}`);
        setIsLoading(false);
      }
    };

    const handleDownload = (url) => {
      if (url) {
        addDebugLog(`Initiating download from URL: ${url}`);
        window.open(url, '_blank');
      } else {
        setError('Download URL not available');
        addDebugLog('Error: Download URL not available');
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

        {isLoading && (
          <div className="mt-4">
            <p>Processing: {progress}%</p>
            <div className="w-full bg-gray-200 rounded">
              <div
                className="bg-blue-600 rounded h-2 transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {result && (
          <div className="mt-4">
            <p className="mb-2">Processing completed!</p>
            {result.url ? (
              <button
                onClick={() => handleDownload(result.url)}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Download Audio
              </button>
            ) : (
              <p className="text-red-600">No download URL available</p>
            )}
          </div>
        )}

        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Debug Log:</h3>
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto h-40 overflow-y-auto">
            {debugLog.join('\n')}
          </pre>
        </div>

        {/* Debug result object */}
        {result && (
          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-2">Debug Result:</h3>
            <pre className="bg-gray-100 p-4 rounded overflow-x-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }