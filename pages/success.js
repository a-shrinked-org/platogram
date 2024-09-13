import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth0 } from '@auth0/auth0-react';

export default function Success() {
    const [status, setStatus] = useState('Initializing...');
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return <div>Loading...</div>;
    }

    return <ClientSideSuccess setStatus={setStatus} status={status} />;
}

function ClientSideSuccess({ setStatus, status }) {
    const router = useRouter();
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

                const isTestMode = pendingConversionData.isTestMode || session_id.startsWith('test_');

                if (!isTestMode && !isAuthenticated) {
                    throw new Error('User not authenticated for non-test session');
                }

                await window.handleStripeSuccess(session_id, isTestMode);

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
            handleSuccess();
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