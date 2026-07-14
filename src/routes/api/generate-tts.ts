import { createFileRoute } from "@tanstack/react-router";

const GEMINI_TTS_MODEL = "google/gemini-3.1-flash-tts-preview";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/audio/speech";

function extractGatewayMessage(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message || parsed?.message || raw;
  } catch {
    return raw;
  }
}

function getPrompt(text: string, role?: string) {
  if (role === "host") {
    return `Read the following text aloud in natural Saudi colloquial Arabic as a mature Saudi man (المذيع). Pronounce the speaker label clearly if present. Do not add any introduction or commentary.\n\n${text}`;
  }
  if (role === "collector") {
    return `Read the following text aloud in natural Saudi colloquial Arabic as a young Saudi man in his twenties (المحصّل). Vary tone naturally: raise energy for warnings or strong statements, lower for details. Pronounce the speaker label clearly if present. Do not add any introduction or commentary.\n\n${text}`;
  }
  return `Read the following text aloud in natural Saudi colloquial Arabic. Do not add any introduction or commentary.\n\n${text}`;
}

async function synthesizeSpeechWav(params: {
  text: string;
  voiceName: string;
  role?: string;
}): Promise<Buffer> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    const error = new Error("مفتاح Lovable AI غير مهيأ في المشروع.") as Error & {
      status?: number;
    };
    error.status = 500;
    throw error;
  }

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GEMINI_TTS_MODEL,
      stream_format: "audio",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: getPrompt(params.text, params.role),
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: params.voiceName,
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const message = extractGatewayMessage(await response.text().catch(() => ""));
    const error = new Error(message || "تعذر توليد الصوت من Lovable AI.") as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }

  return Buffer.from(await response.arrayBuffer());
}

export const Route = createFileRoute("/api/generate-tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { text, voice, role } = await request.json();
          if (!text || !String(text).trim()) {
            return Response.json({ error: "الرجاء إدخال النص أولاً" }, { status: 400 });
          }

          const voiceName =
            voice || (role === "collector" ? "Achird" : "Charon");

          const wav = await synthesizeSpeechWav({
            text: String(text),
            voiceName: String(voiceName),
            role: role ? String(role) : undefined,
          });

          return new Response(new Uint8Array(wav), {
            headers: { "Content-Type": "audio/wav" },
          });
        } catch (error: any) {
          console.error("generate-tts error:", error);
          const status = typeof error?.status === "number" ? error.status : 500;
          return Response.json(
            { error: error?.message || "حدث خطأ أثناء توليد الصوت." },
            { status },
          );
        }
      },
    },
  },
});
