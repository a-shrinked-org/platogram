import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

let db;

// Initialize IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
        const request = indexedDB.open("FileStorage", 1);
        request.onerror = (event) => reject("IndexedDB error: " + event.target.error);
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve();
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            db.createObjectStore("files", { keyPath: "id" });
        };
    });
}

// Retrieve file from IndexedDB
async function retrieveFileFromTemporaryStorage(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["files"], "readonly");
        const store = transaction.objectStore("files");
        const request = store.get(id);
        request.onerror = (event) => reject("Error retrieving file: " + event.target.error);
        request.onsuccess = (event) => resolve(event.target.result.file);
    });
}

// Upload file to server
async function uploadFile(file, isTestMode = false) {
    if (isTestMode) {
        console.log('Test mode: Simulating file upload');
        return `https://example.com/test-upload/${file.name}`;
    }

    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/upload-file', {
        method: 'POST',
        body: formData,
    });
    if (!response.ok) {
        throw new Error('Failed to upload file');
    }
    const result = await response.json();
    return result.url;
}

export default function Success() {
    const router = useRouter();
    const [status, setStatus] = useState('Processing payment');

    useEffect(() => {
        async function handleSuccess() {
            await initDB();
            const { session_id } = router.query;
            const pendingConversionData = JSON.parse(sessionStorage.getItem('pendingConversionData'));

            if (!session_id || !pendingConversionData) {
                setStatus('Error: Invalid success parameters');
                return;
            }

            sessionStorage.removeItem('pendingConversionData');
            let inputData = pendingConversionData.inputData;
            const lang = pendingConversionData.lang;
            const isTestMode = session_id.startsWith('test_session_');

            try {
                if (pendingConversionData.isFile) {
                    setStatus('Retrieving file...');
                    // In test mode, simulate file retrieval
                    const file = isTestMode
                        ? new File(["test content"], pendingConversionData.inputData, { type: "audio/mpeg" })
                        : await retrieveFileFromTemporaryStorage(pendingConversionData.inputData);

                    setStatus('Uploading file...');
                    inputData = await uploadFile(file, isTestMode);
                }

                setStatus('Starting conversion...');
                if (isTestMode) {
                    console.log('Test mode: Simulating conversion request');
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API delay
                    setStatus('Conversion started (Test Mode)');
                    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait before redirect
                    router.push('/?showStatus=true');
                } else {
                    response = await fetch('/convert', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ session_id, lang, inputData }),
                    });
                }
          
                if (response.ok) {
                    setStatus('Conversion started');
                    // Redirect to main page with status
                    router.push('/?showStatus=true');
                } else {
                    setStatus('Failed to start conversion');
                }
            } catch (error) {
                console.error('Error in handleSuccess:', error);
                setStatus(`Error: ${error.message}`);
            }
        }

        if (router.query.session_id) {
            handleSuccess();
        }
    }, [router.query]);

    return (
        <div>
            <h1>Payment Successful</h1>
            <p>{status}</p>
        </div>
    );
}