from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..core.auth import User, get_current_user
from ..db.repo import Repository, get_repo

router = APIRouter(tags=["approvals"])


class ApprovalUpdate(BaseModel):
    reason: str = ""


@router.get("/approvals")
async def list_approvals(
    user: User = Depends(get_current_user), repo: Repository = Depends(get_repo)
):
    return {"items": repo.list_approvals(user.user_id)}


@router.post("/approvals/{task_id}/approve")
async def approve(
    task_id: str,
    user: User = Depends(get_current_user),
    repo: Repository = Depends(get_repo),
):
    try:
        task = repo.update_approval_status(user.user_id, task_id, "approved")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"task": task}


@router.post("/approvals/{task_id}/reject")
async def reject(
    task_id: str,
    payload: ApprovalUpdate,
    user: User = Depends(get_current_user),
    repo: Repository = Depends(get_repo),
):
    try:
        task = repo.update_approval_status(
            user.user_id, task_id, "rejected", reason=payload.reason
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"task": task}
