import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const LocalAudioExtractor = () => {
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState('');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState('');

  const loadFFmpeg = async () => {
    const { createFFmpeg } = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.6/dist/esm/index.js');
    return createFFmpeg({ 
      log: true,
      progress: ({ ratio }) => {
        setProgress(Math.round(ratio * 100));
      },
    });
  };

  const extractAudio = async (file) => {
    try {
      setStatus('loading');
      const ffmpeg = await loadFFmpeg();
      await ffmpeg.load();
      
      setStatus('processing');
      setProgress(0);

      // Write the input file to FFmpeg's virtual filesystem
      const inputFileName = 'input' + file.name.substring(file.name.lastIndexOf('.'));
      ffmpeg.FS('writeFile', inputFileName, new Uint8Array(await file.arrayBuffer()));

      // Prepare FFmpeg command
      const outputFileName = 'output.mp3';
      const ffmpegArgs = [
        '-i', inputFileName,
        ...(startTime ? ['-ss', startTime] : []),
        ...(duration ? ['-t', duration] : []),
        '-vn',  // Remove video stream
        '-acodec', 'libmp3lame',  // Use MP3 codec
        '-q:a', '2',  // Set quality (0-9, lower is better)
        outputFileName
      ];

      // Run FFmpeg command
      await ffmpeg.run(...ffmpegArgs);

      // Read the result
      const data = ffmpeg.FS('readFile', outputFileName);
      const blob = new Blob([data.buffer], { type: 'audio/mp3' });
      
      // Clean up files from virtual filesystem
      ffmpeg.FS('unlink', inputFileName);
      ffmpeg.FS('unlink', outputFileName);

      setAudioUrl(URL.createObjectURL(blob));
      setStatus('complete');
    } catch (error) {
      console.error('Error extracting audio:', error);
      setStatus('error');
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    extractAudio(file);
  };

  const downloadAudio = () => {
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = 'extracted_audio.mp3';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Local Audio Extractor</h2>
      
      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">Start Time (optional)</label>
          <input
            type="text"
            placeholder="00:00:00"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="px-3 py-2 border rounded-md w-full"
          />
          <p className="text-sm text-gray-500 mt-1">Format: HH:MM:SS or seconds</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Duration (optional)</label>
          <input
            type="text"
            placeholder="00:00:00"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="px-3 py-2 border rounded-md w-full"
          />
          <p className="text-sm text-gray-500 mt-1">Format: HH:MM:SS or seconds</p>
        </div>
      </div>
      
      <div className="mb-4">
        <input
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100"
        />
      </div>

      {(status === 'loading' || status === 'processing') && (
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {status === 'loading' ? 'Loading FFmpeg' : 'Processing'}
          </AlertTitle>
          <AlertDescription>
            {status === 'loading' 
              ? 'Please wait while FFmpeg loads...'
              : `Converting... ${progress}%`
            }
          </AlertDescription>
        </Alert>
      )}
      
      {status === 'error' && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to extract audio. Please try again.
          </AlertDescription>
        </Alert>
      )}
      
      {status === 'complete' && (
        <div className="space-y-4">
          <Alert variant="default" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>
              Audio extracted successfully!
            </AlertDescription>
          </Alert>
          
          <audio controls src={audioUrl} className="w-full" />
          
          <button
            onClick={downloadAudio}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Download MP3
          </button>
        </div>
      )}
    </div>
  );
};

export default LocalAudioExtractor;