import Markdoc from '@markdoc/markdoc';
import Head from 'next/head';
import fs from 'fs';
import path from 'path';

export default function ShrinkdVsCirclebackPage({ content, frontmatter }) {
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

export async function getStaticProps() {
  const filePath = path.join(process.cwd(), 'content', 'shrinked-vs-circleback.md');
  const markdownContent = fs.readFileSync(filePath, 'utf8');

  const ast = Markdoc.parse(markdownContent);
  const frontmatter = Markdoc.frontmatter(ast);
  const content = Markdoc.transform(ast);
  const html = Markdoc.renderers.html(content);

  return {
    props: {
      content: html,
      frontmatter,
    },
  };
}