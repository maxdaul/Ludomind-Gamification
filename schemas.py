import os
import re
from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr, ConfigDict, Field, computed_field, field_validator, field_serializer, model_validator
from typing import Literal, Optional, List

_SITE_USERNAME_RE = re.compile(r"^[a-z0-9_.@-]+$")


class ApiModel(BaseModel):
    @field_serializer('*', check_fields=False)
    def serialize_utc(self, value):
        if isinstance(value, datetime):
            return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
        return value

class UserCreate(ApiModel):
    first_name: str
    last_name: str
    username: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=72)

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Имя пользователя обязательно")
        if not _SITE_USERNAME_RE.fullmatch(s):
            raise ValueError(
                "Имя пользователя: только строчные латинские буквы, цифры и символы _ - . @"
            )
        return s

class UserResponse(ApiModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    first_name: str
    last_name: str
    username: str
    email: str
    role: Optional[str] = None
    current_competition_id: Optional[int] = None
    moodle_id: Optional[int] = None
    manager_id: Optional[int] = None
    position_id: Optional[int] = None
    department_id: Optional[int] = None

class UserLeaderboard(ApiModel):
    user_id: int
    model_config = ConfigDict(from_attributes=True)
    first_name: str
    last_name: str
    score: int

class AllUsersResponse(ApiModel):
    users: List[UserLeaderboard]

class UserCompetitionAssign(ApiModel):
    competition_id: Optional[int] = None


class MoodleCourseResponse(ApiModel):
    id: int
    fullname: str
    shortname: str


class MoodleEnrolRequest(ApiModel):
    user_id: int = Field(ge=1)
    course_id: int = Field(ge=1)


class MoodleCourseCompletionResponse(ApiModel):
    """Сводка по core_completion_get_course_completion_status (Moodle)."""

    completion_percent: float | None
    progress_basis: Literal["course_criteria", "activities", "unavailable"]
    completed_criteria: int
    total_criteria: int
    moodle_completed: bool
    course_id: int
    moodle_user_id: int


class UserUpdate(ApiModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(default=None, min_length=6, max_length=72)
    role: Optional[str] = None

class AdminUserUpdate(UserUpdate):
    manager_id: int | None = Field(default=None, ge=1)
    position_id: int | None = Field(default=None, ge=1, strict=True)
    department_id: int | None = Field(default=None, ge=1, strict=True)


class OrganizationEntryInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class OrganizationEntryResponse(OrganizationEntryInput):
    model_config = ConfigDict(from_attributes=True)
    id: int


class OrganizationResponse(BaseModel):
    positions: list[OrganizationEntryResponse]
    departments: list[OrganizationEntryResponse]


class TaskStatusCreate(ApiModel):
    code: str
    name: str

class TaskStatusUpdate(ApiModel):
    code: Optional[str] = None
    name: Optional[str] = None

class TaskStatusResponse(ApiModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str

class TagCreate(ApiModel):
    name: str

class TagUpdate(ApiModel):
    name: Optional[str] = None

class TagResponse(ApiModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str

class TaskTagCreate(ApiModel):
    task_id: int
    tag_id: int

class TaskInput(ApiModel):
    @field_validator('title', check_fields=False)
    @classmethod
    def nonblank_title(cls, value):
        if value is not None and not value.strip():
            raise ValueError("Название не может быть пустым")
        return value

class TaskCreate(TaskInput):
    status_id: int
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = Field(default=None, max_length=10000)
    ai_analysis_metadata: Optional[dict] = None
    estimated_points: Optional[int] = Field(default=None, ge=0, le=100)
    due_date: Optional[datetime] = None
    competition_id: Optional[int] = None

class TaskUpdate(TaskInput):
    status_id: Optional[int] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = Field(default=None, max_length=10000)
    ai_analysis_metadata: Optional[dict] = None
    estimated_points: Optional[int] = Field(default=None, ge=1, le=100)
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None

TASK_DIFFICULTY_MEDIUM_MIN = int(os.getenv("TASK_DIFFICULTY_MEDIUM_MIN", "25"))
TASK_DIFFICULTY_MEDIUM_MAX = int(os.getenv("TASK_DIFFICULTY_MEDIUM_MAX", "75"))
if not 1 < TASK_DIFFICULTY_MEDIUM_MIN <= TASK_DIFFICULTY_MEDIUM_MAX < 100:
    raise ValueError("Task difficulty thresholds must satisfy 1 < medium min <= medium max < 100")


class TaskResponse(ApiModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    status_id: int
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str]
    ai_analysis_metadata: Optional[dict]
    estimated_points: int
    awarded_points: int
    due_date: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    competition_id: Optional[int] = None
    tags: Optional[List[TagResponse]] = []

    @computed_field
    @property
    def difficulty(self) -> str | None:
        if not 1 <= self.estimated_points <= 100:
            return None
        if self.estimated_points < TASK_DIFFICULTY_MEDIUM_MIN:
            return "Лёгкая"
        if self.estimated_points <= TASK_DIFFICULTY_MEDIUM_MAX:
            return "Средняя"
        return "Сложная"


class RewardTypeCreate(ApiModel):
    code: str
    name: str
    description: Optional[str] = Field(default=None, max_length=10000)

class RewardTypeUpdate(ApiModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = Field(default=None, max_length=10000)

class RewardTypeResponse(ApiModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    description: Optional[str]

class RewardCreate(ApiModel):
    user_id: Optional[int] = Field(default=None, ge=1)
    type_id: int
    points_amount: int = Field(..., ge=0, le=1000000)
    reason: Optional[str] = None

class RewardUpdate(ApiModel):
    type_id: Optional[int] = None
    points_amount: Optional[int] = Field(default=None, ge=0, le=1000000)
    reason: Optional[str] = None

class RewardResponse(ApiModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    type_id: int
    points_amount: int
    awarded_at: datetime
    reason: Optional[str]

class CompetitionCreate(TaskInput):
    title: str = Field(..., min_length=1, max_length=500)
    start_date: datetime
    end_date: datetime

class CompetitionUpdate(TaskInput):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class CompetitionResponse(ApiModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str = Field(..., min_length=1, max_length=500)
    start_date: datetime
    end_date: datetime
    created_at: datetime
    updated_at: datetime

class CompetitionPendingTasksCount(ApiModel):
    competition_id: int
    pending_count: int

class Token(ApiModel):
    access_token: str
    token_type: str
    user: Optional[dict] = None

class TokenData(ApiModel):
    user_id: Optional[str] = None
    role: Optional[str] = None

class UserLogin(ApiModel):
    email: EmailStr
    password: str

class TaskTitleAndDate(ApiModel):
    model_config = ConfigDict(from_attributes=True)

    title: str = Field(..., min_length=1, max_length=500)
    due_date: Optional[datetime] = None

class CompetitionDatesResponse(ApiModel):
    start_date: datetime
    end_date: datetime

class ParticipantCreate(ApiModel):
    competition_id: int
    user_id: int
    score: Optional[int] = Field(default=0, ge=0, le=1000000)

class ParticipantUpdate(ApiModel):
    score: Optional[int] = Field(default=None, ge=0, le=1000000)

class ParticipantResponse(ApiModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    competition_id: int
    user_id: int
    score: int


class UserStatisticsResponse(ApiModel):
    total_competitions: int
    total_score: int
    completed_tasks_count: int
    wasted_tasks_count: int
    easy_tasks_count: int
    medium_tasks_count: int
    hard_tasks_count: int
    completed_with_tags_count: int
    medium_difficulty_min: int
    medium_difficulty_max: int