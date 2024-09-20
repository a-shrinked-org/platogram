import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function ShrinkdVsCirclebackPage() {
  const [content, setContent] = useState('');
  const [frontmatter, setFrontmatter] = useState({});

  useEffect(() => {
    async function loadContent() {
      const Markdoc = (await import('@markdoc/markdoc')).default;
      const response = await fetch('/content/shrinked-vs-circleback.md');
      const markdownContent = await response.text();

      const ast = Markdoc.parse(markdownContent);
      const frontmatter = Markdoc.frontmatter(ast);
      const content = Markdoc.transform(ast);
      const html = Markdoc.renderers.html(content);

      setContent(html);
      setFrontmatter(frontmatter);
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