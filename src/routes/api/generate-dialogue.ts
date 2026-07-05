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

type SpeakerRole = "host" | "collector";
type DialogueTurn = { role: SpeakerRole; text: string };
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

function getInstructions(role: SpeakerRole, style: "saudi_colloquial" | "formal_fusha" = "saudi_colloquial") {
  if (style === "formal_fusha") {
    return `أدِّ النص التالي بأسلوب إعلان جامعي رسمي، بصوت فصيح وواضح، ونبرة وقورة وهادئة، كما لو كان الإعلان يُلقى في قاعة أكاديمية أثناء مناقشة رسالة علمية.

- الإلقاء بالكامل باللغة العربية الفصحى، دون أي لهجة عامية.
- إلقاء رسمي مهيب، بوضوح كامل في مخارج الحروف، وتوازن في السرعة، دون استعجال أو مبالغة في الانفعال.
- التزم بالوقفات المضمّنة في النص:
  [وقفة قصيرة] = توقف خفيف.
  [وقفة متوسطة] = توقف أوضح قبل الانتقال للفكرة التالية.
  [وقفة طويلة] = توقف رسمي لإبراز أهمية الجملة أو القرار.
  لا تنطق كلمة "وقفة" ولا الأقواس، بل التزم صمتاً بمقدارها.
- عند قراءة الأسماء والدرجات العلمية اجعل النبرة أكثر احتراماً ورسمية.
- عند إعلان النتيجة النهائية ارفع الوقار في الصوت قليلاً، وامنح عبارة "ممتاز مع مرتبة الشرف الأولى" إبرازاً واضحاً ومؤثراً.
- يجب أن يكون الأداء إلقاءً احتفالياً رصيناً داخل جامعة، لا قراءة خبر عادي ولا إعلاناً تجارياً.

انطق النص كما هو حرفياً دون أي مقدمات أو أسماء متحدثين، ودون حذف أو اختصار أو إضافة.`;
  }

  const roleLine =
    role === "host"
      ? "أنت المذيع فقط. تحدث كمذيع بودكاست سعودي عفوي ومثقف، بصوت واثق وترحيبي."
      : "أنت المحصل فقط. تحدث كمحصل سعودي واقعي وعملي، بصوت مباشر وهادئ وقريب من الناس.";

  return `🚨 تعليمات إلزامية غير قابلة للتجاوز - أي مخالفة = فشل كامل وإعادة التوليد.

أولاً - اللهجة (إلزامي 100%):
- يُمنع منعاً باتاً استخدام اللغة العربية الفصحى في أي جزء من الحوار، ولا حتى في كلمة واحدة.
- يجب أن يكون الحوار بالكامل من أول كلمة إلى آخر كلمة باللهجة السعودية العامية البسيطة المتداولة في المجالس والمكالمات اليومية.
- أي كلمة فصيحة حوّلها تلقائياً إلى مقابلها العامي السعودي مع الحفاظ على نفس المعنى تماماً.
- ممنوع خلط العامية بالفصحى ولو في جملة واحدة، وممنوع الانتقال من العامية للفصحى في أي موضع.

ثانياً - الأداء:
- لا تقرأ النص كمقال أو خطاب أو نشرة أخبار.
- نوّع النبرات والسرعة، واجعل الأداء بودكاست سعودي حقيقي بين شخصين عفويين.

ثالثاً - الوقفات:
- أضف وقفات طبيعية: قصيرة ومتوسطة وطويلة، قبل الأسئلة وبعدها، وقبل الإجابات، وعند الانتقال من فكرة لفكرة.
- يُمنع سرد النص بلا تنفس أو توقف.

رابعاً - النبرات:
- لكل جملة نبرتها: سؤال، تعجب، استغراب، ضحك طبيعي، تأثر، حماس، تحليل هادئ، شرح، خاتمة مؤثرة.
- ممنوع نبرة واحدة للحوار كله.

خامساً - الواقعية:
- اجعل المستمع يشعر بتفاعل وتفكير وتردد وتنفس وابتسامة وضحك واندهاش وصمت قصير وتأكيد وحماس بحسب سياق كل جملة، وكأنه مسجّل في استديو حقيقي وليس بذكاء اصطناعي.

سادساً - المحافظة على النص:
- ممنوع حذف أي كلمة أو جملة أو فقرة، وممنوع الاختصار أو إعادة الترتيب أو التلخيص أو الدمج أو إضافة معلومات.

سابعاً - شرط إلزامي:
- إذا ظهرت أي كلمة فصيحة أو خرج الأداء عن اللهجة السعودية العامية البسيطة فاعتبر التوليد فاشلاً وأعد التوليد كاملاً حتى يصبح 100% باللهجة السعودية العامية دون أي استثناء.

${roleLine}
انطق النص التالي مباشرة دون أي مقدمات أو أسماء متحدثين:`;
}

