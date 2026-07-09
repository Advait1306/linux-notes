import { getMDXComponents } from "@/components/mdx";
import { source } from "@/lib/source";
import { Globe } from "lucide-react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";

export default function Home() {
  const page = source.getPage([]) ?? source.getPages()[0];

  return (
    <DocsLayout
      tree={source.getPageTree()}
      nav={{ title: "Linux Notes" }}
      links={[
        {
          type: "icon",
          text: "X",
          label: "X profile",
          url: "https://x.com/lifeofadvait",
          external: true,
          on: "menu",
          icon: <XIcon />,
        },
        {
          type: "icon",
          text: "Website",
          label: "Personal website",
          url: "https://advaitb.com",
          external: true,
          on: "menu",
          icon: <Globe />,
        },
      ]}
    >
      {page ? <DocPage page={page} /> : <EmptyDocsPage />}
    </DocsLayout>
  );
}

function XIcon() {
  return (
    <span
      aria-hidden="true"
      className="block size-3.5 bg-current"
      style={{
        mask: "url(/x-logo.svg) center / contain no-repeat",
        WebkitMask: "url(/x-logo.svg) center / contain no-repeat",
      }}
    />
  );
}

function DocPage({
  page,
}: {
  page: NonNullable<ReturnType<typeof source.getPage>>;
}) {
  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents()} />
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
