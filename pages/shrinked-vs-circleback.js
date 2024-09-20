import Markdoc from '@markdoc/markdoc';
import Head from 'next/head';

export default function ShrinkdVsCirclebackPage({ content, frontmatter }) {
  return (
    <>
      <Head>
        <title>{frontmatter.title}</title>
        <meta name="description" content={frontmatter.description} />
      </Head>
      <div className="container mx-auto px-4 py-8">
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    </>
  );
}

export default function ShrinkdVsCirclebackPage({ content }) {
  return (
    <div className="container mx-auto px-4 py-8">
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  );
}

export async function getStaticProps() {
  const fs = require('fs');
  const path = require('path');

  const filePath = path.join(process.cwd(), 'shrinked-vs-circleback.md');
  const markdownContent = fs.readFileSync(filePath, 'utf8');

  const ast = Markdoc.parse(markdownContent);
  const content = Markdoc.transform(ast);
  const html = Markdoc.renderers.html(content);

  const frontmatter = Markdoc.frontmatter(ast);

  return {
    props: {
      content: html,
      frontmatter,
    },
  };
}