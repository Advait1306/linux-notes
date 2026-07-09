import { source } from "@/lib/source";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import defaultMdxComponents from "fumadocs-ui/mdx";

export default function Home() {
  const page = source.getPage([]) ?? source.getPages()[0];

  return (
    <DocsLayout
      tree={source.getPageTree()}
      nav={{ title: "Linux Notes" }}
      links={[
        {
          type: "icon",
          url: "https://x.com/lifeofadvait",
          text: "X",
          label: "X / Twitter",
          external: true,
          icon: <XLogo />,
        },
      ]}
    >
      {page ? <DocPage page={page} /> : <EmptyDocsPage />}
    </DocsLayout>
  );
}

function XLogo() {
  return (
    <svg
      role="img"
      viewBox="0 0 1200 1227"
      fill="currentColor"
      className="scale-75"
    >
      <path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z" />
    </svg>
  );
}

function DocPage({ page }: { page: NonNullable<ReturnType<typeof source.getPage>> }) {
  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={defaultMdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}

function EmptyDocsPage() {
  return (
    <DocsPage>
      <DocsTitle>Linux Notes</DocsTitle>
      <DocsDescription>Add docs under content/docs.</DocsDescription>
      <DocsBody />
    </DocsPage>
  );
}
