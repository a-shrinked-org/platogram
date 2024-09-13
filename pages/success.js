import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth0 } from '@auth0/auth0-react';

export default function Success() {
    const [status, setStatus] = useState('Verifying payment...');
    const [error, setError] = useState(null);
    const { isLoading, getAccessTokenSilently } = useAuth0();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && router.isReady) {
            handleSuccess();
        }
    }, [isLoading, router.isReady]);

    async function handleSuccess() {
        const { session_id } = router.query;
        console.log('Session ID:', session_id);

        try {
            if (!session_id) {
                throw new Error('Missing session_id');
            }

            const isTestMode = session_id.startsWith('test_');
            let token = isTestMode ? 'test_token' : await getAccessTokenSilently();

            // Verify the Stripe session
            const response = await fetch('/api/verify-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ session_id, isTestMode })
            });

            if (!response.ok) {
                throw new Error('Failed to verify payment session');
            }

            const result = await response.json();

            if (result.status === 'success') {
                // Retrieve pendingConversionData from localStorage
                const pendingConversionDataString = localStorage.getItem('pendingConversionData');
                if (!pendingConversionDataString) {
                    throw new Error('No pending conversion data found');
                }

                const pendingConversionData = JSON.parse(pendingConversionDataString);

                // Clear pendingConversionData from localStorage
                localStorage.removeItem('pendingConversionData');

                // Encode the data to pass it safely in the URL
                const encodedData = encodeURIComponent(JSON.stringify({
                    ...pendingConversionData,
                    session_id,
                    isTestMode
                }));

                // Redirect to index with success flag and encoded data
                router.push(`/?paymentSuccess=true&conversionData=${encodedData}`);
            } else {
                throw new Error(result.message || 'Payment verification failed');
            }

        } catch (error) {
            console.error('Error in handleSuccess:', error);
            setError(error.message);
            setStatus('Error occurred');
        }
    }

    if (isLoading || !router.isReady) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <h1>Payment Verification</h1>
            <p>{status}</p>
            {error && (
                <div style={{ color: 'red', marginTop: '20px' }}>
                    <h2>Error:</h2>
                    <p>{error}</p>
                    <p>Please try again or contact support if the problem persists.</p>
                </div>
            )}
        </div>
    );
}