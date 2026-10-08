const input = document.getElementById("url");
const log = document.getElementById("log");
const query = new URLSearchParams(location.search);
input.value = `${location.protocol}//127.0.0.1:${location.port}/examples/mock-frame.html?ready_after=${
  query.get("ready_after") || 1500
}`;

const record = (label, text) => (detail) => {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()} ${label}: ${text}${
    detail ? " " + JSON.stringify(detail) : ""
  }`;
  log.prepend(item);
};

const callbacks = (label) => ({
  onReady: record(label, "ready"),
  onSigned: record(label, "signed"),
  onClose: record(label, "close"),
  onError: record(label, "error"),
});

document.getElementById("open-url").addEventListener("click", () => {
  Connie.openSignPage({ url: input.value, ...callbacks("url") });
});

document.getElementById("open-fetch").addEventListener("click", () => {
  Connie.openSignPage({
    fetchUrl: () => new Promise((resolve) => setTimeout(() => resolve(input.value), 1000)),
    ...callbacks("fetchUrl"),
  });
});

document.getElementById("open-two").addEventListener("click", () => {
  Connie.openSignPage({ url: input.value, ...callbacks("first") });
  Connie.openSignPage({ url: input.value, ...callbacks("second") });
});

// ?hostile loads a stylesheet with the rules an aggressive host page might
// ship, and opens a SignPage at once, since it hides this page's own buttons.
if (query.has("hostile")) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "hostile.css";
  link.addEventListener("load", () => {
    Connie.openSignPage({ url: input.value, ...callbacks("hostile") });
  });
  document.head.append(link);
}
