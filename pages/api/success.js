import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth0 } from '@auth0/auth0-react';

function Success() {
    const router = useRouter();
    const [status, setStatus] = useState('Processing payment');
    const { getTokenSilently, isAuthenticated, isLoading } = useAuth0();
    const [conversionStarted, setConversionStarted] = useState(false);

    useEffect(() => {
        if (router.query.session_id && !isLoading && !conversionStarted) {
            handleSuccess();
        }
    }, [router.query, isAuthenticated, isLoading, conversionStarted]);

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

            const pendingConversionDataString = sessionStorage.getItem('pendingConversionData');
            console.log('Retrieved pendingConversionDataString:', pendingConversionDataString);

            const pendingConversionData = pendingConversionDataString ? JSON.parse(pendingConversionDataString) : null;
            console.log('Parsed pendingConversionData:', pendingConversionData);

            if (!session_id || !pendingConversionData) {
                console.error('Missing session_id or pendingConversionData');
                setStatus('Error: Invalid success parameters');
                setTimeout(() => router.push('/?showError=true'), 5000);
                return;
            }

            sessionStorage.removeItem('pendingConversionData');
            let inputData = pendingConversionData.inputData;
            const lang = pendingConversionData.lang;
            const isTestMode = pendingConversionData.isTestMode || false; // Add this line for test mode

            const token = await getTokenSilently();

            if (pendingConversionData.isFile) {
                setStatus('Retrieving file...');
                console.log('Retrieving file:', inputData);
                const file = await window.retrieveFileFromTemporaryStorage(inputData);

                setStatus('Uploading file...');
                inputData = await window.uploadFile(file, token, isTestMode); // Pass isTestMode to uploadFile
                console.log('File uploaded:', inputData);
            }

            setStatus('Starting conversion...');
            await window.postToConvert(inputData, lang, session_id, pendingConversionData.price, isTestMode); // Pass isTestMode to postToConvert

            // The pollStatus function in app.js will handle status updates and UI changes
            await window.pollStatus(token, isTestMode); // Pass isTestMode to pollStatus

            router.push('/?showStatus=true');
        } catch (error) {
            console.error('Error in handleSuccess:', error);
            setStatus(`Error: ${error.message}`);
            setTimeout(() => router.push('/?showError=true'), 5000);
        }
    }

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