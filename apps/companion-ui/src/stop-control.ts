type StopOptions = {
  baseUrl: string;
  getToken: () => string;
  fetchImpl?: typeof fetch;
};

export function createStopHandler(options: StopOptions) {
  const fetcher = options.fetchImpl ?? fetch;

  return async function stopNow() {
    const token = options.getToken();

    return fetcher(`${options.baseUrl}/panic-stop`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: '{}',
    });
  };
}
