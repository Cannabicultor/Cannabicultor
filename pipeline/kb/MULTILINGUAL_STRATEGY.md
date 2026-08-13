# Estrategia multilingüe — Cannabicultor IA RAG

## Principio

**Salida siempre en español. Inglés como ventaja técnica interna.**

El usuario hispanohablante nunca ve chunks en inglés. El LLM sintetiza evidencia EN en voz Cannabicultor.

## Retrieval

```
score_final = similitud_vectorial × Peso_prioridad_retrieval × factor_idioma_retrieval
```

| Condición | factor_idioma_retrieval |
|-----------|-------------------------|
| idioma_contenido = es | 1.0 |
| politica_idioma = en_prioritario | 0.85 |
| politica_idioma = en_aceptado | 0.80 |
| politica_idioma = es_prioritario + EN | 0.75 |
| Fuera de corpus | 0.0 |

- Embeddings: multilingües (OpenAI `text-embedding-3-large` o equivalente).
- Filtro duro de idioma solo si la query lleva intent `principiantes` → `lang_es`.
- Sin filtro duro en L7, L5, L8.

## Generación (Worker)

```
Los fragmentos marcados respuesta_requiere_traduccion están en inglés.
Sintetízalos en español. No cites texto literal en inglés.
Responde con autoridad de cultivador con 30 años de experiencia.
```

## Política por cluster

| Cluster | Política |
|---------|----------|
| L7 Ciencia | EN activo |
| L5 Nutrición | EN activo |
| L8 Extracción | EN prioritario |
| L1 Principiantes | Solo ES |
| L6 Cáñamo | Solo ES |
| L2/L3/L4 | ES primero, EN selectivo |

## Columnas catálogo (v2.2)

| Columna | Uso en pipeline |
|---------|-----------------|
| idioma_contenido | Metadata de chunk |
| politica_idioma | Reglas editoriales + logs |
| factor_idioma_retrieval | Multiplicador en retrieval |

## Tags idioma

- `lang_es`, `lang_en`, `lang_pt`, `lang_mixto`
- `respuesta_requiere_traduccion` — docs EN en corpus
- `evidencia_internacional` — EN de alto valor (L7/L5/L8)
- `contexto_hispano` — ES con relevancia regional