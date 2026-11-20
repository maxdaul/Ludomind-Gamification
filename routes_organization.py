from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import Department, Position, User, commit_checked
from db import get_db
from dependencies import require_admin
from schemas import OrganizationEntryInput, OrganizationEntryResponse, OrganizationResponse


router = APIRouter(prefix="/admin/organization", tags=["Корпоративные справочники"],
                   dependencies=[Depends(require_admin)])


class Directory(str, Enum):
    positions = "positions"
    departments = "departments"


DIRECTORIES = {
    Directory.positions: (Position, User.position_id),
    Directory.departments: (Department, User.department_id),
}


def get_entry(db, model, entry_id):
    entry = db.get(model, entry_id)
    if entry is None:
        raise HTTPException(404, "Запись справочника не найдена")
    return entry


def ensure_unique_name(db, model, name, entry_id=None):
    query = db.query(model.id).filter(func.lower(model.name) == func.lower(name))
    if entry_id is not None:
        query = query.filter(model.id != entry_id)
    if query.first():
        raise HTTPException(409, "Запись с таким названием уже существует")


@router.get("", response_model=OrganizationResponse)
def list_organization(db: Session = Depends(get_db)):
    return {directory.value: db.query(model).order_by(func.lower(model.name), model.id).all()
            for directory, (model, _) in DIRECTORIES.items()}


@router.post("/{directory}", status_code=status.HTTP_201_CREATED, response_model=OrganizationEntryResponse)
def create_entry(directory: Directory, payload: OrganizationEntryInput, db: Session = Depends(get_db)):
    model, _ = DIRECTORIES[directory]
    ensure_unique_name(db, model, payload.name)
    entry = model(name=payload.name)
    db.add(entry)
    commit_checked(db)
    db.refresh(entry)
    return entry


@router.put("/{directory}/{entry_id}", response_model=OrganizationEntryResponse)
def update_entry(directory: Directory, entry_id: int, payload: OrganizationEntryInput, db: Session = Depends(get_db)):
    model, _ = DIRECTORIES[directory]
    entry = get_entry(db, model, entry_id)
    ensure_unique_name(db, model, payload.name, entry.id)
    entry.name = payload.name
    commit_checked(db)
    db.refresh(entry)
    return entry


@router.delete("/{directory}/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(directory: Directory, entry_id: int, db: Session = Depends(get_db)):
    model, user_field = DIRECTORIES[directory]
    entry = get_entry(db, model, entry_id)
    if db.query(User.id).filter(user_field == entry.id).first():
        raise HTTPException(409, "Сначала измените или снимите назначение у связанных пользователей")
    db.delete(entry)
    commit_checked(db)
