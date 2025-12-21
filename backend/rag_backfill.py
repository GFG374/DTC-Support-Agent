"""
Backfill embeddings for rag_documents using DashScope.

Usage (from backend/):
  python rag_backfill.py
"""
from app.rag import bailian


def main() -> None:
    updated = bailian.backfill_embeddings(limit=200)
    print(f"updated={updated}")


if __name__ == "__main__":
    main()
