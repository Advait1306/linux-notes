import { getMDXComponents } from "@/components/mdx";
import { source } from "@/lib/source";
import { Globe } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";

type PageProps = {
  params: Promise<{
    slug?: string[];
  }>;
};

type DocPageData = NonNullable<ReturnType<typeof source.getPage>>;

export function generateStaticParams() {
  return [{ slug: [] }, ...source.generateParams()];
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const page = getPage((await params).slug);

  if (!page) return {};

  return {
    title: page.data.title,
    description: page.data.description,
  };
}

export default async function Page({ params }: PageProps) {
  const page = getPage((await params).slug);

  if (!page) notFound();

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
      <DocPage page={page} />
    </DocsLayout>
  );
}

function getPage(slug?: string[]) {
  if (!slug || slug.length === 0) {
    return source.getPage([]) ?? source.getPages()[0];
  }

  return source.getPage(slug);
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

function DocPage({ page }: { page: DocPageData }) {
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
