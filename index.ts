import sharp from "sharp";

async function createAvatarGrid(buffers: Buffer[]): Promise<Buffer> {
  const size = 100;
  const totalSlots = 4;

  const placeholdersNeeded = totalSlots - buffers.length;
  const placeholders = await Promise.all(
    Array.from({ length: placeholdersNeeded }).map(() =>
      createGradientPlaceholder(size, size)
    )
  );

  const resized = await Promise.all([
    ...buffers.map((buf) => sharp(buf).resize(size, size).png().toBuffer()),
    ...placeholders,
  ]);

  const canvas = sharp({
    create: {
      width: 2 * size,
      height: 2 * size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  });

  return canvas
    .composite([
      { input: resized[0], top: 0, left: 0 },
      { input: resized[1], top: 0, left: size },
      { input: resized[2], top: size, left: 0 },
      { input: resized[3], top: size, left: size },
    ])
    .png()
    .toBuffer();
}

async function createGradientPlaceholder(width: number, height: number): Promise<Buffer> {
  const start = randomRGB();
  const end = randomRGB();

  const pixels = Buffer.alloc(width * height * 4); // RGBA

  for (let y = 0; y < height; y++) {
    const t = y / height;
    const r = Math.round(lerp(start.r, end.r, t));
    const g = Math.round(lerp(start.g, end.g, t));
    const b = Math.round(lerp(start.b, end.b, t));

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      pixels[idx + 0] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = 255;
    }
  }

  return sharp(pixels, {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();
}

function randomRGB() {
  return {
    r: Math.floor(Math.random() * 180),
    g: Math.floor(Math.random() * 180),
    b: Math.floor(Math.random() * 180),
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/") {
      const file = Bun.file("index.html");
      return new Response(file, { headers: { "Content-Type": "text/html" } });
    }

    if (req.method === "POST" && url.pathname === "/upload") {
      const formData = await req.formData();
      const files = formData.getAll("avatars").filter(f => f instanceof File) as File[];

      if (files.length === 0 || files.length > 4) {
        return new Response("Upload between 1 and 4 images", { status: 400 });
      }

      const buffers = await Promise.all(
        files.map(async (file) => Buffer.from(await file.arrayBuffer()))
      );

      try {
        const result = await createAvatarGrid(buffers);
        return new Response(result, {
          headers: { "Content-Type": "image/png" },
        });
      } catch (err) {
        console.error("Error generating image:", err);
        return new Response("Error generating image", { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log("Running at http://localhost:3000");
