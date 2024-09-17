import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function Cancel() {
    const [status, setStatus] = useState('Processing cancellation...');
    const router = useRouter();

    useEffect(() => {
        setStatus('Payment cancelled. Redirecting back to the main page...');
        // You can store cancellation info in sessionStorage if needed
        sessionStorage.setItem('paymentCancelled', 'true');
        setTimeout(() => {
            window.location.href = '/';  // Redirect to the main page
        }, 3000); // Redirect after 3 seconds
    }, []);

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
                    <h1 className="text-3xl font-bold mb-4 text-white">Payment Cancelled</h1>
                    <p className="text-xl text-red-500">{status}</p>
                </div>
            </div>
        </>
    );
}