import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

export interface BrowserToolOptions {
  headless: boolean;
  workspaceRoot: string;
}

class BrowserSession {
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(private readonly options: BrowserToolOptions) {}

  async ensurePage(): Promise<Page> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.options.headless });
    }
    if (!this.page) {
      this.page = await this.browser.newPage();
    }
    return this.page;
  }

  async close(): Promise<void> {
    await this.page?.close();
    await this.browser?.close();
    this.page = null;
    this.browser = null;
  }
}

export function createBrowserTools(options: BrowserToolOptions) {
  const session = new BrowserSession(options);

  return {
    async navigate(url: string): Promise<{ url: string; title: string }> {
      const page = await session.ensurePage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return { url: page.url(), title: await page.title() };
    },

    async snapshot(): Promise<{ url: string; title: string; text: string }> {
      const page = await session.ensurePage();
      const text = await page.evaluate(() => document.body?.innerText ?? "");
      return {
        url: page.url(),
        title: await page.title(),
        text: text.slice(0, 6000),
      };
    },

    async click(selector: string): Promise<{ clicked: string }> {
      const page = await session.ensurePage();
      await page.click(selector, { timeout: 5000 });
      return { clicked: selector };
    },

    async type(selector: string, text: string, submit?: boolean): Promise<{ typed: string }> {
      const page = await session.ensurePage();
      await page.fill(selector, text, { timeout: 5000 });
      if (submit) {
        await page.press(selector, "Enter");
      }
      return { typed: selector };
    },

    async screenshot(relativePath: string): Promise<{ path: string }> {
      const page = await session.ensurePage();
      const targetPath = path.resolve(options.workspaceRoot, relativePath);
      const relative = path.relative(options.workspaceRoot, targetPath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Screenshot path escapes workspace: ${relativePath}`);
      }
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await page.screenshot({ path: targetPath, fullPage: true });
      return { path: targetPath };
    },

    async close(): Promise<{ closed: true }> {
      await session.close();
      return { closed: true };
    },
  };
}

export type BrowserTools = ReturnType<typeof createBrowserTools>;
