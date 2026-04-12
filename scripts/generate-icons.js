const sharp = require("sharp");
const path = require("path");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#252422"/>
  <text x="256" y="312" font-family="monospace" font-size="200" font-weight="700" text-anchor="middle" fill="#e8e4dc">at</text>
</svg>`;

const sizes = [
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
];

async function generate() {
  for (const { name, size } of sizes) {
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, "..", "public", name));
    console.log(`Generated ${name} (${size}x${size})`);
  }
}

generate().catch(console.error);
