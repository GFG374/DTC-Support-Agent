from fastapi import APIRouter, Depends, HTTPException

from ..core.auth import User, get_current_user
from ..db.repo import Repository, get_repo

router = APIRouter(tags=["orders"])


@router.get("/orders/{order_id}")
async def get_order(
    order_id: str,
    user: User = Depends(get_current_user),
    repo: Repository = Depends(get_repo),
):
    order = repo.get_order(user.user_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("/seed")
async def seed(
    user: User = Depends(get_current_user), repo: Repository = Depends(get_repo)
):
    """Create a sample order for quick demos."""
    return repo.seed_mock_order(user.user_id)
