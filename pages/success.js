import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth0 } from '@auth0/auth0-react';

function Success() {
    const router = useRouter();
    const [status, setStatus] = useState('Processing payment');
    const { getTokenSilently, isAuthenticated, isLoading } = useAuth0();
    const [conversionStarted, setConversionStarted] = useState(false);

    useEffect(() => {
        let isMounted = true;

        async function handleSuccess() {
            if (conversionStarted) return;
            setConversionStarted(true);

            if (!isAuthenticated) {
                console.error('User not authenticated');
                setStatus('Error: User not authenticated');
                setTimeout(() => router.push('/?showError=true'), 5000);
                return;
            }

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

                const token = await getTokenSilently();

                if (pendingConversionData.isFile) {
                    setStatus('Retrieving file...');
                    console.log('Retrieving file:', inputData);
                    const file = await window.retrieveFileFromTemporaryStorage(inputData);
                    setStatus('Uploading file...');
                    inputData = await window.uploadFile(file, token, isTestMode);
                    console.log('File uploaded:', inputData);
                }

                setStatus('Starting conversion...');
                await window.postToConvert(inputData, lang, session_id, pendingConversionData.price, isTestMode);

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

        if (router.query.session_id && !isLoading && isAuthenticated && !conversionStarted) {
            handleSuccess();
        }

        return () => {
            isMounted = false;
        };
    }, [router.query, isAuthenticated, isLoading, conversionStarted]);

    if (isLoading) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <h1>Payment Successful</h1>
            <p>{status}</p>
        </div>
    );
}

export default Success;