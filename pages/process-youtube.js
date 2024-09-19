import { useState } from 'react';
import axios from 'axios';

export default function YouTubeProcessor() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    try {
      const response = await axios.post('/api/process-youtube', { youtubeUrl });
      setResult(response.data);
    } catch (err) {
      setError('An error occurred while processing the YouTube URL');
      console.error(err);
    }
  };

  const handleDownload = () => {
    if (result && result.audio_url) {
      // Create a hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      // Set the iframe's source to the audio URL
      iframe.src = result.audio_url;

      // Remove the iframe after a short delay
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
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
        <button type="submit" className="mt-2 px-4 py-2 bg-blue-500 text-white rounded">
          Process
        </button>
      </form>
      {error && <p className="text-red-500">{error}</p>}
      {result && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Result:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
          <button
            onClick={handleDownload}
            className="mt-4 px-4 py-2 bg-green-500 text-white rounded"
          >
            Download Audio
          </button>
        </div>
      )}
    </div>
  );
}