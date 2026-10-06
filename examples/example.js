const input = document.getElementById("url");
const log = document.getElementById("log");
input.value = `${location.protocol}//127.0.0.1:${location.port}/examples/mock-frame.html`;

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
