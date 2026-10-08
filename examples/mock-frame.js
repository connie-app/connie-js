// The iframe side of the protocol, as the real SignPage implements it.
const params = new URLSearchParams(location.search);
const embedId = params.get("embed_id");
// The real page posts to the session's declared origin; the mock uses the example host.
const hostOrigin = params.get("origin") || `http://localhost:${location.port}`;

document.getElementById("embed-id").textContent = embedId || "(none: not opened by connie-js)";

// The frame never draws a close button. Framed by connie-js, the right 56px
// of the header band stay empty for connie-js's.
if (embedId) document.body.classList.add("framed");

const post = (type, payload) =>
  window.parent.postMessage({ source: "connie-js", v: 1, embedId, type, payload }, hostOrigin);

const on = (id, fn) => document.getElementById(id).addEventListener("click", fn);

on("signed", () => post("signed"));
on("expired", () => post("error", { code: "expired", message: "This signing link has expired." }));
on("no-credits", () =>
  post("error", { code: "no_credits", message: "This SignPage cannot be signed right now." }),
);
on("navigate", () => post("navigate", { url: `${location.origin}/examples/index.html?eid=1` }));
on("navigate-evil", () => post("navigate", { url: "https://evil.example/" }));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") post("close");
});

const readyAfter = Number(params.get("ready_after")) || 0;
if (embedId) setTimeout(() => post("ready", { title: "Mock SignPage" }), readyAfter);
