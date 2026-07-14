import { createFileRoute } from "@tanstack/react-router";

function encodeWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const buffer = Buffer.alloc(44 + pcm.length);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcm.length, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(pcm.length, 40);
  pcm.copy(buffer, 44);
  return buffer;
}

type OpenAiVoice =
  | "alloy"
  | "ash"
  | "ballad"
  | "coral"
  | "echo"
  | "fable"
  | "nova"
  | "onyx"
  | "sage"
  | "shimmer"
  | "verse";

const VOICE_MAP: Record<string, OpenAiVoice> = {
  Charon: "onyx",
  Fenrir: "ash",
  Kore: "echo",
  Zephyr: "alloy",
  Orus: "onyx",
  Enceladus: "fable",
  Iapetus: "echo",
  Umbriel: "sage",
  Algieba: "verse",
  Algenib: "onyx",
  Rasalgethi: "ash",
  Achernar: "alloy",
  Alnilam: "echo",
  Schedar: "sage",
  Gacrux: "onyx",
  Achird: "verse",
  Zubenelgenubi: "alloy",
  Sadachbia: "fable",
  Sadaltager: "ash",
  Puck: "nova",
  Leda: "shimmer",
  Aoede: "coral",
  Callirrhoe: "sage",
  Autonoe: "verse",
  Despina: "shimmer",
  Erinome: "coral",
  Laomedeia: "nova",
  Pulcherrima: "coral",
  Vindemiatrix: "sage",
  Sulafat: "shimmer",
};

function mapVoice(voice?: string): OpenAiVoice {
  return (voice && VOICE_MAP[voice]) || "alloy";
}

function extractGatewayMessage(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message || parsed?.message || raw;
  } catch {
    return raw;
  }
}

async function synthesizeSpeechPcm(params: {
  text: string;
  voice?: string;
  role?: string;
  instructions: string;
}): Promise<Buffer> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    const error = new Error("مفتاح Lovable AI غير مهيأ في المشروع.") as Error & { status?: number };
    error.status = 500;
    throw error;
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input: params.text,
      // الأصوات ثابتة: المذيع رجالي ناضج، والمحصّل شاب سعودي في العشرينات
      voice: (params as any).role === "collector" ? "verse" : "onyx",
      instructions: params.instructions,
      response_format: "pcm",
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
          const roleLine =
            role === "host"
              ? "تحدث بنبرة مذيع بودكاست سعودي عفوي ومثقف، باللهجة السعودية العامية البسيطة المتداولة."
              : "تحدث بنبرة محصّل سعودي واقعي وعملي، باللهجة السعودية العامية البسيطة القريبة من لغة الشارع اليومية.";

          const promptPrefix = `🚨 تعليمات إلزامية - أي مخالفة = فشل كامل:
- يُمنع منعاً باتاً استخدام اللغة العربية الفصحى أو أي كلمة رسمية، ولو في كلمة واحدة.
- النطق بالكامل باللهجة السعودية العامية البسيطة من أول كلمة لآخر كلمة، وأي كلمة فصيحة حوّلها لمقابلها العامي السعودي بنفس المعنى.
- ممنوع خلط العامية بالفصحى أو الانتقال بينهما في أي موضع.
- نوّع النبرات (سؤال، تعجب، استغراب، تأثر، حماس، شرح، خاتمة) ولا تستخدم نبرة واحدة للنص كله.
- أضف وقفات طبيعية قصيرة ومتوسطة وطويلة، وتنفس وابتسامة وتفاعل حقيقي كأنك في استديو بودكاست لا ذكاء اصطناعي.
- ممنوع حذف أو اختصار أو إعادة ترتيب أو دمج أو إضافة أي كلمة. النص يُنطق كما هو حرفياً.
${roleLine}
انطق النص التالي مباشرة دون أي إضافات:`;

          const pcm = await synthesizeSpeechPcm({
            text: String(text),
            voice,
            role,
            instructions: promptPrefix,
          });
          const wav = encodeWav(pcm);
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
