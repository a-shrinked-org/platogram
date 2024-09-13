import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function TestIntermediate() {
    const router = useRouter();
    const [status, setStatus] = useState('Initializing...');

    useEffect(() => {
        console.log('TestIntermediate page loaded');
        setStatus('Simulating Stripe checkout...');

        const timer = setTimeout(() => {
            setStatus('Redirecting to success page...');
            const testSessionId = 'test_session_' + Date.now();

            // Ensure pendingConversionData exists in localStorage
            const pendingConversionData = localStorage.getItem('pendingConversionData');
            if (!pendingConversionData) {
                console.error('No pending conversion data found');
                router.push('/?showError=true');
                return;
            }

            console.log('Redirecting to:', `/success?session_id=${testSessionId}`);
            router.push(`/success?session_id=${testSessionId}`);
        }, 5000);

        return () => clearTimeout(timer);
    }, [router]);

    return (
        <div>
            <h1>Test Intermediate Page</h1>
            <p>{status}</p>
            <p>If you see this page for more than 5 seconds, something is wrong.</p>
        </div>
    );
}