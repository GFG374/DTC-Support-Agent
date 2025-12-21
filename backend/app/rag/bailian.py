from typing import List, Dict
import json
import math
import re

import httpx

from app.core.config import settings
from app.core.supabase import get_supabase_admin_client

# Minimal KB fallback when Supabase has no data.
MOCK_KB = [
    {
        "title": "Return window",
        "content": "Customers can request a return within 30 days of delivery.",
        "source_id": "policy-001",
        "score": 0.92,
    },
    {
        "title": "Refund threshold",
        "content": "Orders under 50 CNY are auto-refunded; higher amounts require approval.",
        "source_id": "policy-002",
        "score": 0.88,
    },
    {
        "title": "Item condition",
        "content": "Returned items must be in good condition and include all tags.",
        "source_id": "policy-003",
        "score": 0.85,
    },
]


def _tokenize(query: str) -> List[str]:
    return [token for token in re.split(r"[\s,，]+", query.lower()) if token]


def _cosine_similarity(left: List[float], right: List[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return dot / (left_norm * right_norm)


def _embed_texts(texts: List[str]) -> List[List[float]]:
    if not settings.dashscope_api_key:
        return []
    payload = {
        "model": settings.dashscope_embedding_model,
        "input": {"texts": texts},
    }
    headers = {
        "Authorization": f"Bearer {settings.dashscope_api_key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding",
                headers=headers,
                json=payload,
            )
        resp.raise_for_status()
        data = resp.json()
        embeddings = data.get("output", {}).get("embeddings", [])
        embeddings.sort(key=lambda item: item.get("text_index", 0))
        return [item.get("embedding", []) for item in embeddings]
    except Exception:
        return []


def backfill_embeddings(limit: int = 200) -> int:
    client = get_supabase_admin_client()
    res = (
        client.table("rag_documents")
        .select("id, title, content, embedding")
        .filter("embedding", "is", "null")
        .limit(limit)
        .execute()
    )
    docs = res.data or []
    if not docs:
        return 0

    texts = [f"{doc.get('title', '')}\n{doc.get('content', '')}" for doc in docs]
    vectors = _embed_texts(texts)
    if not vectors or len(vectors) != len(docs):
        return 0

    updated = 0
    for doc, embedding in zip(docs, vectors):
        if not embedding:
            continue
        client.table("rag_documents").update({"embedding": embedding}).eq("id", doc["id"]).execute()
        updated += 1
    return updated


def search_policies(query: str, top_k: int = 3) -> List[Dict[str, object]]:
    client = get_supabase_admin_client()
    print(f"[rag] search_policies query={query} top_k={top_k}")
    res = (
        client.table("rag_documents")
        .select("title, content, category, source_id, metadata, embedding")
        .limit(200)
        .execute()
    )
    docs = res.data or []
    if not docs:
        print("[rag] no documents in rag_documents; using MOCK_KB")
        return MOCK_KB[:top_k]

    query_embedding = _embed_texts([query])
    if query_embedding and docs and all(doc.get("embedding") for doc in docs):
        scored = []
        for doc in docs:
            embedding = doc.get("embedding") or []
            if isinstance(embedding, str):
                try:
                    embedding = json.loads(embedding)
                except json.JSONDecodeError:
                    embedding = []
            score = _cosine_similarity(query_embedding[0], embedding) if embedding else 0.0
            scored.append(
                {
                    "title": doc.get("title"),
                    "content": doc.get("content"),
                    "category": doc.get("category"),
                    "source_id": doc.get("source_id"),
                    "metadata": doc.get("metadata") or {},
                    "score": round(score, 4),
                }
            )
        scored.sort(key=lambda item: item["score"], reverse=True)
        hits = scored[:top_k]
        print(f"[rag] vector_hits={[(h.get('title'), h.get('score')) for h in hits]}")
        return hits

    tokens = _tokenize(query)
    scored = []
    for doc in docs:
        text = f"{doc.get('title', '')} {doc.get('content', '')}".lower()
        hits = sum(1 for token in tokens if token and token in text)
        score = hits / max(len(tokens), 1)
        scored.append(
            {
                "title": doc.get("title"),
                "content": doc.get("content"),
                "category": doc.get("category"),
                "source_id": doc.get("source_id"),
                "metadata": doc.get("metadata") or {},
                "score": round(score, 3),
            }
        )

    scored.sort(key=lambda item: item["score"], reverse=True)
    hits = scored[:top_k]
    print(f"[rag] keyword_hits={[(h.get('title'), h.get('score')) for h in hits]}")
    return hits
