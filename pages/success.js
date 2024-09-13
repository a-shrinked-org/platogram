import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth0 } from '@auth0/auth0-react';

export default function Success() {
    const router = useRouter();
    const [status, setStatus] = useState('Initializing...');
    const { getTokenSilently, isAuthenticated, isLoading } = useAuth0();
    const [conversionStarted, setConversionStarted] = useState(false);

    useEffect(() => {
        console.log('Success page loaded');
        console.log('Router query:', router.query);
        console.log('isAuthenticated:', isAuthenticated);
        console.log('isLoading:', isLoading);

        let isMounted = true;

        async function handleSuccess() {
            console.log('handleSuccess called');
            if (conversionStarted) return;
            setConversionStarted(true);

            try {
                const { session_id } = router.query;
                console.log('Session ID:', session_id);

                const pendingConversionDataString = localStorage.getItem('pendingConversionData');
                console.log('Retrieved pendingConversionDataString:', pendingConversionDataString);

                if (!pendingConversionDataString) {
                    throw new Error('No pending conversion data found');
                }

                const pendingConversionData = JSON.parse(pendingConversionDataString);
                console.log('Parsed pendingConversionData:', pendingConversionData);

                if (!session_id || !pendingConversionData) {
                    throw new Error('Missing session_id or pendingConversionData');
                }

                localStorage.removeItem('pendingConversionData');

                let inputData = pendingConversionData.inputData;
                const lang = pendingConversionData.lang;
                const isTestMode = pendingConversionData.isTestMode || false;
                const price = pendingConversionData.price;

                console.log('Is test mode:', isTestMode);

                let token = 'test_token';
                if (!isTestMode) {
                    if (!isAuthenticated) {
                        console.error('User not authenticated');
                        setStatus('Error: User not authenticated');
                        setTimeout(() => router.push('/?showError=true'), 5000);
                        return;
                    }
                    token = await getTokenSilently();
                }

                if (pendingConversionData.isFile) {
                    setStatus('Retrieving file...');
                    console.log('Retrieving file:', inputData);
                    const file = await window.retrieveFileFromTemporaryStorage(inputData);
                    setStatus('Uploading file...');
                    inputData = await window.uploadFile(file, token, isTestMode);
                    console.log('File uploaded:', inputData);
                }

                setStatus('Starting conversion...');
                console.log('Calling postToConvert with:', { inputData, lang, session_id, price, isTestMode });
                await window.postToConvert(inputData, lang, session_id, price, isTestMode);

                if (isMounted) {
                    setStatus('Conversion started');
                    router.push('/?showStatus=true');
                }
            } catch (error) {
                console.error('Error in handleSuccess:', error);
                if (isMounted) {
                    setStatus(`Error: ${error.message}`);
                    setTimeout(() => router.push('/?showError=true'), 5000);
                }
            }
        }

        if (router.query.session_id && !isLoading) {
            const isTestSession = router.query.session_id.startsWith('test_');
            if (isTestSession || isAuthenticated) {
                handleSuccess();
            } else {
                console.log('Waiting for authentication...');
            }
        }

        return () => {
            isMounted = false;
        };
    }, [router.query, isAuthenticated, isLoading, conversionStarted]);

    if (isLoading) {
        return <div>Loading authentication state...</div>;
    }

    return (
        <div>
            <h1>Payment Successful</h1>
            <p>{status}</p>
        </div>
    );
}