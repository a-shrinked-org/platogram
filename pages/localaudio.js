// pages/localaudio.js
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const LocalAudioExtractor = () => {
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState('');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState('');
  const [ffmpeg, setFfmpeg] = useState(null);

  useEffect(() => {
    const loadFfmpeg = async () => {
      try {
        const { FFmpeg } = await import('@ffmpeg/ffmpeg');
        const { fetchFile } = await import('@ffmpeg/util');
        
        const ffmpegInstance = new FFmpeg();
        await ffmpegInstance.load();
        
        // Store both FFmpeg instance and fetchFile utility
        setFfmpeg({ instance: ffmpegInstance, fetchFile });
      } catch (error) {
        console.error('Error loading FFmpeg:', error);
        setStatus('error');
      }
    };

    loadFfmpeg();
  }, []);

  const extractAudio = async (file) => {
    if (!ffmpeg?.instance) return;

    try {
      setStatus('processing');
      setProgress(0);

      const { instance: ffmpegInstance, fetchFile } = ffmpeg;

      // Write input file
      const inputFileName = 'input' + file.name.substring(file.name.lastIndexOf('.'));
      const outputFileName = 'output.mp3';
      
      await ffmpegInstance.writeFile(inputFileName, await fetchFile(file));

      // Set up progress handler
      ffmpegInstance.on('progress', ({ progress }) => {
        setProgress(Math.round(progress * 100));
      });

      // Prepare FFmpeg command
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
      await ffmpegInstance.exec(ffmpegArgs);

      // Read the result
      const data = await ffmpegInstance.readFile(outputFileName);
      const blob = new Blob([data], { type: 'audio/mp3' });
      
      // Clean up files
      await ffmpegInstance.deleteFile(inputFileName);
      await ffmpegInstance.deleteFile(outputFileName);

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

  if (!ffmpeg?.instance) return (
    <div className="p-4 max-w-xl mx-auto">
      <div className="p-4 bg-blue-50 text-blue-700 rounded-md">
        Loading FFmpeg...
      </div>
    </div>
  );

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

      {status === 'processing' && (
        <div className="p-4 mb-4 bg-blue-50 text-blue-700 rounded-md">
          Converting... {progress}%
        </div>
      )}
      
      {status === 'error' && (
        <div className="p-4 mb-4 bg-red-50 text-red-700 rounded-md">
          Failed to extract audio. Please try again.
        </div>
      )}
      
      {status === 'complete' && (
        <div className="space-y-4">
          <div className="p-4 mb-4 bg-green-50 text-green-700 rounded-md">
            Audio extracted successfully!
          </div>
          
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

// Prevent SSR for this component
export default dynamic(() => Promise.resolve(LocalAudioExtractor), {
  ssr: false
});