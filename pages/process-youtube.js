import { useState } from 'react';
import axios from 'axios';

export default function YouTubeProcessor() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      const response = await axios.post('/api/process-youtube', { youtubeUrl });
      setResult(response.data);
    } catch (err) {
      setError('An error occurred while processing the YouTube URL');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (result && result.audio_url) {
      window.open(result.audio_url, '_blank');
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
      {result && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Result:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
          {result.audio_url && (
            <button
              onClick={handleDownload}
              className="mt-4 px-4 py-2 bg-green-500 text-white rounded"
            >
              Download Audio
            </button>
          )}
        </div>
      )}
    </div>
  );
}