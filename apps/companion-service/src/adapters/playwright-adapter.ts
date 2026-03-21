type BrowserLike = {
  close: () => Promise<void>;
};

type PlaywrightAdapterOptions = {
  browserFactory?: () => Promise<BrowserLike>;
};

export function createPlaywrightAdapter(options: PlaywrightAdapterOptions = {}) {
  const browserFactory = options.browserFactory ?? defaultBrowserFactory;

  return {
    async run<T>(action: (ctx: { browser: BrowserLike }) => Promise<T>, input: { timeoutMs: number }): Promise<T> {
      const browser = await browserFactory();
      try {
        return await withTimeout(action({ browser }), input.timeoutMs);
      } finally {
        await browser.close();
      }
    },
  };
}

async function defaultBrowserFactory(): Promise<BrowserLike> {
  throw new Error('playwright runtime not configured in this environment');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`playwright action timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
