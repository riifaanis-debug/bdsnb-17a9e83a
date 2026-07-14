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
    return `أدِّ النص التالي بأسلوب إعلان جامعي رسمي حيّ وشيّق، بصوت فصيح واضح ومهيب، يشدّ انتباه السامع من أول جملة إلى آخرها.

- الإلقاء بالكامل باللغة العربية الفصحى، دون أي لهجة عامية.
- الإيقاع نشيط ومتوسط السرعة (لا بطيء ولا مسرِع)، بحيث يشعر السامع بالحيوية والحضور لا بالرتابة.
- نوّع النبرات بوضوح من جملة لأخرى: نبرة تقديم واثقة في الافتتاح، نبرة سرد هادئة في الوصف، نبرة تشويق ترتفع قبل إعلان النتيجة، ونبرة تفخيم وإعجاب عند ذكر التقدير.
- غيّر حدّة الصوت (Pitch) وارتفاع الصوت (Volume) بشكل طبيعي بين الجمل: اخفض قليلاً في الجُمل الاعتراضية والتفصيلية، وارفع الصوت والحدّة في الجُمل المحورية والقرارات وأسماء الأشخاص والدرجات العلمية.
- شدّد على الكلمات المفتاحية (الجمعية، الرسالة، اللجنة، القرار، القبول، التقدير)، وامنح كل اسم علم وقاراً واضحاً في النطق.
- التزم بالوقفات المضمّنة في النص:
  [وقفة قصيرة] = توقف خفيف.
  [وقفة متوسطة] = توقف أوضح قبل الانتقال للفكرة التالية.
  [وقفة طويلة] = توقف رسمي لإبراز أهمية الجملة أو القرار.
  لا تنطق كلمة "وقفة" ولا الأقواس، بل التزم صمتاً بمقدارها فقط ثم أكمل مباشرة.
- عند إعلان النتيجة النهائية ارفع الصوت والحدّة قليلاً وأبطئ النطق شيئاً يسيراً، وامنح عبارة "ممتاز، مع مرتبة الشرف الأولى" إبرازاً واضحاً ومؤثراً كأنها ذروة الإعلان.
- الأداء إلقاء احتفالي رصين حيّ، لا قراءة خبر عادي ولا إعلان تجاري ولا صوت آلي رتيب.

انطق النص كما هو حرفياً دون أي مقدمات أو أسماء متحدثين، ودون حذف أو اختصار أو إضافة.`;
  }

  const roleLine =
    role === "host"
      ? "أنت المذيع: رجل سعودي ناضج بصوت طبيعي هادئ وواثق، تتكلم بلهجة سعودية عامية بسيطة كأنك في مكالمة هاتفية حقيقية مع صاحبك. ابدأ بنطق كلمة «المذيع» بشكل طبيعي وسريع ثم أكمل."
      : "أنت المحصّل: شاب سعودي في العشرينات من عمره، صوتك شبابي وعفوي وطبيعي جداً، وتتكلم بلهجة سعودية عامية بسيطة 100٪ كأنها مكالمة هاتفية بينك وبين صاحبك. ابدأ بنطق كلمة «المحصّل» بشكل طبيعي وسريع ثم أكمل.";

  return `🚨 إلزامي: تكلّم باللهجة السعودية العامية البسيطة 100٪ من أول كلمة لآخر كلمة، كأنها مكالمة هاتفية طبيعية بين شخصين.

- ممنوع منعاً باتاً أي نطق فصيح أو أي لهجة غير سعودية، ولو في حرف واحد. أي كلمة فصيحة حوّلها فوراً لمقابلها العامي السعودي بنفس المعنى.
- ممنوع النبرة الرسمية أو الخطابية أو المسرحية أو الإعلانية أو الصوت الآلي.
- الإيقاع والسرعة طبيعيان تماماً كإيقاع المكالمة الهاتفية الحقيقية: لا بطيء ولا مسرِع، بدون مطّ في الحروف ولا صمت طويل.
- وقفات قصيرة وطبيعية بين الجمل فقط، مع تنفس عفوي.
- انطق الأسماء والكلمات بدقة كما وردت، بدون حذف أو اختصار أو إضافة.
- إذا خرجت أي كلمة بلهجة فصيحة أو غير سعودية، أعد نطقها فوراً بالعامية السعودية الصحيحة.

${roleLine}
انطق النص التالي كما هو مباشرة، بلهجة سعودية عامية طبيعية وإيقاع مكالمة هاتفية:`;
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
      // الأصوات ثابتة إلزامياً: المذيع رجالي ناضج (onyx)، والمحصّل شاب سعودي في العشرينات (ash)
      voice: params.role === "host" ? "onyx" : "ash",
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
    const label = turn.role === "host" ? "المذيع: " : "المحصّل: ";
    const chunks = splitLongText(turn.text);
    chunks.forEach((text, i) => {
      jobs.push({ text: i === 0 ? `${label}${text}` : text, voice, role: turn.role });
    });
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
