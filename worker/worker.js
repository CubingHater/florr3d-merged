let backend = "";

export default {
  async fetch(request) {
    if (!backend) {
      return new Response("Server offline", { status: 503 });
    }

    const url = new URL(request.url);
    const target = new URL(backend);

    target.pathname = url.pathname;
    target.search = url.search;

    const newRequest = new Request(target, request);

    return fetch(newRequest);
  }
}; 