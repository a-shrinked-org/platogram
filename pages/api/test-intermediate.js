import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

function TestIntermediate() {
    const router = useRouter();
    const [status, setStatus] = useState('Simulating Stripe checkout...');

    useEffect(() => {
        const timer = setTimeout(() => {
            setStatus('Redirecting to success page...');
            const testSessionId = 'test_session_' + Date.now();
            router.push(`/success?session_id=${testSessionId}`);
        }, 5000);

        return () => clearTimeout(timer);
    }, []);

    return (
        <div>
            <h1>Simulated Stripe Checkout</h1>
            <p>{status}</p>
        </div>
    );
}

export default TestIntermediate;