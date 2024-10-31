import { useState, useRef } from 'react';
import { AudioLines, Plus, Trash2, Loader2, Upload, Youtube } from 'lucide-react';
import { upload } from '@vercel/blob/client';

export default function AudioMerger() {
  const [audioFiles, setAudioFiles] = useState([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [error, setError] = useState(null);
  const [debugLog, setDebugLog] = useState([]);
  const fileInputRef = useRef(null);

  // Moved addDebugLog to ensure it's globally accessible
  const addDebugLog = (message) => {
    setDebugLog(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
    console.log(message);
  };

  const uploadFile = async (file) => {
    try {
      // Request the upload token
      const tokenResponse = await fetch('/api/merge-audio', {
        method: 'POST',
        headers: {
          'x-vercel-blob-token-request': 'true',
        }
      });

      const responseText = await tokenResponse.text();
      addDebugLog(`Token Response: ${responseText}`);

      if (!tokenResponse.ok) {
        throw new Error(`Failed to retrieve token: ${responseText}`);
      }

      const { token } = JSON.parse(responseText);

      // Upload directly to Vercel Blob
      const blob = await upload(file.name, file, {
        access: 'public',
        token: token,
        handleUploadUrl: '/api/merge-audio',
      });

      return blob;
    } catch (error) {
      console.error('Upload error:', error);
      setError(`Failed to upload ${file.name}: ${error.message}`);
      throw error;
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

        const blob = await uploadFile(file);

        setAudioFiles(prev => [...prev, {
          type: 'local',
          url: blob.url,
          name: file.name,
        }]);

        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
      } catch (err) {
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleYouTubeProcess = async (e) => {
    e.preventDefault();
    setError(null);
    setIsProcessing(true);
    addDebugLog(`Processing YouTube URL: ${youtubeUrl}`);

    try {
      const response = await fetch('/api/process-youtube', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ youtubeUrl }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      const audioUrl = data[0]?.data?.audio_url;
      if (audioUrl) {
        setAudioFiles(prev => [...prev, {
          type: 'youtube',
          url: audioUrl,
          name: `YouTube Audio ${prev.length + 1}`,
        }]);
        setYoutubeUrl('');
        addDebugLog('Successfully added audio from YouTube');
      }
    } catch (err) {
      setError(err.message);
      addDebugLog(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const removeAudio = async (index) => {
    const file = audioFiles[index];
    try {
      if (file.type === 'local') {
        await fetch('/api/merge-audio', {
          method: 'DELETE',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ url: file.url })
        });
      }
      setAudioFiles(prev => prev.filter((_, i) => i !== index));
      addDebugLog(`Removed audio at index ${index}`);
    } catch (err) {
      setError(`Failed to remove file: ${err.message}`);
      addDebugLog(`Error removing file: ${err.message}`);
    }
  };

  const handleMerge = async () => {
    if (audioFiles.length < 2) {
      setError('At least two audio files are required for merging');
      return;
    }

    setIsMerging(true);
    setError(null);
    addDebugLog('Starting audio merge process');

    try {
      const response = await fetch('/api/merge-audio', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          audioUrls: audioFiles.map(file => file.url),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      const a = document.createElement('a');
      a.href = data.url;
      a.download = 'merged-audio.m4a';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      addDebugLog('Merge completed successfully');
    } catch (err) {
      setError(err.message);
      addDebugLog(`Error during merge: ${err.message}`);
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Audio Merger</h1>

        {/* YouTube URL Input */}
        <form onSubmit={handleYouTubeProcess} className="space-y-2">
          <div className="flex items-center space-x-2">
            <Youtube size={20} className="text-red-500" />
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="Enter YouTube URL"
              className="flex-1 p-2 border rounded"
              disabled={isProcessing}
            />
          </div>
          <button
            type="submit"
            disabled={isProcessing || !youtubeUrl}
            className="w-full bg-blue-500 text-white p-2 rounded flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {isProcessing ? (
              <><Loader2 className="animate-spin" size={20} /><span>Processing...</span></>
            ) : (
              <><Plus size={20} /><span>Add Audio from YouTube</span></>
            )}
          </button>
        </form>

        {/* File Upload */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Upload size={20} className="text-blue-500" />
            <span className="font-semibold">Upload Audio Files</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            accept="audio/*"
            multiple
            className="w-full"
          />
        </div>

        {/* Audio Files List */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Audio Files ({audioFiles.length})</h2>
          {audioFiles.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <div className="flex items-center space-x-2 flex-1">
                <AudioLines size={20} className={file.type === 'youtube' ? 'text-red-500' : 'text-blue-500'} />
                <span className="truncate">{file.name}</span>
              </div>
              {uploadProgress[file.name] !== undefined && uploadProgress[file.name] < 100 && (
                <div className="w-24 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${uploadProgress[file.name]}%` }}
                  />
                </div>
              )}
              <button
                onClick={() => removeAudio(index)}
                className="text-red-500 hover:text-red-700 ml-2"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ))}
        </div>

        {/* Merge Button */}
        <button
          onClick={handleMerge}
          disabled={isMerging || audioFiles.length < 2}
          className="w-full bg-green-500 text-white p-2 rounded flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {isMerging ? (
            <><Loader2 className="animate-spin" size={20} /><span>Merging...</span></>
          ) : (
            <><AudioLines size={20} /><span>Merge Audio Files</span></>
          )}
        </button>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* Debug Log */}
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Debug Log:</h3>
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto h-40 overflow-y-auto text-sm">
            {debugLog.join('\n')}
          </pre>
        </div>
      </div>
    </div>
  );
}