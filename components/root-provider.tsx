"use client";

import type { ComponentType, ReactNode } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { RootProvider as FumadocsRootProvider } from "fumadocs-ui/provider/next";
import DefaultSearchDialog, {
  type DefaultSearchDialogProps,
} from "fumadocs-ui/components/dialog/search-default";
import type { SearchItemType } from "fumadocs-ui/components/dialog/search";

const STORAGE_KEY = "linux-notes:selected-search-target";
const SEARCH_TARGET_EVENT = "linux-notes:selected-search-target";
let highlightTimeout: number | undefined;
let highlightRequestId = 0;
const SearchDialog =
  DefaultSearchDialog as ComponentType<
    DefaultSearchDialogProps & {
      onSelect?: (item: SearchItemType) => void;
    }
  >;

type PendingTarget = {
  path: string;
  hash: string;
  text: string;
  type: string;
  timestamp: number;
};

export function RootProvider({ children }: { children: ReactNode }) {
  return (
    <FumadocsRootProvider search={{ SearchDialog: SearchDialogWithTarget }}>
      <SearchTargetHighlighter />
      {children}
    </FumadocsRootProvider>
  );
}

function SearchDialogWithTarget(props: DefaultSearchDialogProps) {
  return <SearchDialog {...props} onSelect={rememberSelectedTarget} />;
}

function rememberSelectedTarget(item: SearchItemType) {
  if (!("url" in item) || item.external) return;

  const text = getPlainText(item.content);
  if (!text) return;

  const url = new URL(item.url, window.location.href);
  const target: PendingTarget = {
    path: url.pathname,
    hash: url.hash,
    text,
    type: item.type,
    timestamp: Date.now(),
  };

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(target));
  window.dispatchEvent(new Event(SEARCH_TARGET_EVENT));
}

function SearchTargetHighlighter() {
  const pathname = usePathname();

  useEffect(() => {
    const run = () => {
      scheduleHighlightPendingTarget();
    };

    run();
    window.addEventListener("hashchange", run);
    window.addEventListener(SEARCH_TARGET_EVENT, run);

    return () => {
      window.removeEventListener("hashchange", run);
      window.removeEventListener(SEARCH_TARGET_EVENT, run);
    };
  }, [pathname]);

  return null;
}

function scheduleHighlightPendingTarget() {
  highlightRequestId++;

  if (highlightTimeout) window.clearTimeout(highlightTimeout);

  const requestId = highlightRequestId;
  highlightTimeout = window.setTimeout(() => {
    void highlightPendingTarget(requestId);
  }, 80);
}

async function highlightPendingTarget(requestId: number) {
  const pending = readPendingTarget();
  if (!pending) return;

  if (Date.now() - pending.timestamp > 10_000) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }

  if (window.location.pathname !== pending.path) return;
  if (pending.hash && window.location.hash !== pending.hash) return;

  await waitForScrollToSettle();
  if (requestId !== highlightRequestId) return;
  if (window.location.pathname !== pending.path) return;
  if (pending.hash && window.location.hash !== pending.hash) return;

  removeExistingFlashes();

  const target = getHashTarget(pending.hash);
  const searchRoots = getSearchRoots(target, pending.type);
  const match = findTextMatch(searchRoots, pending.text);

  if (!match) return;

  const scrollTarget = getMatchElement(match);
  const shouldScroll = !isMostlyVisible(scrollTarget);
  sessionStorage.removeItem(STORAGE_KEY);

  if (shouldScroll) {
    scrollTarget.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    await waitForScrollToSettle();
    if (requestId !== highlightRequestId) return;
  }

  if (isMatchConnected(match)) flashTextMatch(match);
}

function readPendingTarget(): PendingTarget | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PendingTarget;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function getPlainText(content: unknown): string {
  if (typeof content !== "string") return "";

  const element = document.createElement("div");
  element.innerHTML = content;

  return (element.textContent ?? content)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function getHashTarget(hash: string): HTMLElement | null {
  if (!hash) return null;

  return document.getElementById(decodeURIComponent(hash.slice(1)));
}

function getSearchRoots(target: HTMLElement | null, type: string): Node[] {
  const prose = document.querySelector(".prose");

  if (!target) return prose ? [prose] : [document.body];
  if (type !== "text") return [target];

  const heading = target.closest("h1,h2,h3,h4,h5,h6");
  if (!heading) return [target];

  const level = getHeadingLevel(heading);
  const roots: Node[] = [];
  let next = heading.nextElementSibling;

  while (next) {
    if (isHeading(next) && getHeadingLevel(next) <= level) break;

    roots.push(next);
    next = next.nextElementSibling;
  }

  return roots.length > 0 ? roots : [heading];
}

function getHeadingLevel(element: Element) {
  return Number(element.tagName.slice(1));
}

function isHeading(element: Element) {
  return /^H[1-6]$/.test(element.tagName);
}

type TextMatch =
  | {
      type: "text";
      node: Text;
      start: number;
      end: number;
    }
  | {
      type: "element";
      element: HTMLElement;
    };

function findTextMatch(roots: Node[], text: string): TextMatch | null {
  const needle = normalizeText(text);
  if (!needle) return null;

  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest(".fd-search-text-flash")) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node = walker.nextNode();

    while (node) {
      const range = findNormalizedRange(node.textContent ?? "", needle);
      if (range) {
        return {
          type: "text",
          node: node as Text,
          start: range.start,
          end: range.end,
        };
      }

      node = walker.nextNode();
    }

    const element = findElementTextMatch(root, needle);
    if (element) {
      return {
        type: "element",
        element,
      };
    }
  }

  return null;
}

