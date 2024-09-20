import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function ShrinkdVsCirclebackPage() {
  const [content, setContent] = useState('');

  useEffect(() => {
    async function fetchContent() {
      try {
        const response = await fetch('https://pdf.shrinked.ai/shrinked-vs-circleback/');
        const text = await response.text();
        // Parse the HTML content and extract the main content
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const mainContent = doc.querySelector('main').innerHTML;
        setContent(mainContent);
      } catch (error) {
        console.error('Error fetching content:', error);
      }
    }
    fetchContent();
  }, []);

  return (
    <>
      <Head>
        <title>Shrinked vs CircleBack: Superior Call Summarization</title>
        <meta name="description" content="Discover why Shrinked is the better choice for summarizing calls and extracting valuable insights from audio and video content compared to CircleBack." />
        <link rel="canonical" href="https://pdf.shrinked.ai/shrinked-vs-circleback/" />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </>
  );
}

// Add this for better SEO with static generation
export async function getStaticProps() {
  try {
    const response = await fetch('https://pdf.shrinked.ai/shrinked-vs-circleback/');
    const text = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const mainContent = doc.querySelector('main').innerHTML;

    return {
      props: {
        content: mainContent,
      },
      revalidate: 3600, // Revalidate every hour
    };
  } catch (error) {
    console.error('Error fetching content:', error);
    return {
      props: {
        content: '',
      },
    };
  }
}