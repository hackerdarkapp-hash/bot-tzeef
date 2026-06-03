import { logger } from "../lib/logger";

const DEEPAI_API_KEY = process.env["DEEPAI_API_KEY"];
const DEEPAI_BASE_URL = "https://api.deepai.org/api";

if (!DEEPAI_API_KEY) {
  logger.warn("DEEPAI_API_KEY is not set — image generation will fail");
}

export async function generateImage(prompt: string): Promise<Buffer> {
  const formData = new URLSearchParams();
  formData.append("text", prompt);

  const res = await fetch(`${DEEPAI_BASE_URL}/text2img`, {
    method: "POST",
    headers: {
      "api-key": DEEPAI_API_KEY ?? "",
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DeepAI text2img failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { output_url?: string; err?: string };

  if (json.err) throw new Error(`DeepAI error: ${json.err}`);
  if (!json.output_url) throw new Error("DeepAI returned no output_url");

  const imgRes = await fetch(json.output_url);
  if (!imgRes.ok) throw new Error("Failed to download generated image");

  const arrayBuffer = await imgRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function analyzeImage(imageUrl: string): Promise<{
  faces: number;
  age: string;
  gender: string;
  emotion: string;
  race: string;
}> {
  const res = await fetch(`${DEEPAI_BASE_URL}/facial-attribute-recognition`, {
    method: "POST",
    headers: {
      "api-key": DEEPAI_API_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image: imageUrl }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DeepAI facial recognition failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as {
    output?: {
      faces?: Array<{
        age?: number[];
        gender?: string;
        emotion?: string;
        race?: string;
      }>;
    };
    err?: string;
  };

  if (json.err) throw new Error(`DeepAI error: ${json.err}`);

  const faces = json.output?.faces ?? [];
  const count = faces.length;

  if (count === 0) {
    return {
      faces: 0,
      age: "—",
      gender: "—",
      emotion: "—",
      race: "—",
    };
  }

  const first = faces[0]!;
  const age = first.age
    ? `${Math.round((first.age[0]! + (first.age[1] ?? first.age[0]!)) / 2)}`
    : "—";

  return {
    faces: count,
    age,
    gender: first.gender ?? "—",
    emotion: first.emotion ?? "—",
    race: first.race ?? "—",
  };
}

export async function detectNsfw(imageUrl: string): Promise<{
  nsfw_score: number;
  output: string;
}> {
  const res = await fetch(`${DEEPAI_BASE_URL}/nsfw-detector`, {
    method: "POST",
    headers: {
      "api-key": DEEPAI_API_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image: imageUrl }),
  });

  if (!res.ok) {
    throw new Error(`NSFW detector failed: ${res.status}`);
  }

  const json = (await res.json()) as {
    output?: { nsfw_score?: number };
    err?: string;
  };

  if (json.err) throw new Error(`DeepAI NSFW error: ${json.err}`);

  return {
    nsfw_score: json.output?.nsfw_score ?? 0,
    output: `NSFW Score: ${((json.output?.nsfw_score ?? 0) * 100).toFixed(1)}%`,
  };
}
