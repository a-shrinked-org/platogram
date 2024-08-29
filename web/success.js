import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Success() {
  const router = useRouter();

  useEffect(() => {
    async function handleSuccess() {
      const { session_id, lang } = router.query;
      if (session_id) {
        try {
          const response = await fetch('/convert', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ session_id, lang }),
          });
          
          if (response.ok) {
            // Update UI to show conversion started
            updateUIStatus('running');
          } else {
            updateUIStatus('error', 'Failed to start conversion');
          }
        } catch (error) {
          console.error('Error starting conversion:', error);
          updateUIStatus('error', 'Failed to start conversion');
        }
      }
    }

    handleSuccess();
  }, [router.query]);

  return (
    <div>
      <h1>Payment Successful</h1>
      <p>Your conversion is starting. Please wait...</p>
    </div>
  );
}
