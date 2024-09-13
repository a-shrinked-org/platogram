import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth0 } from '@auth0/auth0-react';

export default function Success() {
    const [isClient, setIsClient] = useState(false);
    const { isLoading, isAuthenticated } = useAuth0();
    const router = useRouter();
    const [status, setStatus] = useState('Initializing...');

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return <div>Loading...</div>;
    }

    return (
        <ClientSideSuccess
            setStatus={setStatus}
            status={status}
            isLoading={isLoading}
            isAuthenticated={isAuthenticated}
            router={router}
        />
    );
}

function ClientSideSuccess({ setStatus, status, isLoading, isAuthenticated, router }) {
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

                if (typeof window === 'undefined') {
                    throw new Error('Window object is not available');
                }

                const pendingConversionDataString = window.localStorage.getItem('pendingConversionData');
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

                if (typeof window.handleStripeSuccess !== 'function') {
                    throw new Error('handleStripeSuccess function not found');
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

        if (!isLoading && isClient) {
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