const { TextEncoder, TextDecoder } = require("util");
const { webcrypto } = require("crypto");

// Polyfill TextEncoder/TextDecoder for jsdom
if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Polyfill crypto.subtle for jsdom
// jsdom provides a window.crypto but it lacks subtle in older Node versions
Object.defineProperty(global, "crypto", {
  value: webcrypto,
  writable: true,
  configurable: true,
});
