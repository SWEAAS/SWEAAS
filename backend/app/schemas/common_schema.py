"""Common schema primitives."""

from pydantic import BaseModel


class MessageResponse(BaseModel):
    message: str
