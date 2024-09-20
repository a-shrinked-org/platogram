import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function ShrinkdVsCirclebackPage() {
  const [content, setContent] = useState('');
  const [frontmatter, setFrontmatter] = useState({});

  useEffect(() => {
    async function loadContent() {
      try {
        const Markdoc = (await import('@markdoc/markdoc')).default;
        const response = await fetch('/content/shrinked-vs-circleback.md');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const markdownContent = await response.text();
        const ast = Markdoc.parse(markdownContent);
        const frontmatter = Markdoc.frontmatter ? Markdoc.frontmatter(ast) : {};
        const content = Markdoc.transform(ast);
        const html = Markdoc.renderers.html(content);
        setContent(html);
        setFrontmatter(frontmatter);
      } catch (error) {
        console.error("Error loading content:", error);
        setContent('<p>Error loading content. Please try again later.</p>');
      }
    }
    loadContent();
  }, []);

  return (
    <>
      <Head>
        <title>{frontmatter.title || 'Shrinked vs CircleBack'}</title>
        <meta name="description" content={frontmatter.description || 'Comparison between Shrinked and CircleBack'} />
      </Head>
      <article className="container mx-auto px-4 py-8">
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </article>
    </>
  );
}