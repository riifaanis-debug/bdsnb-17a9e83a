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

function decodeWavPcm(wav: Buffer): { pcm: Buffer; sampleRate: number } {
  let offset = 12;
  let sampleRate = 24000;
  while (offset < wav.length) {
    const chunkId = wav.toString("ascii", offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    if (chunkId === "fmt ") {
      sampleRate = wav.readUInt32LE(offset + 12);
    } else if (chunkId === "data") {
      return {
        pcm: wav.subarray(offset + 8, offset + 8 + chunkSize),
        sampleRate,
      };
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  throw new Error("Invalid WAV: data chunk not found");
}

type SpeakerRole = "host" | "collector";
type DialogueTurn = { role: SpeakerRole; text: string };

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

function getPrompt(
  role: SpeakerRole,
  text: string,
  style: "saudi_colloquial" | "formal_fusha" = "saudi_colloquial",
) {
  const qafRule = `\n\nCRITICAL PRONUNCIATION RULE (MANDATORY): Pronounce every Arabic letter ق (qaf) as the Saudi colloquial hard "g" sound (like گ / English "g" in "go"), NEVER as the classical Fusha qaf. Examples: قال→gaal, قلت→gult, وقت→wagt, حقك→haggak, صدق→sidg, فوق→foog, تحقيق→tahgeeg, وثيقة→watheega, حقوق→hgoog, قانوني→gaanooni. Apply this to EVERY word containing ق without exception. Any classical qaf pronunciation is a production error. Keep all other letters in their natural Saudi colloquial form.`;

  if (style === "formal_fusha") {
    return `أدِ النص التالي بأسلوب إعلان مسرحي رسمي مهيب باللغة العربية الفصحى، بصوت مقدّم سعودي محترف في أوائل الثلاثينات. الأداء يجب أن يكون حيّاً ومتنوّع النبرات، ليس بنبرة واحدة رتيبة أبداً.

توجيهات الأداء الإلزامية:
- نوّع النبرة والإيقاع بين الجمل: ابدأ بنبرة رسمية هادئة واثقة، ثم ارفع الطبقة والحماس تدريجياً عند ذكر الإنجازات والأسماء والنتيجة.
- عند الجمل التمهيدية: نبرة وقورة متأنية منخفضة قليلاً.
- عند ذكر اسم الطالب/الباحث ولقبه: ارفع الصوت بوضوح مع فخر واعتزاز.
- عند إعلان النتيجة أو القرار (مثل: قبول الرسالة، بامتياز، مع مرتبة الشرف): اجعلها ذروة الأداء برفع واضح في الطبقة والحماس والنبرة الاحتفالية.
- بعد الذروة: اهبط قليلاً بنبرة تهنئة دافئة.
- غيّر السرعة: أبطئ عند الجمل المهمة والأسماء، وأسرع قليلاً في الجمل الوصفية.
- استخدم تشديداً واضحاً على الكلمات المفتاحية (اللجنة، الرسالة، القرار، الإجماع، بامتياز).
- التزم بالوقفات المكتوبة [وقفة قصيرة/متوسطة/طويلة] كصمت فعلي دون نطق كلمة "وقفة".
- تنفّس بشكل طبيعي بين الجمل الطويلة.

ممنوع: النبرة الرتيبة الواحدة، أو القراءة الآلية، أو أي مقدمة أو تعليق خارج النص. انطق النص حرفياً كما هو.

${text}`;
  }

  if (role === "host") {
    return `Read the following transcript aloud in warm, lively Saudi colloquial Arabic. You are the host (المذيع): a friendly, naturally charming Saudi man in his early thirties. Deliver every line with a warm smile in your voice, genuine friendliness, and a playful sense of humor as if you are joking with a close friend. Laugh softly where the text feels light or funny, let your tone rise and fall with curiosity and delight, and use relaxed, conversational pacing. Do not be monotone or robotic. Pronounce the speaker label clearly at the start, then continue naturally. Do not add any introduction, commentary, or extra words.${qafRule}

Transcript:\n${text}`;
  }

  return `Read the following transcript aloud in warm, lively Saudi colloquial Arabic. You are the collector (المحصّل): a young Saudi man in his twenties with a confident, playful, street-level Saudi personality. Let your voice be warm, charming, and full of character — joke, tease, and laugh naturally as if you are talking face-to-face with a good friend. Vary your tone: raise energy and add a sharp, joking edge for warnings or strong statements; soften with a smile and a short laugh for lighter moments. Use natural pauses, audible breaths, and playful rhythm. Do not be monotone or robotic. Pronounce the speaker label clearly at the start, then continue naturally. Do not add any introduction, commentary, or extra words.${qafRule}

Transcript:\n${text}`;
}

async function synthesizeSpeechWav(params: {
  text: string;
  voiceName: string;
  role: SpeakerRole;
  style?: "saudi_colloquial" | "formal_fusha";
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
              text: getPrompt(params.role, params.text, params.style),
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

function splitLongText(text: string, maxLength = 3000) {
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

async function generateDialogueAudio(
  turns: DialogueTurn[],
  hostVoice: string,
  collectorVoice: string,
  style?: "saudi_colloquial" | "formal_fusha",
) {
  type Job = { text: string; voiceName: string; role: SpeakerRole };
  const jobs: Job[] = [];

  for (const turn of turns) {
    const voiceName = turn.role === "host" ? hostVoice : collectorVoice;
    const label = turn.role === "host" ? "المذيع: " : "المحصّل: ";
    const chunks = splitLongText(turn.text);
    chunks.forEach((text, i) => {
      jobs.push({ text: i === 0 ? `${label}${text}` : text, voiceName, role: turn.role });
    });
  }

  // Run with limited concurrency to avoid gateway rate limits.
  const concurrency = 5;
  const wavs: Buffer[] = [];
  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    const batchWavs = await Promise.all(
      batch.map((j) =>
        synthesizeSpeechWav({
          text: j.text,
          voiceName: j.voiceName,
          role: j.role,
          style,
        }),
      ),
    );
    wavs.push(...batchWavs);
  }

  const first = decodeWavPcm(wavs[0]);
  const sampleRate = first.sampleRate;
  const gap = silence(0.35, sampleRate);
  const pcmBuffers: Buffer[] = [];

  for (const wav of wavs) {
    const { pcm } = decodeWavPcm(wav);
    pcmBuffers.push(pcm, gap);
  }

  return encodeWav(Buffer.concat(pcmBuffers), sampleRate);
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
          const cv = collectorVoice || "Achird";

          let combined: Buffer;

          if (fullScript) {
            const turns = parseFullScript(String(fullScript));
            if (!turns.length) {
              return Response.json(
                { error: "يجب أن يحتوي النص الكامل على المتحدثين: المذيع والمحصل فقط." },
                { status: 400 },
              );
            }
            combined = await generateDialogueAudio(turns, hv, cv, styleValue);
          } else {
            combined = await generateDialogueAudio(
              [
                { role: "host", text: String(hostText) },
                { role: "collector", text: String(collectorText) },
              ],
              hv,
              cv,
              styleValue,
            );
          }

          return new Response(new Uint8Array(combined), {
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
