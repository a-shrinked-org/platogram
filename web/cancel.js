import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Cancel() {
  const router = useRouter();

  useEffect(() => {
    // Redirect back to the main page after a short delay
    const timer = setTimeout(() => {
      router.push('/');
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div>
      <h1>Payment Cancelled</h1>
      <p>Your payment was cancelled. Redirecting you back to the main page...</p>
    </div>
  );
}
