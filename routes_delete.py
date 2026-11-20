from database import lock_participant_for_removal
from database import utc_naive, commit_checked, validate_period, validate_assignment, task_reason, reward_task_id, adjust_task_score, analyze_for_api, create_validated_task, SYSTEM_STATUSES
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from db import get_db
from database import require_employee_access, restrict_user_ids
from database import User, TaskStatus, Tag, Task, TaskTag, RewardType, Reward, Competition, Participant
from dependencies import get_current_user, require_admin, require_manager

router = APIRouter(prefix="", tags=["DELETE"])

@router.delete("/users/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_own_account(
        current_user: dict = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    user = current_user["user"]

    tasks = db.query(Task).filter(Task.user_id == user.id).all()
    for task in tasks:
        db.delete(task)

    # db.query(Board).filter(Board.user_id == user.id).delete()
    # db.query(Category).filter(Category.user_id == user.id).delete()

    db.query(Reward).filter(Reward.user_id == user.id).delete()

    db.query(Participant).filter(Participant.user_id == user.id).delete()
    db.query(Task).filter(Task.user_id == user.id).delete()

    db.query(Participant).filter(Participant.user_id == user.id).delete()
    db.delete(user)
    commit_checked(db)
    return

@router.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_by_admin(
    user_id: int,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    tasks = db.query(Task).filter(Task.user_id == user_id).all()
    for task in tasks:
        db.delete(task)

    # db.query(Board).filter(Board.user_id == user_id).delete()
    # db.query(Category).filter(Category.user_id == user_id).delete()

    db.query(Reward).filter(Reward.user_id == user_id).delete()

    db.query(Task).filter(Task.user_id == user_id).delete()

    db.query(Participant).filter(Participant.user_id == user.id).delete()
    db.delete(user)
    commit_checked(db)
    return

# @router.delete("/boards/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
# def delete_board(
#         board_id: int
#      ,
#         current_user: dict = Depends(get_current_user),
#         db: Session = Depends(get_db)
# ):
#     # board = db.query(Board).filter(
#     #     Board.id == board_id,
#     #     Board.user_id == current_user["user"].id
#     # ).first()
#     if not board:
#         raise HTTPException(status_code=404, detail="Board не найден или не принадлежит вам")
#
#     db.query(Task).filter(Task.board_id == board_id).delete()
#
#     db.delete(board)
#     commit_checked(db)
#     return

@router.delete("/task-statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_status(status_id: int, current_user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    status = db.query(TaskStatus).filter_by(id=status_id).first()
    if not status:
        raise HTTPException(404, "Статус не найден")
    if status.code in SYSTEM_STATUSES or db.query(Task).filter_by(status_id=status_id).first():
        raise HTTPException(409, "Системный или используемый статус нельзя удалить")
    db.delete(status)
    commit_checked(db)

# @router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
# def delete_category(
#         category_id: int
#      ,
#         current_user: dict = Depends(get_current_user),
#         db: Session = Depends(get_db)
# ):
#     category = db.query(Category).filter(
#         Category.id == category_id,
#         Category.user_id == current_user["user"].id
#     ).first()
#     if not category:
#         raise HTTPException(status_code=404, detail="Category не найдена или не принадлежит вам")
#
#     db.delete(category)
#     commit_checked(db)
#     return

@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(
        tag_id: int,
        current_user: dict = Depends(require_admin),
        db: Session = Depends(get_db)
):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag не найден")

    db.query(TaskTag).filter(TaskTag.tag_id == tag_id).delete()

    db.delete(tag)
    commit_checked(db)
    return

@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    query = restrict_user_ids(db.query(Task).filter_by(id=task_id), Task.user_id, current_user["user"], allow_self=True)
    task = query.with_for_update().first()
    if not task:
        raise HTTPException(404, "Задача не найдена")
    status = db.query(TaskStatus).filter_by(id=task.status_id).first()
    if (status and status.code == "done") or db.query(Reward).filter_by(user_id=task.user_id, reason=task_reason(task.id)).first():
        raise HTTPException(409, "Выполненную задачу с начислением нельзя удалить")
    db.query(TaskTag).filter_by(task_id=task.id).delete()
    db.delete(task)
    commit_checked(db)


@router.delete("/manager/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_by_manager(task_id: int, current_user: dict = Depends(require_manager), db: Session = Depends(get_db)):
    query = restrict_user_ids(db.query(Task).filter_by(id=task_id), Task.user_id, current_user["user"])
    task = query.with_for_update().first()
    if not task:
        raise HTTPException(404, "Задача не найдена")
    status = db.query(TaskStatus).filter_by(id=task.status_id).first()
    if (status and status.code == "done") or db.query(Reward).filter_by(user_id=task.user_id, reason=task_reason(task.id)).first():
        raise HTTPException(409, "Выполненную задачу с начислением нельзя удалить")
    db.query(TaskTag).filter_by(task_id=task.id).delete()
    db.delete(task)
    commit_checked(db)

@router.delete("/reward-types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reward_type(type_id: int, current_user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    rt = db.query(RewardType).filter_by(id=type_id).first()
    if not rt:
        raise HTTPException(404, "Тип награды не найден")
    if rt.code == "bonus1" or db.query(Reward).filter_by(type_id=type_id).first():
        raise HTTPException(409, "Системный или используемый тип награды нельзя удалить")
    db.delete(rt)
    commit_checked(db)

@router.delete("/rewards/{reward_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reward(reward_id: int, current_user: dict = Depends(require_manager), db: Session = Depends(get_db)):
    query = restrict_user_ids(db.query(Reward).filter_by(id=reward_id), Reward.user_id, current_user["user"])
    reward = query.with_for_update().first()
    if not reward:
        raise HTTPException(404, "Награда не найдена")
    task_id = reward_task_id(reward.reason)
    if task_id is not None or (reward.reason or "").startswith("Корректировка счёта соревнования"):
        raise HTTPException(409, "Системное начисление нельзя удалять вручную")
    db.delete(reward)
    commit_checked(db)

@router.delete("/competitions/{competition_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_competition(competition_id: int, current_user: dict = Depends(require_manager), db: Session = Depends(get_db)):
    comp = db.query(Competition).filter_by(id=competition_id).with_for_update().first()
    if not comp:
        raise HTTPException(404, "Соревнование не найдено")
    if db.query(Task).filter_by(competition_id=competition_id).first():
        raise HTTPException(409, "Соревнование содержит задачи; удаление приведёт к потере истории")
    db.query(Participant).filter_by(competition_id=competition_id).delete()
    db.delete(comp)
    commit_checked(db)

@router.delete("/participants/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_participant(
    participant_id: int,
    current_user: dict = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """Удаляет участника из соревнования по participant_id"""
    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Участник не найден")

    require_employee_access(current_user["user"], db.get(User, participant.user_id))
    participant = lock_participant_for_removal(db, participant)
    if db.query(Task).filter_by(user_id=participant.user_id, competition_id=participant.competition_id).first():
        raise HTTPException(409, "Сначала завершите работу с задачами участника; история должна сохраняться")
    db.delete(participant)
    commit_checked(db)
    return

@router.delete("/participants/competition/{competition_id}/user/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_participant_by_competition_and_user(
    competition_id: int,
    user_id: int,
    current_user: dict = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """Удаляет участника из соревнования по competition_id и user_id"""
    participant = db.query(Participant).filter(
        Participant.competition_id == competition_id,
        Participant.user_id == user_id
    ).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Участник не найден")

    require_employee_access(current_user["user"], db.get(User, participant.user_id))
    participant = lock_participant_for_removal(db, participant)
    if db.query(Task).filter_by(user_id=participant.user_id, competition_id=participant.competition_id).first():
        raise HTTPException(409, "Сначала завершите работу с задачами участника; история должна сохраняться")
    db.delete(participant)
    commit_checked(db)
    return