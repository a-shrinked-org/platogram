import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { put } from '@vercel/blob/client';
import { useAuth0 } from '@auth0/auth0-react';

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

async function uploadFile(file, isTestMode = false, getTokenSilently) {
    if (isTestMode) {
        console.log('Test mode: Simulating file upload');
        return `https://example.com/test-upload/${file.name}`;
    }

    try {
        // Get the Auth0 token
        const token = await getTokenSilently();

        // Get the Blob token
        const tokenResponse = await fetch('/api/upload-file', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Vercel-Blob-Token-Request': 'true'
            }
        });

        if (!tokenResponse.ok) {
            throw new Error('Failed to get Blob token');
        }

        const { token: blobToken } = await tokenResponse.json();

        // Use Vercel Blob to upload the file
        const blob = await put(file.name, file, {
            access: 'public',
            token: blobToken,
            handleUploadUrl: '/api/upload-file',
        });

        console.log('File uploaded successfully. URL:', blob.url);
        return blob.url;
    } catch (error) {
        console.error('Error uploading file:', error);
        throw new Error('Failed to upload file');
    }
}

export default function Success() {
    const router = useRouter();
    const [status, setStatus] = useState('Processing payment');
    const { getTokenSilently } = useAuth0();

    useEffect(() => {
        async function handleSuccess() {
            await initDB();
            const { session_id } = router.query;
            console.log('Session ID:', session_id);

            const pendingConversionDataString = sessionStorage.getItem('pendingConversionData');
            console.log('Retrieved pendingConversionDataString:', pendingConversionDataString);

            const pendingConversionData = pendingConversionDataString ? JSON.parse(pendingConversionDataString) : null;
            console.log('Parsed pendingConversionData:', pendingConversionData);

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
                    console.log('Retrieving file:', inputData);
                    const file = await retrieveFileFromTemporaryStorage(inputData);

                    setStatus('Uploading file...');
                    inputData = await uploadFile(file, isTestMode, getTokenSilently);
                    console.log('File uploaded:', inputData);
                }

                setStatus('Starting conversion...');
                if (isTestMode) {
                    console.log('Test mode: Simulating conversion request');
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API delay
                    setStatus('Conversion started (Test Mode)');
                    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait before redirect
                    router.push('/?showStatus=true');
                } else {
                    // Real API call
                    const token = await getTokenSilently();
                    const response = await fetch('/convert', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ session_id, lang, inputData }),
                    });

                    if (response.ok) {
                        setStatus('Conversion started');
                        router.push('/?showStatus=true');
                    } else {
                        setStatus('Failed to start conversion');
                    }
                }
            } catch (error) {
                console.error('Error in handleSuccess:', error);
                setStatus(`Error: ${error.message}`);
            }
        }

        if (router.query.session_id) {
            handleSuccess();
        }
    }, [router.query, getTokenSilently]);

    return (
        <div>
            <h1>Payment Successful</h1>
            <p>{status}</p>
        </div>
    );
}