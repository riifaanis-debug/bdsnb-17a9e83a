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

const QAF_RULE = `\n\nCRITICAL PRONUNCIATION RULE (MANDATORY): Pronounce every Arabic letter ق (qaf) as the Saudi colloquial hard "g" sound (like گ / English "g" in "go"), NEVER as the classical Fusha qaf. Examples: قال→gaal, قلت→gult, وقت→wagt, حقك→haggak, صدق→sidg, فوق→foog, تحقيق→tahgeeg, وثيقة→watheega, حقوق→hgoog. Apply to EVERY word containing ق without exception. Any classical qaf is a production error.`;

function getPrompt(text: string, role?: string) {
  if (role === "host") {
    return `Read the following text aloud in warm, lively Saudi colloquial Arabic as a friendly Saudi man in his early thirties (المذيع). Deliver it with a warm smile in your voice, genuine charm, and a playful, joking energy as if talking to a close friend. Laugh softly where the mood feels light, vary your tone with curiosity and delight, and keep the rhythm natural and conversational. Pronounce the speaker label clearly if present. Do not add any introduction or commentary.${QAF_RULE}\n\n${text}`;
  }
  if (role === "collector") {
    return `Read the following text aloud in warm, lively Saudi colloquial Arabic as a young Saudi man in his twenties (المحصّل). Be playful, confident, and full of character — joke, tease, and laugh naturally as if face-to-face with a good friend. Vary your tone: raise energy with a sharp, joking edge for warnings or strong statements; soften with a smile and a short laugh for lighter moments. Use natural pauses and breaths. Pronounce the speaker label clearly if present. Do not add any introduction or commentary.${QAF_RULE}\n\n${text}`;
  }
  if (role === "youth") {
    return `Read the following text aloud in warm, simple natural Saudi colloquial Arabic (لهجة سعودية عامية بسيطة). You are a shy, polite young Saudi man, 19-20 years old, with a soft, gentle, warm voice and a friendly, bashful smile. Light, happy laughter is fine where the text feels playful. Keep a calm, relaxed pace, slightly slower than normal; low-to-medium volume; natural short breaths and small pauses between sentences. Never sound aggressive, loud, dramatic, formal, or like a news anchor. Do not add any introduction or commentary — speak the text only.${QAF_RULE}\n\n${text}`;
  }
  return `Read the following text aloud in warm, lively Saudi colloquial Arabic. Deliver it with a friendly smile in your voice and a playful, joking tone as if chatting with a close friend. Laugh naturally where the mood is light, vary your tone, and keep the rhythm conversational. Do not add any introduction or commentary.${QAF_RULE}\n\n${text}`;
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
            voice ||
            (role === "collector" ? "Achird" : role === "youth" ? "Enceladus" : "Charon");

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