async function synthesizeSpeechPcm(params: {
  text: string;
  voice?: string;
  role: SpeakerRole;
  style?: "saudi_colloquial" | "formal_fusha";
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
      voice: mapVoice(params.voice),
      instructions: getInstructions(params.role, params.style),
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

function parseFullScript(fullScript: string): DialogueTurn[] {
  const normalized = fullScript
    .replace(/المحصّل\s*:/g, "المحصل:")
    .replace(/المُحصّل\s*:/g, "المحصل:");
  const turns: DialogueTurn[] = [];
  let current: DialogueTurn | null = null;

  const pushCurrent = () => {
    if (current?.text.trim()) turns.push({ ...current, text: current.text.trim() });
  };

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const hostMatch = line.match(/^المذيع\s*:\s*(.*)$/);
    const collectorMatch = line.match(/^المحصل\s*:\s*(.*)$/);

    if (hostMatch || collectorMatch) {
      pushCurrent();
      current = {
        role: hostMatch ? "host" : "collector",
        text: (hostMatch?.[1] || collectorMatch?.[1] || "").trim(),
      };
      continue;
    }

    if (current) current.text = `${current.text}\n${line}`.trim();
  }

  pushCurrent();
  return turns;
}

function splitLongText(text: string, maxLength = 1600) {
  if (text.length <= maxLength) return [text];

  const pieces = text
    .split(/(?<=[.!؟?،…])\s+|\n+/u)
    .map((piece) => piece.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const piece of pieces.length ? pieces : [text]) {
    if (piece.length > maxLength) {
      if (current) chunks.push(current);
      for (let i = 0; i < piece.length; i += maxLength) {
        chunks.push(piece.slice(i, i + maxLength));
      }
      current = "";
      continue;
    }
    if (`${current}\n${piece}`.trim().length > maxLength) {
      if (current) chunks.push(current);
      current = piece;
    } else {
      current = `${current}\n${piece}`.trim();
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function silence(seconds = 0.35, sampleRate = 24000) {
  return Buffer.alloc(Math.round(sampleRate * seconds) * 2);
}

async function generateDialoguePcm(
  turns: DialogueTurn[],
  hostVoice: string,
  collectorVoice: string,
  style?: "saudi_colloquial" | "formal_fusha",
) {
  const jobs: { text: string; voice: string; role: SpeakerRole }[] = [];
  for (const turn of turns) {
    const voice = turn.role === "host" ? hostVoice : collectorVoice;
    for (const text of splitLongText(turn.text)) {
      jobs.push({ text, voice, role: turn.role });
    }
  }

  const results = await Promise.all(
    jobs.map((j) => synthesizeSpeechPcm({ text: j.text, voice: j.voice, role: j.role, style })),
  );

  const buffers: Buffer[] = [];
  const gap = silence();
  for (const pcm of results) {
    buffers.push(pcm, gap);
  }
  return Buffer.concat(buffers);
}

export const Route = createFileRoute("/api/generate-dialogue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { hostText, hostVoice, collectorText, collectorVoice, fullScript, style } =
            await request.json();
          const styleValue: "saudi_colloquial" | "formal_fusha" =
            style === "formal_fusha" ? "formal_fusha" : "saudi_colloquial";

          if (
            !fullScript &&
            (!hostText || !String(hostText).trim() || !collectorText || !String(collectorText).trim())
          ) {
            return Response.json(
              { error: "الرجاء كتابة نص المذيع ونص المحصل لتوليد الحوار كامل." },
              { status: 400 },
            );
          }

          const hv = hostVoice || "Charon";
          const cv = collectorVoice || "Fenrir";

          let combined: Buffer;

          if (fullScript) {
            const turns = parseFullScript(String(fullScript));
            if (!turns.length) {
              return Response.json(
                { error: "يجب أن يحتوي النص الكامل على المتحدثين: المذيع والمحصل فقط." },
                { status: 400 },
              );
            }
            combined = await generateDialoguePcm(turns, hv, cv, styleValue);
          } else {
            combined = await generateDialoguePcm(
              [
                { role: "host", text: String(hostText) },
                { role: "collector", text: String(collectorText) },
              ],
              hv,
              cv,
              styleValue,
            );
          }

          const wav = encodeWav(combined);
          return new Response(new Uint8Array(wav), {
            headers: { "Content-Type": "audio/wav" },
          });
        } catch (error: any) {
          console.error("generate-dialogue error:", error);
          const msg = String(error?.message || error || "");
          const isQuota =
            msg.includes("429") ||
            msg.toLowerCase().includes("quota") ||
            msg.toLowerCase().includes("exhausted");
          const status = typeof error?.status === "number" ? error.status : isQuota ? 429 : 500;
          return Response.json(
            { error: error?.message || "حدث خطأ أثناء توليد الحوار المشترك." },
            { status },
          );
        }
      },
    },
  },
});
