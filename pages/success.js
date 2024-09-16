import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function Success() {
    const [status, setStatus] = useState('Processing payment...');
    const router = useRouter();

    useEffect(() => {
        const { session_id } = router.query;
        if (session_id) {
            setStatus('Payment successful! Redirecting...');
            // Store the session_id in sessionStorage for app.js to access
            sessionStorage.setItem('successfulPayment', JSON.stringify({ session_id }));
            setTimeout(() => {
                window.location.href = '/';  // Redirect to the main page
            }, 3000); // Redirect after 3 seconds
        } else {
            setStatus('Error: Invalid session');
            setTimeout(() => {
                window.location.href = '/?error=invalid_session';
            }, 3000);
        }
    }, [router.query]);

    return (
        <div className="flex items-center justify-center min-h-screen bg-black">
            <div className="text-center">
                <h1 className="text-3xl font-bold mb-4 text-white">Payment Status</h1>
                <p className="text-xl text-green-400">{status}</p>
            </div>
        </div>
    );
}