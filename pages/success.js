import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth0 } from '@auth0/auth0-react';

export default function Success() {
    const [status, setStatus] = useState('Initializing...');
    const [isClient, setIsClient] = useState(false);
    const { isLoading, isAuthenticated, getAccessTokenSilently } = useAuth0();
    const router = useRouter();

    useEffect(() => {
        console.log('Success component mounted');
        setIsClient(true);
    }, []);

    useEffect(() => {
        console.log('isClient:', isClient, 'isLoading:', isLoading);
        if (isClient) {
            const timer = setTimeout(() => {
                console.log('Timeout triggered. Calling handleSuccess');
                handleSuccess();
            }, 5000); // Wait for 5 seconds before forcing handleSuccess

            if (!isLoading) {
                console.log('Calling handleSuccess immediately');
                handleSuccess();
                clearTimeout(timer);
            }

            return () => clearTimeout(timer);
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
            console.log('Is test mode:', isTestMode);

            let token;
            try {
                token = isTestMode ? 'test_token' : await getAccessTokenSilently();
                console.log('Token obtained:', token ? 'Yes' : 'No');
            } catch (error) {
                console.error('Error getting token:', error);
                throw error;
            }

            if (!isTestMode && !isAuthenticated) {
                console.warn('User not authenticated for non-test session, but proceeding anyway');
            }

            let pendingConversionDataString;
            if (typeof window !== 'undefined') {
                pendingConversionDataString = localStorage.getItem('pendingConversionData');
            }
            console.log('Retrieved pendingConversionDataString:', pendingConversionDataString);

            if (!pendingConversionDataString) {
                throw new Error('No pending conversion data found');
            }

            const pendingConversionData = JSON.parse(pendingConversionDataString);
            console.log('Parsed pendingConversionData:', pendingConversionData);

            let { inputData, lang, price } = pendingConversionData;

            if (typeof window !== 'undefined') {
                localStorage.removeItem('pendingConversionData');
            }

            if (pendingConversionData.isFile) {
                setStatus('Retrieving file...');
                if (typeof window.retrieveFileFromTemporaryStorage !== 'function') {
                    throw new Error('retrieveFileFromTemporaryStorage function not found');
                }
                const file = await window.retrieveFileFromTemporaryStorage(inputData);
                if (!file) {
                    throw new Error("Failed to retrieve file from temporary storage");
                }

                setStatus('Uploading file...');
                if (typeof window.uploadFile !== 'function') {
                    throw new Error('uploadFile function not found');
                }
                inputData = await window.uploadFile(file, token, isTestMode);
                console.log("File uploaded successfully, URL:", inputData);
            }

            setStatus('Starting conversion...');
            if (typeof window.postToConvert !== 'function') {
                throw new Error('postToConvert function not found');
            }
            await window.postToConvert(inputData, lang, session_id, price, isTestMode, token);

            setStatus('Conversion started');
            router.push('/?showStatus=true');

        } catch (error) {
            console.error('Error in handleSuccess:', error);
            setStatus(`Error: ${error.message}`);
            setTimeout(() => router.push('/?showError=true'), 5000);
        }
    }

    console.log('Rendering. isClient:', isClient, 'isLoading:', isLoading);

    if (!isClient) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <h1>Payment Successful</h1>
            <p>{status}</p>
        </div>
    );
}