function findElementTextMatch(root: Node, needle: string): HTMLElement | null {
  const elements = getTextElements(root);

  for (const element of elements) {
    if (normalizeText(element.textContent ?? "").includes(needle)) {
      return element;
    }
  }

  return null;
}

function getTextElements(root: Node): HTMLElement[] {
  if (!(root instanceof HTMLElement)) return [];

  const selector = "p,li,td,th,blockquote,figcaption,h1,h2,h3,h4,h5,h6";
  const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));

  if (root.matches(selector)) elements.unshift(root);

  return elements;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function findNormalizedRange(value: string, needle: string) {
  const map: number[] = [];
  let normalized = "";
  let previousWasSpace = true;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (/\s/.test(char)) {
      if (!previousWasSpace) {
        normalized += " ";
        map.push(i);
      }

      previousWasSpace = true;
      continue;
    }

    normalized += char.toLowerCase();
    map.push(i);
    previousWasSpace = false;
  }

  normalized = normalized.trimEnd();

  const index = normalized.indexOf(needle);
  if (index === -1) return null;

  const last = index + needle.length - 1;

  return {
    start: map[index],
    end: map[last] + 1,
  };
}

function flashTextMatch(match: TextMatch) {
  if (match.type === "element") return flashElement(match.element);
  const parent = match.node.parentElement;

  const range = document.createRange();
  range.setStart(match.node, match.start);
  range.setEnd(match.node, match.end);

  const span = document.createElement("span");
  span.className = "fd-search-text-flash";
  span.dataset.searchFlashWrapper = "true";
  span.style.setProperty(
    "--fd-search-text-color",
    getComputedStyle(match.node.parentElement ?? document.body).color,
  );

  try {
    range.surroundContents(span);
  } catch {
    if (parent) return flashElement(parent);
    throw new Error("Unable to flash search result text.");
  }

  const cleanup = () => unwrap(span);
  span.addEventListener("animationend", cleanup, { once: true });
  window.setTimeout(cleanup, 2_100);

  return span;
}

function getMatchElement(match: TextMatch) {
  if (match.type === "element") return match.element;

  return match.node.parentElement ?? document.body;
}

function isMatchConnected(match: TextMatch) {
  if (match.type === "element") return match.element.isConnected;

  return match.node.isConnected;
}

function flashElement(element: HTMLElement) {
  element.classList.add("fd-search-text-flash");
  element.dataset.searchFlashElement = "true";
  element.style.setProperty(
    "--fd-search-text-color",
    getComputedStyle(element).color,
  );

  const cleanup = () => {
    element.classList.remove("fd-search-text-flash");
    element.style.removeProperty("--fd-search-text-color");
    delete element.dataset.searchFlashElement;
  };

  element.addEventListener("animationend", cleanup, { once: true });
  window.setTimeout(cleanup, 2_100);

  return element;
}

function removeExistingFlashes() {
  document.querySelectorAll("[data-search-flash-wrapper]").forEach((element) => {
    unwrap(element);
  });
  document
    .querySelectorAll<HTMLElement>("[data-search-flash-element]")
    .forEach((element) => {
      element.classList.remove("fd-search-text-flash");
      element.style.removeProperty("--fd-search-text-color");
      delete element.dataset.searchFlashElement;
    });
}

function unwrap(element: Element) {
  element.replaceWith(...Array.from(element.childNodes));
}

function isMostlyVisible(element: Element) {
  const rect = element.getBoundingClientRect();

  return rect.top >= 96 && rect.bottom <= window.innerHeight - 32;
}

async function waitForScrollToSettle() {
  await sleep(prefersReducedMotion() ? 80 : 180);

  return new Promise<void>((resolve) => {
    const maxWaitMs = prefersReducedMotion() ? 250 : 1_400;
    const stableFrameTarget = prefersReducedMotion() ? 3 : 8;
    const start = performance.now();
    let lastX = window.scrollX;
    let lastY = window.scrollY;
    let stableFrames = 0;

    const check = () => {
      const currentX = window.scrollX;
      const currentY = window.scrollY;
      const didMove =
        Math.abs(currentX - lastX) > 0.5 || Math.abs(currentY - lastY) > 0.5;

      if (didMove) {
        stableFrames = 0;
        lastX = currentX;
        lastY = currentY;
      } else {
        stableFrames++;
      }

      if (
        stableFrames >= stableFrameTarget ||
        performance.now() - start >= maxWaitMs
      ) {
        resolve();
        return;
      }

      window.requestAnimationFrame(check);
    };

    window.requestAnimationFrame(check);
  });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
