import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth0 } from '@auth0/auth0-react';

export default function Success() {
    const [status, setStatus] = useState('Initializing...');
    const [isClient, setIsClient] = useState(false);
    const { isLoading, isAuthenticated, getAccessTokenSilently } = useAuth0();
    const router = useRouter();

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (isClient && !isLoading) {
            handleSuccess();
        }
    }, [isClient, isLoading]);

    async function handleSuccess() {
        console.log('handleSuccess called');
        const { session_id } = router.query;
        console.log('Session ID:', session_id);

        try {
            if (!session_id) {
                throw new Error('Missing session_id');
            }

            const isTestMode = session_id.startsWith('test_');
            let token = isTestMode ? 'test_token' : await getAccessTokenSilently();

            if (!isTestMode && !isAuthenticated) {
                throw new Error('User not authenticated for non-test session');
            }

            const pendingConversionDataString = localStorage.getItem('pendingConversionData');
            console.log('Retrieved pendingConversionDataString:', pendingConversionDataString);

            if (!pendingConversionDataString) {
                throw new Error('No pending conversion data found');
            }

            const pendingConversionData = JSON.parse(pendingConversionDataString);
            console.log('Parsed pendingConversionData:', pendingConversionData);

            let { inputData, lang, price } = pendingConversionData;

            // Clear pending conversion data
            localStorage.removeItem('pendingConversionData');

            // If inputData is a file ID, retrieve and upload the file
            if (pendingConversionData.isFile) {
                setStatus('Retrieving file...');
                const file = await window.retrieveFileFromTemporaryStorage(inputData);
                if (!file) {
                    throw new Error("Failed to retrieve file from temporary storage");
                }

                setStatus('Uploading file...');
                inputData = await window.uploadFile(file, token, isTestMode);
                console.log("File uploaded successfully, URL:", inputData);
            }

            // Start the conversion process
            setStatus('Starting conversion...');
            await window.postToConvert(inputData, lang, session_id, price, isTestMode, token);

            setStatus('Conversion started');
            router.push('/?showStatus=true');

        } catch (error) {
            console.error('Error in handleSuccess:', error);
            setStatus(`Error: ${error.message}`);
            setTimeout(() => router.push('/?showError=true'), 5000);
        }
    }

    if (!isClient || isLoading) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <h1>Payment Successful</h1>
            <p>{status}</p>
        </div>
    );
}