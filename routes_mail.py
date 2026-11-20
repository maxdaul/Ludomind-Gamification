from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from dependencies import require_admin
from mail_yc_function import MailFunctionError, invoke_mail_function

router = APIRouter(prefix="/mail", tags=["mail"])


class MailBody(BaseModel):
    to: EmailStr
    subject: str = "Тест"
    message: str = ""
    html: Optional[str] = None
    from_email: Optional[str] = None


@router.post("/invoke")
def mail_invoke(body: MailBody, _: dict = Depends(require_admin)) -> dict[str, Any]:
    try:
        return invoke_mail_function(
            to_email=str(body.to),
            subject=body.subject,
            message=body.message,
            html=body.html,
            sender=body.from_email,
        )
    except MailFunctionError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e)) from e
