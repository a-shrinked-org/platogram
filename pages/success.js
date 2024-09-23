import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function Success() {
    const [status, setStatus] = useState('Processing payment...');
    const router = useRouter();

    useEffect(() => {
        const { session_id } = router.query;
        if (session_id) {
            setStatus('Payment successful! Redirecting...');

            // Retrieve the existing pendingConversionData
            const pendingConversionData = localStorage.getItem('pendingConversionData');

            // Store both the session_id and pendingConversionData
            localStorage.setItem('successfulPayment', JSON.stringify({
                session_id,
                pendingConversionData
            }));
            console.log('Stored successfulPayment in localStorage:', { session_id, pendingConversionData });

            // Redirect to the main page without a success parameter
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);  // Redirect after 3 seconds
        } else {
            setStatus('Error: Invalid session');
            setTimeout(() => {
                window.location.href = '/?error=invalid_session';
            }, 5000);
        }
    }, [router.query]);

    return (
        <>
            <Head>
                <link
                    href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css"
                    rel="stylesheet"
                />
            </Head>
            <div className="flex items-center justify-center min-h-screen bg-black">
                <div className="text-center">
                    <h1 className="text-3xl font-bold mb-4 text-white">Payment Status</h1>
                    <p className="text-xl text-green-400">{status}</p>
                </div>
            </div>
        </>
    );
}