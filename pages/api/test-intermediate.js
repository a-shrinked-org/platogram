import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

function TestIntermediate() {
    const router = useRouter();
    const [status, setStatus] = useState('Processing payment simulation...');

    useEffect(() => {
        const { inputData } = router.query;

        if (inputData) {
            try {
                const conversionData = JSON.parse(decodeURIComponent(inputData));
                console.log('Received conversion data:', conversionData);

                // Store the conversion data in localStorage
                localStorage.setItem('pendingConversionData', JSON.stringify(conversionData));

                // Simulate a delay for payment processing
                setTimeout(() => {
                    setStatus('Payment successful! Redirecting to success page...');

                    // Simulate redirect to success page
                    const testSessionId = 'test_session_' + Date.now();
                    setTimeout(() => {
                        router.push(`/success?session_id=${testSessionId}`);
                    }, 2000);
                }, 3000);
            } catch (error) {
                console.error('Error parsing input data:', error);
                setStatus('Error: Invalid input data');
            }
        } else {
            setStatus('Error: No input data received');
        }
    }, [router.query]);

    return (
        <div>
            <h1>Simulated Stripe Checkout</h1>
            <p>{status}</p>
        </div>
    );
}

export default TestIntermediate;