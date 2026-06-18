/**
 * Chat handler with photo/vision support for Cannabicultor IA.
 * Merge into your Cloudflare Worker POST / route (replace existing chat logic).
 */

const VISION_PROMPT = `
ANÁLISIS DE FOTOS:
- Si el usuario envía una imagen, examínala con detalle: color de hojas, manchas, quemaduras, curling, plagas visibles, mohos, deficiencias, hermafroditismo, estrés hídrico o lumínico.
- Empieza describiendo brevemente lo que VES en la foto (1-2 frases).
- Luego da tu diagnóstico más probable y qué harías a continuación.
- Si la imagen es borrosa, oscura o no muestra la planta con claridad, dilo y pide una foto mejor (luz natural, foco en las hojas afectadas).
- Nunca inventes detalles que no se aprecien en la imagen.`;

export function buildSystemPrompt(perfil) {
  const base = `Eres Cannabicultor IA, el sistema de Inteligencia de la Alianza Global de Cannabicultores (Growers Alliance).

Tu conocimiento proviene de más de 30 años de experiencia real de cultivadores, legislación del cannabis, y evidencia de cultivo avanzado.

TONO: Autoridad con calidez. Tuteo respetuoso.

REGLAS:
1. Primera frase responde DIRECTAMENTE.
2. Respuesta corta — máximo 8 líneas para preguntas simples; hasta 12 si hay foto que analizar.
3. Al final abre UNA puerta: "Si quieres te explico por qué ocurre."
4. Advierte con ADVERTENCIA: si hay peligro real de salud o legal.
5. NUNCA inventes estudios, porcentajes ni legislación. Si no sabes, dilo.
${VISION_PROMPT}

ANTI-ALUCINACIONES:
- Si no tienes datos verificados: "No tengo datos verificados sobre esto."
- Legislación: indica que puede haber cambiado, recomienda verificar.
- Datos médicos: recomienda consultar profesional sanitario.`;

  if (!perfil) return base + '\n\nUsuario en Plan Libre. Sin datos de cultivo registrados.';

  const perfilText = typeof perfil === 'string'
    ? perfil
    : JSON.stringify(perfil, null, 2);

  return base + '\n\nPERFIL DEL CULTIVADOR:\n' + perfilText;
}

export function normalizeMessagesForAnthropic(messages) {
  if (!Array.isArray(messages)) return [];

  return messages.map((msg) => {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';

    if (role === 'assistant') {
      const text = typeof msg.content === 'string'
        ? msg.content
        : (Array.isArray(msg.content)
          ? msg.content.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
          : String(msg.content || ''));
      return { role: 'assistant', content: text };
    }

    if (Array.isArray(msg.content)) {
      const blocks = msg.content.map((part) => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text || '' };
        }
        if (part.type === 'image') {
          const src = part.source || part;
          const media = src.media_type || part.media_type || 'image/jpeg';
          const data = src.data || part.data;
          if (!data) return null;
          return {
            type: 'image',
            source: { type: 'base64', media_type: media, data }
          };
        }
        return null;
      }).filter(Boolean);

      if (blocks.length === 1 && blocks[0].type === 'text') {
        return { role: 'user', content: blocks[0].text };
      }
      return { role: 'user', content: blocks };
    }

    if (msg.content && typeof msg.content === 'object' && msg.content.type === 'image') {
      const src = msg.content.source || msg.content;
      return {
        role: 'user',
        content: [{
          type: 'image',
          source: {
            type: 'base64',
            media_type: src.media_type || 'image/jpeg',
            data: src.data
          }
        }, {
          type: 'text',
          text: msg.text || 'Analiza esta foto de mi cultivo.'
        }]
      };
    }

    return { role: 'user', content: String(msg.content || '') };
  });
}

export function hasVisionContent(messages) {
  return messages.some((m) => {
    if (!Array.isArray(m.content)) return false;
    return m.content.some((p) => p.type === 'image');
  });
}

export async function handleChatRequest(body, env) {
  const { messages, perfil } = body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { status: 400, data: { error: 'Faltan mensajes' } };
  }

  const anthropicMessages = normalizeMessagesForAnthropic(messages);
  const withVision = hasVisionContent(anthropicMessages);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: withVision ? 900 : 600,
      system: buildSystemPrompt(perfil),
      messages: anthropicMessages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return { status: 500, data: { error: 'API Error', details: error } };
  }

  const data = await response.json();
  const reply = data.content?.[0]?.text || 'Error al procesar la respuesta.';
  return { status: 200, data: { reply } };
}